// Tests de la sesión fabricada con la que una llave actúa como su persona.
//
// Lo que tiene que ser cierto, y por qué importa:
//  * la firma la verifica el mismo secreto y NINGÚN otro (si no, la base la aceptaría
//    de cualquiera, o la rechazaría siempre);
//  * dice "authenticated" y no "service_role": con service_role se salta la RLS, que
//    es justo la pared de la que depende todo esto;
//  * vive 60 segundos: un token filtrado de un log no sirve para mañana;
//  * el `sub` es un id de usuario de verdad.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { fabricarToken, SEGUNDOS_DE_VIDA } from "./como-usuario.ts";

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
  const token = await fabricarToken(USUARIO, SECRETO, AHORA);
  assertEquals(token.split(".").length, 3);
  assert(await firmaValida(token, SECRETO), "el propio secreto no verifica la firma");
  assert(!(await firmaValida(token, SECRETO + "x")), "otro secreto verificó la firma");
});

Deno.test("es una sesión de USUARIO de 60 s, nunca service_role", async () => {
  const [h, p] = (await fabricarToken(USUARIO, SECRETO, AHORA)).split(".");
  assertEquals(decodificar(h), { alg: "HS256", typ: "JWT" });
  const claims = decodificar(p);
  assertEquals(claims.sub, USUARIO);
  assertEquals(claims.role, "authenticated");
  assertEquals(claims.aud, "authenticated");
  assertEquals(claims.iat, AHORA);
  assertEquals(claims.exp, AHORA + 60);
  assertEquals(SEGUNDOS_DE_VIDA, 60);
});

Deno.test("sin secreto o con un sub que no es un id, no fabrica nada", async () => {
  await assertRejects(() => fabricarToken(USUARIO, "", AHORA));
  for (const sub of ["", "admin", "service_role", `${USUARIO}x`, "' or 1=1 --"]) {
    await assertRejects(() => fabricarToken(sub, SECRETO, AHORA), Error, undefined, `aceptó sub=${sub}`);
  }
});
