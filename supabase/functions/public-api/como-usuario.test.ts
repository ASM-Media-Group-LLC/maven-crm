// Tests de la sesión fabricada con la que una llave actúa como su persona.
//
// Lo que tiene que ser cierto, y por qué importa:
//  * la firma la verifica el mismo secreto y NINGÚN otro (si no, la base la aceptaría
//    de cualquiera, o la rechazaría siempre);
//  * dice "authenticated" y no "service_role": con service_role se salta la RLS, que
//    es justo la pared de la que depende todo esto;
//  * vive 60 segundos: un token filtrado de un log no sirve para mañana;
//  * el `sub` es un id de usuario de verdad;
//  * `mvf` va SIEMPRE (la base sabe que es una sesión fabricada) y `mvk` si y solo si
//    hay key: sin `mvk` la base no deja escribir en el chat, con `mvk` valida esa key;
//  * nunca user_metadata ni app_metadata (los escribe el usuario: la base no los mira).

import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { fabricarToken, SEGUNDOS_DE_VIDA } from "./como-usuario.ts";

const LLAVE = "7b2e4c1d-8a9f-4b3c-9d2e-1f0a3b4c5d6e";

const SECRETO = "secreto-de-prueba-que-no-es-el-de-verdad-0123456789";
const USUARIO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const AHORA = 1_790_000_000;

function decodificar(parte: string): Record<string, unknown> {
  const b64 = parte.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
}

async function firmaValida(token: string, secreto: string): Promise<boolean> {
  const [h, p, f] = token.split(".");
  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const b64 = f.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", clave, bytes, new TextEncoder().encode(`${h}.${p}`));
}

Deno.test("la firma la verifica el secreto, y otro secreto no", async () => {
  const token = await fabricarToken(USUARIO, SECRETO, LLAVE, AHORA);
  assertEquals(token.split(".").length, 3);
  assert(await firmaValida(token, SECRETO), "el propio secreto no verifica la firma");
  assert(!(await firmaValida(token, SECRETO + "x")), "otro secreto verificó la firma");
});

Deno.test("es una sesión de USUARIO de 60 s, nunca service_role", async () => {
  for (const llave of [null, LLAVE]) {
    const [h, p] = (await fabricarToken(USUARIO, SECRETO, llave, AHORA)).split(".");
    assertEquals(decodificar(h), { alg: "HS256", typ: "JWT" });
    const claims = decodificar(p);
    assertEquals(claims.sub, USUARIO);
    assertEquals(claims.role, "authenticated");
    assertEquals(claims.aud, "authenticated");
    assertEquals(claims.iat, AHORA);
    assertEquals(claims.exp, AHORA + 60);
  }
  assertEquals(SEGUNDOS_DE_VIDA, 60);
});

Deno.test("mvf SIEMPRE; mvk si y solo si hay key, con su id; nunca *_metadata ni nada más", async () => {
  // Sin key (el despachador de webhooks): mvf sin mvk = la base no lo deja escribir.
  const sin = decodificar((await fabricarToken(USUARIO, SECRETO, null, AHORA)).split(".")[1]);
  assertEquals(sin, { sub: USUARIO, role: "authenticated", aud: "authenticated", iat: AHORA, exp: AHORA + 60, mvf: true });
  assert(!("mvk" in sin), "un token sin key trae mvk");
  // Con key: mvf y mvk de PRIMER nivel (la base lee request.jwt.claims ->> 'mvk').
  const con = decodificar((await fabricarToken(USUARIO, SECRETO, LLAVE, AHORA)).split(".")[1]);
  assertEquals(con, { sub: USUARIO, role: "authenticated", aud: "authenticated", iat: AHORA, exp: AHORA + 60, mvf: true, mvk: LLAVE });
  // En minúsculas: es el texto que la base compara con api_keys.id.
  const mayus = decodificar((await fabricarToken(USUARIO, SECRETO, LLAVE.toUpperCase(), AHORA)).split(".")[1]);
  assertEquals(mayus.mvk, LLAVE);
  for (const claims of [sin, con]) {
    for (const k of Object.keys(claims)) assert(!/metadata/i.test(k), `el token trae ${k}`);
    assertEquals(claims.mvf, true);
  }
});

Deno.test("una llave que no es un id no fabrica nada (ni un mvk raro llega a la base)", async () => {
  for (const llave of ["", "BLU", `${LLAVE}x`, "' or 1=1 --", "00000000-0000-0000-0000-00000000000g"]) {
    await assertRejects(() => fabricarToken(USUARIO, SECRETO, llave, AHORA), Error, undefined, `aceptó llave=${llave}`);
  }
});

Deno.test("sin secreto o con un sub que no es un id, no fabrica nada", async () => {
  await assertRejects(() => fabricarToken(USUARIO, "", null, AHORA));
  for (const sub of ["", "admin", "service_role", `${USUARIO}x`, "' or 1=1 --"]) {
    await assertRejects(() => fabricarToken(sub, SECRETO, LLAVE, AHORA), Error, undefined, `aceptó sub=${sub}`);
  }
});
