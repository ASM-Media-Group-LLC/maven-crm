// La salida de los webhooks, por comportamiento. El envío se prueba contra una
// conexión falsa que contesta lo que le pidamos (o se corta, o se cuelga): así se
// puede ver QUÉ bytes salieron, a QUÉ IP, y qué se decide con cada respuesta, sin
// abrir una conexión de verdad.
// Correr: deno test supabase/functions/_shared/webhook-salida.test.ts

import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import {
  abrirSecreto,
  type Conectar,
  type Conexion,
  crearConectar,
  CUERPO_MAX,
  cuerpoDelTimbre,
  cuerpoDePrueba,
  type DatosDelTimbre,
  decidir,
  direccionesPublicas,
  encabezadosFirmados,
  enviarWebhook,
  ErrorDeTls,
  ESPERAS_S,
  firmar,
  generarSecreto,
  HORIZONTE_MS,
  ipEsPublica,
  kekConfigurada,
  leerRetryAfter,
  normalizarUrlDeWebhook,
  proximoIntento,
  type MotivoUrl,
  type Red,
  type Resolvedor,
  sellarSecreto,
  type TlsSinHandshake,
  vencioElHorizonte,
  Vencido,
} from "./webhook-salida.ts";
import { ALLOWED_ORIGINS } from "./cors.ts";
import { codificarCursor, decodificarCursor } from "../public-api/messenger-formato.ts";

// ─── 1. la URL ───────────────────────────────────────────────────────────────

Deno.test("URL: acepta una https normal y devuelve el href normalizado", () => {
  const r = normalizarUrlDeWebhook("  https://Hooks.Integrador.EXAMPLE.com:443/maven/abc?x=1  ");
  assertEquals(r, { ok: true, href: "https://hooks.integrador.example.com/maven/abc?x=1", host: "hooks.integrador.example.com" });
});

Deno.test("URL: sin camino queda con /; el dominio internacional va en punycode", () => {
  assertEquals(normalizarUrlDeWebhook("https://integrador.com"), { ok: true, href: "https://integrador.com/", host: "integrador.com" });
  const r = normalizarUrlDeWebhook("https://bücher.de/x");
  assert(r.ok && r.host === "xn--bcher-kva.de", JSON.stringify(r));
});

const rechazos: Array<[string, MotivoUrl]> = [
  ["http://integrador.com/x", "no_https"],
  ["ftp://integrador.com/x", "no_https"],
  ["https://integrador.com:8443/x", "puerto"],
  ["https://integrador.com:80/x", "puerto"],
  ["https://user:pass@integrador.com/x", "usuario"],
  ["https://ok.com@169.254.169.254/x", "usuario"],
  ["https://integrador.com/x#frag", "fragmento"],
  ["https://integrador.com/#", "fragmento"],
  ["https://integrador.com/" + "a".repeat(2100), "muy_larga"],
  ["https://127.0.0.1/x", "ip_literal"],
  ["https://0x7f000001/x", "ip_literal"],
  ["https://2130706433/x", "ip_literal"],
  ["https://127.1/x", "ip_literal"],
  ["https://[::1]/x", "ip_literal"],
  ["https://[::ffff:a9fe:a9fe]/x", "ip_literal"],
  ["https://169.254.169.254/latest/meta-data", "ip_literal"],
  ["https://integrador.com./x", "host_invalido"],
  ["https://intranet/x", "host_invalido"],
  ["https://-malo.com/x", "host_invalido"],
  ["https://localhost/x", "host_invalido"],
  ["https://api.localhost/x", "host_prohibido"],
  ["https://metadata.google.internal/x", "host_prohibido"],
  ["https://servidor.local/x", "host_prohibido"],
  ["https://nas.home.arpa/x", "host_prohibido"],
  ["https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send", "host_prohibido"],
  ["https://otro-proyecto.supabase.co/x", "host_prohibido"],
  ["https://app.maven-ai.me/x", "host_prohibido"],
  ["https://maven-ai.me/x", "host_prohibido"],
  ["https://maven.asmtech.ai/x", "host_prohibido"],
  ["https://evolution.147-93-3-97.nip.io/x", "host_prohibido"],
  ["https://10-0-0-1.sslip.io/x", "host_prohibido"],
  ["https://mavenv3-x.traefik.me/x", "host_prohibido"],
  ["https://of.unlok.me/x", "host_prohibido"],
  ["https://integrador.com/?q=\\x", "url_invalida"],
  ["no es una url", "url_invalida"],
  ["", "url_invalida"],
];
for (const [entrada, motivo] of rechazos) {
  Deno.test(`URL: rechaza ${entrada.slice(0, 60)} (${motivo})`, () => {
    const r = normalizarUrlDeWebhook(entrada);
    assertEquals(r.ok, false);
    assertEquals(!r.ok && r.motivo, motivo);
  });
}

Deno.test("URL: lo que se parece a nuestro dominio pero no es, pasa (sufijo por etiqueta, no por texto)", () => {
  assert(normalizarUrlDeWebhook("https://notmaven-ai.me/x").ok);
  assert(normalizarUrlDeWebhook("https://mysupabase.co/x").ok);
  assert(normalizarUrlDeWebhook("https://nip.io.integrador.com/x").ok);
});

Deno.test("URL: todo href aceptado cumple la forma que exige la base", () => {
  const baseHost = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const u of [
    "https://integrador.com/a b", "https://integrador.com/ñandú?x=é", "https://INTEGRADOR.com/%20x",
    "https://integrador.com/a\\b", "https://sub.integrador.co.uk/p?a=1&b=2", "https://integrador.com/<script>",
  ]) {
    const r = normalizarUrlDeWebhook(u);
    if (!r.ok) continue;
    assertMatch(r.href, /^https:\/\/[!-~]+$/, u);
    assert(!r.href.includes("\\") && !r.href.includes("#"), u);
    assertMatch(r.host, baseHost, u);
    assert(r.href.startsWith(`https://${r.host}/`), u);
  }
});

// ─── 2. las IPs ──────────────────────────────────────────────────────────────

const publicas = [
  "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.0",
  "192.169.0.1", "198.17.255.255", "198.20.0.0", "223.255.255.255",
  "2606:4700:4700::1111", "2001:4860:4860::8888", "2a00:1450:4001:80b::200e", "2001:200::1",
  "64:ff9b::808:808", // NAT64 de 8.8.8.8
];
const privadas = [
  "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254",
  "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.1",
  "198.18.0.1", "198.19.255.255", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.255.255.255", "240.0.0.1",
  "255.255.255.255", "147.93.3.97",
  "::", "::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "::ffff:a9fe:a9fe", "::127.0.0.1", "64:ff9b::7f00:1",
  "64:ff9b::a9fe:a9fe", "64:ff9b:1::1", "2002:7f00:1::1", "2002:0808:0808::1", "2001::1", "2001:0:4136:e378::1",
  "2001:db8::1", "2001:10::1", "3fff::1", "100::1", "fc00::1", "fd12:3456::1", "fe80::1", "fec0::1",
  "ff02::1", "fe80::1%eth0",
];
const basura = ["", "abc", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.-1", "1:2:3:4:5:6:7:8:9", "1::2::3", ":1::", "12345::1", "1.2.3.4 ", "::g"];

Deno.test("IP: las públicas pasan", () => {
  for (const ip of publicas) assert(ipEsPublica(ip), `debería ser pública: ${ip}`);
});
Deno.test("IP: privadas, reservadas, mapeadas, NAT64 hacia adentro, 6to4, Teredo y la del VPS: no pasan", () => {
  for (const ip of privadas) assert(!ipEsPublica(ip), `no debería pasar: ${ip}`);
});
Deno.test("IP: lo que no es una IP válida no pasa", () => {
  for (const ip of basura) assert(!ipEsPublica(ip), `no debería pasar: ${JSON.stringify(ip)}`);
});
Deno.test("IP: los bordes de cada rango de IPv4", () => {
  const bordes: Array<[string, boolean]> = [
    ["9.255.255.255", true], ["10.0.0.0", false], ["11.0.0.0", true],
    ["126.255.255.255", true], ["128.0.0.0", true],
    ["169.253.255.255", true], ["169.255.0.0", true],
    ["192.167.255.255", true], ["192.169.0.0", true],
    ["223.255.255.255", true], ["224.0.0.0", false],
  ];
  for (const [ip, esperado] of bordes) assertEquals(ipEsPublica(ip), esperado, ip);
});

// ─── 3. el DNS ───────────────────────────────────────────────────────────────

class NoEncontrado extends Error {}
const dnsFalso = (a: string[] | Error, aaaa: string[] | Error): Resolvedor => (_h, tipo) => {
  const r = tipo === "A" ? a : aaaa;
  return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
};

Deno.test("DNS: A y AAAA públicas → todas, sin repetir, A primero", async () => {
  const r = await direccionesPublicas("x.com", dnsFalso(["8.8.8.8", "8.8.8.8", "1.1.1.1"], ["2606:4700::1"]));
  assertEquals(r, { ok: true, direcciones: ["8.8.8.8", "1.1.1.1", "2606:4700::1"] });
});
Deno.test("DNS: sin AAAA (NotFound) es normal", async () => {
  assertEquals(await direccionesPublicas("x.com", dnsFalso(["8.8.8.8"], new NoEncontrado())), { ok: true, direcciones: ["8.8.8.8"] });
});
Deno.test("DNS: UNA sola dirección privada bloquea todo, aunque las demás sean públicas", async () => {
  assertEquals(await direccionesPublicas("x.com", dnsFalso(["8.8.8.8", "10.0.0.1"], [])), { ok: false, clase: "direccion_bloqueada" });
  assertEquals(await direccionesPublicas("x.com", dnsFalso(["8.8.8.8"], ["::1"])), { ok: false, clase: "direccion_bloqueada" });
});
Deno.test("DNS: sin respuesta, vacío o error en los dos → no se manda (falla cerrado)", async () => {
  assertEquals(await direccionesPublicas("x.com", dnsFalso(new Error("servfail"), new Error("servfail"))), { ok: false, clase: "dns" });
  assertEquals(await direccionesPublicas("x.com", dnsFalso([], [])), { ok: false, clase: "dns" });
  assertEquals(await direccionesPublicas("x.com", dnsFalso(new NoEncontrado(), new NoEncontrado())), { ok: false, clase: "dns" });
});
Deno.test("DNS: un resolvedor colgado se corta por plazo", async () => {
  const colgado: Resolvedor = (_h, _t, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abortado"))));
  const t0 = Date.now();
  assertEquals(await direccionesPublicas("x.com", colgado, 50), { ok: false, clase: "dns" });
  assert(Date.now() - t0 < 1000);
});

// ─── 4 y 5. la firma ─────────────────────────────────────────────────────────

Deno.test("firma: coincide con el vector oficial de Standard Webhooks", async () => {
  // libraries/javascript/src/webhook.test.ts del repo standard-webhooks ("sign function works")
  const firma = await firmar("whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}');
  assertEquals(firma, "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
});
Deno.test("firma: los encabezados llevan el id de siempre y la hora del intento", async () => {
  const { secreto } = generarSecreto();
  const a = await encabezadosFirmados(secreto, "id-1", '{"a":1}', 1_700_000_000_500);
  const b = await encabezadosFirmados(secreto, "id-1", '{"a":1}', 1_700_000_300_900);
  assertEquals(a["webhook-id"], "id-1");
  assertEquals(a["webhook-timestamp"], "1700000000");
  assertEquals(b["webhook-timestamp"], "1700000300");
  assertNotEquals(a["webhook-signature"], b["webhook-signature"]);
  assertEquals(a["webhook-signature"], await firmar(secreto, "id-1", 1700000000, '{"a":1}'));
});
Deno.test("firma: un secreto sin whsec_ o de largo raro no firma", async () => {
  await assertRejects(() => firmar("MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "i", 1, "x"));
  await assertRejects(() => firmar("whsec_YWJj", "i", 1, "x"));
});
Deno.test("secreto: whsec_ + 33 bytes (44 caracteres sin relleno), distinto cada vez, con sus últimos 4", () => {
  const a = generarSecreto(), b = generarSecreto();
  assertMatch(a.secreto, /^whsec_[A-Za-z0-9+/]{44}$/);
  for (let i = 0; i < 200; i++) assert(!generarSecreto().ultimos4.includes("="), "los últimos 4 son 4 caracteres de verdad");
  assertNotEquals(a.secreto, b.secreto);
  assertEquals(a.ultimos4, a.secreto.slice(-4));
  assertEquals(a.ultimos4.length, 4);
});

// ─── 6. el secreto guardado ──────────────────────────────────────────────────

const KEK = "k".repeat(40);
const entorno = (vars: Record<string, string>) => (n: string) => vars[n];
const EP1 = "11111111-1111-4111-8111-111111111111";
const EP2 = "22222222-2222-4222-8222-222222222222";

Deno.test("cifrado: ida y vuelta", async () => {
  const s = await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK }));
  assert(s);
  assertEquals(s.version, 1);
  assertEquals(await abrirSecreto(s, EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })), "whsec_abc");
});
Deno.test("cifrado: copiado a OTRA fila no abre (AAD)", async () => {
  const s = (await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })))!;
  assertEquals(await abrirSecreto(s, EP2, entorno({ WEBHOOK_SIGNING_KEK: KEK })), null);
});
Deno.test("cifrado: con otra versión anotada no abre, y sin la KEK tampoco", async () => {
  const s = (await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })))!;
  const env2 = entorno({ WEBHOOK_SIGNING_KEK: KEK, WEBHOOK_SIGNING_KEK_V2: KEK });
  assertEquals(await abrirSecreto({ ...s, version: 2 }, EP1, env2), null);
  assertEquals(await abrirSecreto(s, EP1, entorno({})), null);
  assertEquals(await abrirSecreto(s, EP1, entorno({ WEBHOOK_SIGNING_KEK: "otra".repeat(10) })), null);
});
Deno.test("cifrado: tocado no abre", async () => {
  const s = (await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })))!;
  const bytes = atob(s.cipher).split("");
  bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
  assertEquals(await abrirSecreto({ ...s, cipher: btoa(bytes.join("")) }, EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })), null);
});
Deno.test("cifrado: nonce nuevo cada vez", async () => {
  const env = entorno({ WEBHOOK_SIGNING_KEK: KEK });
  const a = (await sellarSecreto("whsec_abc", EP1, env))!, b = (await sellarSecreto("whsec_abc", EP1, env))!;
  assertNotEquals(a.nonce, b.nonce);
  assertNotEquals(a.cipher, b.cipher);
  assertEquals(atob(a.nonce).length, 12);
});
Deno.test("cifrado: rotar = volver a cifrar con la v2 y abrir con la v2", async () => {
  const env = entorno({ WEBHOOK_SIGNING_KEK: KEK, WEBHOOK_SIGNING_KEK_V2: "z".repeat(40) });
  const s2 = (await sellarSecreto("whsec_abc", EP1, env, 2))!;
  assertEquals(s2.version, 2);
  assertEquals(await abrirSecreto(s2, EP1, env), "whsec_abc");
  assertEquals(await abrirSecreto(s2, EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })), null);
});
Deno.test("cifrado: sin KEK, o con una KEK corta, no se cifra (config_error)", async () => {
  assertEquals(await sellarSecreto("whsec_abc", EP1, entorno({})), null);
  assertEquals(await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: "corta" })), null);
  assertEquals(kekConfigurada(entorno({})), false);
  assertEquals(kekConfigurada(entorno({ WEBHOOK_SIGNING_KEK: "corta" })), false);
  assertEquals(kekConfigurada(entorno({ WEBHOOK_SIGNING_KEK: KEK })), true);
});

// ─── 7. el cuerpo ────────────────────────────────────────────────────────────

const C1 = "8c1e0b7a-0000-4000-8000-000000000001";
const C2 = "f09a44d2-0000-4000-8000-000000000002";
// Cursores de verdad, armados con el codificador del feed.
const DESDE = codificarCursor({ t: "2026-09-25T21:39:45.123456+00:00", i: "00000000-0000-0000-0000-000000000000" });
const HASTA = codificarCursor({ t: "2026-09-25T21:40:02.345Z", i: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
const timbre = (extra: Partial<DatosDelTimbre> = {}): DatosDelTimbre => ({
  id: "5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33",
  creadoEn: new Date("2026-09-25T21:40:12.345Z"),
  prefijoLlave: "mvk_live_ab12cd",
  cantidad: 3,
  hayMas: false,
  conversaciones: [C1, C2, C1],
  sinPropios: true,
  despues: DESDE,
  hasta: HASTA,
  ...extra,
});

Deno.test("cuerpo: el timbre es exactamente lo del diseño", () => {
  const c = JSON.parse(cuerpoDelTimbre(timbre()));
  assertEquals(c, {
    id: "5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33",
    type: "messages.created",
    api_version: "v1",
    created_at: "2026-09-25T21:40:12.345Z",
    key_prefix: "mvk_live_ab12cd",
    data: {
      count: 3, has_more: false, conversation_ids: [C1, C2], exclude_own: true,
      after: DESDE, until: HASTA,
      fetch: `/messenger/feed?after=${DESDE}&exclude_own=true`,
    },
  });
});
Deno.test("cuerpo: aunque le pasen un mensaje entero, NO sale nada del contenido", () => {
  const mensaje = {
    content: "hola, el precio es 500", content_rich: { t: "secreto" }, sender_id: "persona",
    sender: { full_name: "Ana Pérez", email: "ana@x.com" }, file_url: "https://x/archivo.pdf", file_name: "cedula.pdf",
  };
  const texto = cuerpoDelTimbre({ ...timbre(), ...mensaje } as unknown as DatosDelTimbre);
  for (const v of ["hola", "precio", "secreto", "Ana", "ana@x.com", "archivo.pdf", "cedula", "persona", "content", "sender", "file"]) {
    assert(!texto.includes(v), `se filtró "${v}"`);
  }
  const claves = (o: Record<string, unknown>): string[] =>
    Object.entries(o).flatMap(([k, v]) => [k, ...(v && typeof v === "object" && !Array.isArray(v) ? claves(v as Record<string, unknown>) : [])]);
  assertEquals(claves(JSON.parse(texto)).sort(), [
    "after", "api_version", "conversation_ids", "count", "created_at", "data", "exclude_own", "fetch", "has_more", "id",
    "key_prefix", "type", "until",
  ]);
});
Deno.test("cuerpo: la prueba no lleva datos", () => {
  assertEquals(JSON.parse(cuerpoDePrueba({ id: "5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33", creadoEn: new Date(0), prefijoLlave: "mvk_live_x" })), {
    id: "5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33", type: "webhook.test", api_version: "v1",
    created_at: "1970-01-01T00:00:00.000Z", key_prefix: "mvk_live_x", data: {},
  });
});
Deno.test("cuerpo: exclude_own=false viaja igual en el fetch", () => {
  const c = JSON.parse(cuerpoDelTimbre(timbre({ sinPropios: false })));
  assertEquals(c.data.exclude_own, false);
  assert(c.data.fetch.endsWith("&exclude_own=false"));
});
Deno.test("cuerpo: valida lo que arma (no inventa un timbre raro)", () => {
  for (const malo of [
    { cantidad: 0 }, { cantidad: 101 }, { cantidad: 2.5 }, { conversaciones: [] }, { conversaciones: ["no-uuid"] },
    { conversaciones: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`) },
    { despues: "con espacio" }, { hasta: "" }, { despues: "a".repeat(401) }, { despues: "abc=" }, { id: "x" }, { prefijoLlave: "tiene espacio" },
    // cursores con forma de cursor que el feed NO acepta, o que llevan otra cosa adentro
    { despues: "abc" }, { despues: C1 }, { despues: btoa("hola, el precio es 500").replace(/=+$/, "") },
    { despues: codificarCursor({ t: "2026-09-25T21:39:45-05", i: C1 }) }, { despues: codificarCursor({ t: "2026-02-31T21:39:45Z", i: C1 }) },
    { despues: btoa(JSON.stringify({ t: "2026-09-25T21:39:45.1+00:00", i: C1, content: "secreto" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") },
    { hasta: 12 as unknown as string }, { conversaciones: "no-array" as unknown as string[] },
    { creadoEn: new Date("nope") }, { hayMas: "no" as unknown as boolean },
  ] as Partial<DatosDelTimbre>[]) {
    assertThrows(() => cuerpoDelTimbre(timbre(malo)), Error, undefined, JSON.stringify(malo));
  }
});
Deno.test("cuerpo: acepta exactamente los cursores que arma y acepta el feed", () => {
  for (const c of [
    { t: "2026-09-25T21:39:45.123456+00:00", i: "00000000-0000-0000-0000-000000000000" },
    { t: "2026-09-25T21:40:02.345Z", i: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
    { t: "2026-12-31T23:59:59.999999+00:00", i: "8c1e0b7a-0000-4000-8000-000000000001" },
  ]) {
    const cursor = codificarCursor(c);
    assertEquals(decodificarCursor(cursor), c);
    const t = JSON.parse(cuerpoDelTimbre(timbre({ despues: cursor, hasta: cursor })));
    assertEquals(decodificarCursor(t.data.after), c, "el after del timbre lo entiende el feed");
  }
  // el tope: lo que el feed rechaza por largo, el timbre también
  assertEquals(decodificarCursor("a".repeat(401)), null);
  assertThrows(() => cuerpoDelTimbre(timbre({ despues: "a".repeat(401) })));
});

Deno.test("cuerpo: 100 conversaciones entran de sobra en el tope de la base", () => {
  const cien = Array.from({ length: 100 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const largo = codificarCursor({ t: "2026-09-25T21:39:45.123456+00:00", i: C1 });
  const texto = cuerpoDelTimbre(timbre({ conversaciones: cien, despues: largo, hasta: largo }));
  assert(new TextEncoder().encode(texto).length < CUERPO_MAX / 2);
});

// ─── el envío, contra una conexión falsa ─────────────────────────────────────

interface Guion {
  /** lo que el "servidor" contesta, en trozos */
  respuesta?: string[];
  /** cortar la conexión en vez de contestar */
  cortar?: boolean;
  /** no contestar nunca */
  colgarse?: boolean;
  /** la escritura falla */
  fallaEscritura?: boolean;
}

function transporte(guiones: Array<Guion | "no_conecta" | "tls">) {
  const conexiones: { ip: string; host: string; escrito: Uint8Array; lecturas: number; cerrada: boolean }[] = [];
  const conectar: Conectar = (ip, host) => {
    const g = guiones[conexiones.length] ?? guiones[guiones.length - 1];
    const registro = { ip, host, escrito: new Uint8Array(0), lecturas: 0, cerrada: false };
    conexiones.push(registro);
    if (g === "no_conecta") return Promise.reject(new Error("ECONNREFUSED"));
    if (g === "tls") return Promise.reject(new ErrorDeTls("certificado de otro nombre"));
    const trozos = (g.respuesta ?? []).map((t) => new TextEncoder().encode(t));
    let cerrar: () => void = () => {};
    const conn: Conexion = {
      write(p) {
        if (g.fallaEscritura) return Promise.reject(new Error("EPIPE"));
        const n = Math.min(p.length, 7); // de a pedazos, como un socket de verdad
        const nuevo = new Uint8Array(registro.escrito.length + n);
        nuevo.set(registro.escrito);
        nuevo.set(p.subarray(0, n), registro.escrito.length);
        registro.escrito = nuevo;
        return Promise.resolve(n);
      },
      read(p) {
        registro.lecturas++;
        if (g.colgarse) return new Promise((_, reject) => { cerrar = () => reject(new Error("cerrada")); });
        if (g.cortar) return Promise.reject(new Error("ECONNRESET"));
        const t = trozos.shift();
        if (!t) return Promise.resolve(null);
        p.set(t.subarray(0, p.length));
        return Promise.resolve(Math.min(t.length, p.length));
      },
      close() {
        registro.cerrada = true;
        cerrar();
      },
    };
    return Promise.resolve(conn);
  };
  return { conectar, conexiones };
}

const DNS_OK = dnsFalso(["93.184.216.34"], []);
const HREF = "https://hooks.integrador.com/maven/abc?t=1";
const envio = (conectar: Conectar, extra = {}) =>
  enviarWebhook({
    href: HREF, cuerpo: '{"id":"x","ñ":"é"}', resolver: DNS_OK, conectar,
    encabezados: { "webhook-id": "x", "webhook-timestamp": "1", "webhook-signature": "v1,abc" }, ...extra,
  });

Deno.test("envío: 204 → respuesta; el pedido sale entero, a la IP verificada y con el certificado del nombre", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 204 No Content\r\n\r\n"] }]);
  const r = await envio(t.conectar);
  assertEquals(r.tipo === "respuesta" && r.estado, 204);
  assertEquals(t.conexiones.length, 1);
  assertEquals(t.conexiones[0].ip, "93.184.216.34");
  assertEquals(t.conexiones[0].host, "hooks.integrador.com");
  assert(t.conexiones[0].cerrada, "la conexión queda cerrada");
  const pedido = new TextDecoder().decode(t.conexiones[0].escrito);
  const [cabeza, cuerpo] = pedido.split("\r\n\r\n");
  assertEquals(cuerpo, '{"id":"x","ñ":"é"}');
  const lineas = cabeza.split("\r\n");
  assertEquals(lineas[0], "POST /maven/abc?t=1 HTTP/1.1");
  assert(lineas.includes("Host: hooks.integrador.com"));
  assert(lineas.includes("Content-Type: application/json"));
  assert(lineas.includes(`Content-Length: ${new TextEncoder().encode('{"id":"x","ñ":"é"}').length}`), "Content-Length en BYTES");
  assert(lineas.includes("webhook-signature: v1,abc"));
  assert(lineas.includes("Connection: close"));
  assert(!/authorization|cookie/i.test(cabeza), "sin credenciales");
});

Deno.test("envío: un 3xx NO se sigue (una sola conexión)", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 301 Moved\r\nLocation: http://169.254.169.254/\r\n\r\n"] }]);
  const r = await envio(t.conectar);
  assertEquals(r.tipo === "respuesta" && r.estado, 301);
  assertEquals(t.conexiones.length, 1);
  assertEquals(decidir(r).accion, "reintentar");
});

Deno.test("envío: saltea 100 y 103 hasta el código final, aunque lleguen de a pedazos", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 103 Ea", "rly Hints\r\nLink: </x>\r\n\r\nHTTP/1.1 20", "0 OK\r\nContent-Length: 2\r\n\r\nok"] }]);
  const r = await envio(t.conectar);
  assertEquals(r.tipo === "respuesta" && r.estado, 200);
});

Deno.test("envío: no lee el cuerpo de la respuesta (aunque sea enorme)", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 200 OK\r\n\r\n", ...Array(1000).fill("x".repeat(4096))] }]);
  const r = await envio(t.conectar);
  assertEquals(r.tipo === "respuesta" && r.estado, 200);
  assertEquals(t.conexiones[0].lecturas, 1);
});

Deno.test("envío: encabezados de respuesta sin fin (más de 16 KB) → incierto, sin leer de más", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 200 OK\r\n", ...Array(100).fill("X-Relleno: " + "a".repeat(4000) + "\r\n")] }]);
  const r = await envio(t.conectar);
  assertEquals(r, { ...r, tipo: "incierto", clase: "respuesta_invalida" });
  assert(t.conexiones[0].lecturas < 10, `lecturas: ${t.conexiones[0].lecturas}`);
});

Deno.test("envío: Retry-After en segundos y como fecha", async () => {
  const a = await envio(transporte([{ respuesta: ["HTTP/1.1 429 Too Many\r\nRetry-After: 120\r\n\r\n"] }]).conectar);
  assertEquals(a.tipo === "respuesta" && a.retryAfterS, 120);
  const ahora = Date.parse("2026-09-26T00:00:00Z");
  const b = await envio(transporte([{ respuesta: ["HTTP/1.1 503 Busy\r\nretry-after: Sat, 26 Sep 2026 00:05:00 GMT\r\n\r\n"] }]).conectar, { ahora: () => ahora });
  assertEquals(b.tipo === "respuesta" && b.retryAfterS, 300);
  assertEquals(leerRetryAfter("pronto", 0), null);
  assertEquals(leerRetryAfter(null, 0), null);
  assertEquals(leerRetryAfter("Thu, 01 Jan 1970 00:00:00 GMT", 10_000), 0);
});

Deno.test("envío: respuesta que no es HTTP → incierto (el pedido ya salió)", async () => {
  for (const basura of ["SSH-2.0-OpenSSH\r\n\r\n", "HTTP/2 200\r\n\r\n", "HTTP/1.1 2000 OK\r\n\r\n", "HTTP/1.1 099 Raro\r\n\r\n"]) {
    const r = await envio(transporte([{ respuesta: [basura] }]).conectar);
    assertEquals(r.tipo === "incierto" && r.clase, "respuesta_invalida", basura);
  }
});

Deno.test("envío: se cierra sin contestar → incierto (cortado), no fallo", async () => {
  const r1 = await envio(transporte([{ respuesta: [] }]).conectar);
  assertEquals(r1.tipo === "incierto" && r1.clase, "respuesta_invalida");
  const r2 = await envio(transporte([{ cortar: true }]).conectar);
  assertEquals(r2.tipo === "incierto" && r2.clase, "cortado");
});

Deno.test("envío: el receptor no contesta nunca → incierto por plazo, y no tarda más que el plazo", async () => {
  const t = transporte([{ colgarse: true }]);
  const t0 = Date.now();
  const r = await envio(t.conectar, { plazoMs: 150 });
  assertEquals(r.tipo === "incierto" && r.clase, "plazo");
  assert(Date.now() - t0 < 1500);
  assert(t.conexiones[0].cerrada);
});

Deno.test("envío: si falla la escritura, NO salió (sin_enviar)", async () => {
  const r = await envio(transporte([{ fallaEscritura: true }]).conectar);
  assertEquals(r.tipo === "sin_enviar" && r.clase, "conexion");
});

Deno.test("envío: DNS bloqueado o caído → no se conecta a nada", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 204 OK\r\n\r\n"] }]);
  const a = await envio(t.conectar, { resolver: dnsFalso(["10.0.0.5"], []) });
  assertEquals(a.tipo === "sin_enviar" && a.clase, "direccion_bloqueada");
  const b = await envio(t.conectar, { resolver: dnsFalso(new Error("x"), new Error("x")) });
  assertEquals(b.tipo === "sin_enviar" && b.clase, "dns");
  assertEquals(t.conexiones.length, 0);
});

Deno.test("envío: si la primera IP no conecta, prueba la siguiente (también verificada)", async () => {
  const t = transporte(["no_conecta", { respuesta: ["HTTP/1.1 202 Accepted\r\n\r\n"] }]);
  const r = await envio(t.conectar, { resolver: dnsFalso(["93.184.216.34"], ["2606:4700::1"]) });
  assertEquals(r.tipo === "respuesta" && r.estado, 202);
  assertEquals(t.conexiones.map((c) => c.ip), ["93.184.216.34", "2606:4700::1"]);
});

Deno.test("envío: TLS que falla (certificado de otro nombre) → sin_enviar tls; ninguna conecta → conexion", async () => {
  const a = await envio(transporte(["tls"]).conectar);
  assertEquals(a.tipo === "sin_enviar" && a.clase, "tls");
  const b = await envio(transporte(["no_conecta"]).conectar, { resolver: dnsFalso(["93.184.216.34", "1.1.1.1"], []) });
  assertEquals(b.tipo === "sin_enviar" && b.clase, "conexion");
});

Deno.test("envío: un encabezado con salto de línea no puede inyectar otro", async () => {
  await assertRejects(() =>
    enviarWebhook({ href: HREF, cuerpo: "{}", resolver: DNS_OK, conectar: transporte([{ respuesta: [] }]).conectar,
      encabezados: { "webhook-id": "x\r\nAuthorization: Bearer robado" } })
  );
});

// ─── 8. qué hacer con cada resultado ─────────────────────────────────────────

Deno.test("decidir: 2xx entregado, 410 detener, el resto reintentar con su clase", () => {
  const resp = (estado: number, retryAfterS: number | null = null) => ({ tipo: "respuesta" as const, estado, retryAfterS, latenciaMs: 5 });
  assertEquals(decidir(resp(200)), { accion: "entregado", codigo: 200, error: null });
  assertEquals(decidir(resp(299)), { accion: "entregado", codigo: 299, error: null });
  assertEquals(decidir(resp(410)), { accion: "detener", motivo: "receiver_gone", codigo: 410, error: "http_410" });
  assertEquals(decidir({ tipo: "sin_enviar", clase: "host_prohibido", latenciaMs: 0 }), { accion: "detener", motivo: "config_error", codigo: null, error: "host_prohibido" });
  for (const e of [300, 301, 302, 304, 307, 308, 400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504, 999]) {
    const d = decidir(resp(e, 7));
    assertEquals(d, { accion: "reintentar", codigo: e, error: `http_${e}`, incierto: false, retryAfterS: 7 }, String(e));
  }
  assertEquals(decidir({ tipo: "sin_enviar", clase: "tls", latenciaMs: 1 }), { accion: "reintentar", codigo: null, error: "tls", incierto: false, retryAfterS: null });
  assertEquals(decidir({ tipo: "incierto", clase: "plazo", latenciaMs: 1 }), { accion: "reintentar", codigo: null, error: "plazo", incierto: true, retryAfterS: null });
});

Deno.test("reintentos: la escalera, con ±20 % de azar", () => {
  const ahora = 1_000_000;
  ESPERAS_S.forEach((s, i) => {
    assertEquals(proximoIntento(i + 1, ahora, null, () => 0.5), ahora + s * 1000);
    assertEquals(proximoIntento(i + 1, ahora, null, () => 0), ahora + Math.round(s * 0.8 * 1000));
    assertEquals(proximoIntento(i + 1, ahora, null, () => 1), ahora + Math.round(s * 1.2 * 1000));
  });
  assertEquals(proximoIntento(50, ahora, null, () => 0.5), ahora + 28_800_000, "de ahí cada 8 h");
  assertEquals(proximoIntento(0, ahora, null, () => 0.5), ahora + 30_000, "0 fallos cuenta como el primero");
});

Deno.test("reintentos: Retry-After manda si pide MÁS, hasta 1 h", () => {
  const ahora = 0;
  assertEquals(proximoIntento(1, ahora, 300, () => 0.5), 300_000);
  assertEquals(proximoIntento(1, ahora, 10, () => 0.5), 30_000, "si pide menos, manda la escalera");
  assertEquals(proximoIntento(1, ahora, 86_400, () => 0.5), 3_600_000, "más de 1 h: se corta en 1 h");
  assertEquals(proximoIntento(8, ahora, 86_400, () => 0.5), 28_800_000, "y nunca acorta la escalera");
});

Deno.test("reintentos: entre 14 y 18 intentos en las 72 h según el azar (16 en el medio; el diseño estimaba ~13)", () => {
  // 30 s + 2 min + 10 min + 30 min + 1 h + 2 h + 4 h + 8 h ≈ 15,7 h en los primeros 9;
  // el resto de las 72 h, cada 8 h ±20 %.
  const intentos = (azar: number) => {
    let t = 0, n = 0;
    while (t < HORIZONTE_MS) { n++; t = proximoIntento(n, t, null, () => azar); }
    return n;
  };
  assertEquals(intentos(0.5), 16);
  assertEquals(intentos(0), 18);
  assertEquals(intentos(1), 14);
});

Deno.test("horizonte: 72 h fallando sin parar", () => {
  const desde = new Date(0);
  assertEquals(vencioElHorizonte(null, HORIZONTE_MS * 2), false);
  assertEquals(vencioElHorizonte(desde, HORIZONTE_MS - 1), false);
  assertEquals(vencioElHorizonte(desde, HORIZONTE_MS), true);
});

// ─── lo que agregó la revisión adversarial ───────────────────────────────────

Deno.test("envío: el nombre se vuelve a mirar en CADA envío (una URL que ya no pasa, no sale)", async () => {
  for (const href of [
    "https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send",
    "https://app.maven-ai.me/x",
    "https://maven.asmtech.me/x",
    "https://HOOKS.integrador.com/x", // sin normalizar: no es la que se guardó
    "no es una url",
  ]) {
    const t = transporte([{ respuesta: ["HTTP/1.1 200 OK\r\n\r\n"] }]);
    const r = await envio(t.conectar, { href, resolver: dnsFalso(["104.18.38.10"], []) });
    assertEquals(r.tipo === "sin_enviar" && r.clase, "host_prohibido", href);
    assertEquals(t.conexiones.length, 0, `no se conecta a nada: ${href}`);
    assertEquals(decidir(r).accion, "detener", "una URL que nunca se va a mandar no se reintenta 72 h");
  }
});

Deno.test("URL: cada dominio de Maven en cors.ts (ALLOWED_ORIGINS) está prohibido", () => {
  for (const origen of ALLOWED_ORIGINS) {
    const host = new URL(origen).hostname;
    const r = normalizarUrlDeWebhook(`https://${host}/x`);
    assert(!r.ok, `un origen de Maven se puede registrar como webhook: ${host}`);
  }
});

Deno.test("IP: las IPs de nuestros servidores no pasan; una IPv4 con ceros a la izquierda tampoco", () => {
  for (const ip of ["147.93.3.97", "217.216.95.7", "64:ff9b::d9d8:5f07", "012.0.0.1", "8.8.08.8"]) {
    assert(!ipEsPublica(ip), ip);
  }
});

Deno.test("envío: una catarata de 1xx no esquiva el tope de 16 KB (ni el de 8 respuestas)", async () => {
  const t = transporte([{ respuesta: Array(10_000).fill("HTTP/1.1 100 Continue\r\n\r\n".repeat(100)) }]);
  const r = await envio(t.conectar);
  assertEquals(r.tipo === "incierto" && r.clase, "respuesta_invalida");
  assert(t.conexiones[0].lecturas <= 5, `lecturas: ${t.conexiones[0].lecturas}`);
  const goteo = transporte([{ respuesta: Array(9).fill("HTTP/1.1 103 Early Hints\r\n\r\n").concat(["HTTP/1.1 200 OK\r\n\r\n"]) }]);
  const r2 = await envio(goteo.conectar);
  assertEquals(r2.tipo === "incierto" && r2.clase, "respuesta_invalida", "más de 8 respuestas 1xx");
  // pocas 1xx pero grandes: el tope de 16 KB es del TOTAL, no de cada bloque
  const grandes = transporte([{ respuesta: Array(5).fill("HTTP/1.1 103 Early Hints\r\nLink: " + "a".repeat(4000) + "\r\n\r\n").concat(["HTTP/1.1 200 OK\r\n\r\n"]) }]);
  const r4 = await envio(grandes.conectar);
  assertEquals(r4.tipo === "incierto" && r4.clase, "respuesta_invalida", "5 × 4 KB de 1xx pasan los 16 KB");
  const ocho = transporte([{ respuesta: Array(8).fill("HTTP/1.1 103 Early Hints\r\n\r\n").concat(["HTTP/1.1 200 OK\r\n\r\n"]) }]);
  const r3 = await envio(ocho.conectar);
  assertEquals(r3.tipo === "respuesta" && r3.estado, 200, "8 respuestas 1xx sí");
});

Deno.test("envío: acepta fin de línea sin \\r (RFC 9112 §2.2), también partido entre lecturas", async () => {
  const casos: string[][] = [
    ["HTTP/1.1 200 OK\nContent-Length: 0\n\n"],
    ["HTTP/1.1 100 Continue\n\nHTTP/1.1 429 X\nRetry-After: 5\n\n"],
    ["HTTP/1.1 204 No Content\n", "\n"],
    ["HTTP/1.1 202 Accepted\r\n", "\r", "\n"],
  ];
  const esperado = [200, 429, 204, 202];
  for (const [i, respuesta] of casos.entries()) {
    const r = await envio(transporte([{ respuesta }]).conectar);
    assertEquals(r.tipo === "respuesta" && r.estado, esperado[i], JSON.stringify(respuesta));
  }
  const conRetry = await envio(transporte([{ respuesta: casos[1] }]).conectar);
  assertEquals(conRetry.tipo === "respuesta" && conRetry.retryAfterS, 5);
});

// El Conectar de verdad, con una red falsa: a QUÉ IP y con QUÉ nombre se abre.
function redFalsa(o: { tcpMs?: number; tlsMs?: number; tlsFalla?: boolean } = {}) {
  const eventos: string[] = [];
  let tcpCerradas = 0;
  const red: Red = {
    conectarTcp(ip, puerto) {
      eventos.push(`tcp ${ip}:${puerto}`);
      return new Promise((resolve) =>
        setTimeout(() => resolve({ close: () => { tcpCerradas++; eventos.push("tcp cerrada"); } }), o.tcpMs ?? 0)
      );
    },
    iniciarTls(_tcp, host) {
      eventos.push(`tls ${host}`);
      const tls: TlsSinHandshake = {
        handshake: () =>
          new Promise((resolve, reject) =>
            setTimeout(() => (o.tlsFalla ? reject(new Error("invalid peer certificate")) : resolve({})), o.tlsMs ?? 0)
          ),
        write: (p) => Promise.resolve(p.length),
        read: () => Promise.resolve(null),
        close: () => eventos.push("tls cerrada"),
      };
      return Promise.resolve(tls);
    },
  };
  return { red, eventos, tcpCerradas: () => tcpCerradas };
}

Deno.test("conexión: TCP a la IP verificada en el 443, TLS con el NOMBRE", async () => {
  const f = redFalsa();
  await crearConectar(f.red)("93.184.216.34", "hooks.integrador.com", 1_000);
  assertEquals(f.eventos, ["tcp 93.184.216.34:443", "tls hooks.integrador.com"]);
});

Deno.test("conexión: un certificado malo es ErrorDeTls y cierra lo que abrió", async () => {
  const f = redFalsa({ tlsFalla: true });
  await assertRejects(() => crearConectar(f.red)("93.184.216.34", "hooks.integrador.com", 1_000), ErrorDeTls);
  assert(f.eventos.includes("tls cerrada"));
});

Deno.test("conexión: TCP + TLS comparten UN plazo (no uno cada uno), y vencer es Vencido", async () => {
  // TCP tarda 300 de los 400: al TLS le quedan ~100, no 400 de nuevo.
  const f = redFalsa({ tcpMs: 300, tlsMs: 5_000 });
  const t0 = Date.now();
  await assertRejects(() => crearConectar(f.red)("93.184.216.34", "hooks.integrador.com", 400), Vencido);
  const tardo = Date.now() - t0;
  assert(tardo < 600, `tardó ${tardo} ms con un plazo de 400 (con dos plazos serían ~700)`);
});

Deno.test("conexión: un TCP que llega después del plazo se cierra al llegar", async () => {
  const f = redFalsa({ tcpMs: 120 });
  await assertRejects(() => crearConectar(f.red)("93.184.216.34", "hooks.integrador.com", 30), Vencido);
  await new Promise((r) => setTimeout(r, 200));
  assertEquals(f.tcpCerradas(), 1, "la conexión tardía no queda abierta");
});

Deno.test("envío: un conectar que se vence cuenta como plazo, no como conexión", async () => {
  const vence: Conectar = () => Promise.reject(new Vencido("plazo"));
  const r = await envio(vence);
  assertEquals(r.tipo === "sin_enviar" && r.clase, "plazo");
});

Deno.test("cifrado: el id se normaliza (se sella como lo devuelve la base) y uno que no es UUID no sella", async () => {
  const env = entorno({ WEBHOOK_SIGNING_KEK: KEK });
  const conLetras = "8c1e0b7a-abcd-4def-8abc-0000000000ff"; // con letras: toUpperCase() cambia algo
  const s = (await sellarSecreto("whsec_abc", conLetras.toUpperCase(), env))!;
  assertEquals(await abrirSecreto(s, conLetras, env), "whsec_abc", "sellado con MAYÚSCULAS, abierto con el de la base");
  await assertRejects(() => sellarSecreto("whsec_abc", "", env));
  await assertRejects(() => sellarSecreto("whsec_abc", "no-es-uuid", env));
  assertEquals(await abrirSecreto(s, "no-es-uuid", env), null);
});

// ─── tests que propuso la revisión por mutaciones ────────────────────────────

// Cada sufijo prohibido con su caso escrito a mano (no se deriva de la lista: si
// alguien borra uno, este test tiene que caer).
for (const host of [
  "x.supabase.in", "crm.kashagency.me", "crm.kash-agency.me", "10.0.0.1.xip.io", "app.localtest.me", "app.lvh.me",
  "nas.localdomain", "wiki.intranet", "nas.lan", "router.home", "git.corp", "db.private", "1.0.0.127.in-addr.arpa",
  "api.test", "api.invalid", "api.example", "abcdefghijklmnop.onion", "www.maven-ai.me", "maven.asmtech.me",
  "coowork.duckdns.org", "x.coowork.duckdns.org",
]) {
  Deno.test(`URL: rechaza ${host} (host_prohibido)`, () => {
    const r = normalizarUrlDeWebhook(`https://${host}/x`);
    assertEquals(!r.ok && r.motivo, "host_prohibido");
  });
}
Deno.test("URL: otro subdominio de duckdns.org (no nuestro) pasa", () => {
  assert(normalizarUrlDeWebhook("https://integrador.duckdns.org/x").ok);
});

Deno.test("URL: los bordes que la base rechaza también los rechaza la edge", () => {
  assertEquals(normalizarUrlDeWebhook("https://:secreto@integrador.com/x"), { ok: false, motivo: "usuario" });
  assertEquals(normalizarUrlDeWebhook("https://integrador.1com/x"), { ok: false, motivo: "host_invalido" });
  assertEquals(normalizarUrlDeWebhook(`https://${"a".repeat(64)}.com/x`), { ok: false, motivo: "host_invalido" });
  assertEquals(normalizarUrlDeWebhook(`https://${("a".repeat(63) + ".").repeat(4)}com/x`), { ok: false, motivo: "host_invalido" });
  const base = "https://integrador.com/"; // 23 caracteres
  const justa = normalizarUrlDeWebhook(base + "a".repeat(2048 - base.length));
  assert(justa.ok && justa.href.length === 2048, "2048 entra");
  assertEquals(normalizarUrlDeWebhook(base + "a".repeat(2049 - base.length)), { ok: false, motivo: "muy_larga" });
});

Deno.test("IP: el último de cada rango no pasa y el primero de afuera sí", () => {
  const bordes: Array<[string, boolean]> = [
    ["0.255.255.255", false], ["192.168.255.255", false], ["192.168.128.1", false],
    ["192.0.0.255", false], ["192.0.1.0", true], ["192.0.2.255", false], ["192.0.3.0", true],
    ["192.88.99.255", false], ["192.88.100.0", true], ["198.51.100.255", false], ["198.51.101.0", true],
    ["203.0.113.255", false], ["203.0.114.0", true],
    ["2600:1f18:4a3:6902:8c1e:b0f4:2ea8:8f3", true], // sin "::": 8 grupos escritos
    ["2001:1ff:ffff::1", false], // último de 2001::/23
  ];
  for (const [ip, esperado] of bordes) assertEquals(ipEsPublica(ip), esperado, ip);
});

Deno.test("IP: NAT64 lee la IPv4 de adentro en el orden correcto", () => {
  assertEquals(ipEsPublica("64:ff9b::c0a8:101"), false, "192.168.1.1");
  assertEquals(ipEsPublica("64:ff9b::a00:101"), false, "10.0.1.1");
  assertEquals(ipEsPublica("64:ff9b::c000:201"), false, "192.0.2.1");
  assertEquals(ipEsPublica("64:ff9b::102:304"), true, "1.2.3.4");
  assertEquals(ipEsPublica("64:ff9b:1::808:808"), false, "64:ff9b:1::/48 es NAT64 local (RFC 8215): no se mira adentro");
  assertEquals(ipEsPublica("64:1::808:808"), false, "solo 64:ff9b::/96 es NAT64");
});

Deno.test("firma: sin whsec_ no firma aunque el largo sea válido; 24 y 64 bytes sí, 23 y 65 no", async () => {
  const conLargo = (n: number) => "whsec_" + btoa("a".repeat(n));
  await assertRejects(() => firmar("whsex_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", "i", 1, "x"), Error, "whsec_");
  await assertRejects(() => firmar(conLargo(23), "i", 1, "x"), Error, "largo");
  await assertRejects(() => firmar(conLargo(65), "i", 1, "x"), Error, "largo");
  assertMatch(await firmar(conLargo(24), "i", 1, "x"), /^v1,/);
  assertMatch(await firmar(conLargo(64), "i", 1, "x"), /^v1,/);
  assertMatch(await firmar(generarSecreto().secreto, "i", 1, "x"), /^v1,/, "el secreto de 33 bytes firma");
});

Deno.test("cifrado: abre un sellado fijo (formato de KEK, AAD y base64 congelados)", async () => {
  const guardado = { cipher: "Lh3xJPSjGqX7spL0l5yVc5UDw1ZbkOBDSFlfGcfQP2CK26Ivkack9M29CGphq6DsWttCIC0V", nonce: "f2seTWItA6zDd4BQ", version: 1 };
  assertEquals(await abrirSecreto(guardado, EP1, entorno({ WEBHOOK_SIGNING_KEK: KEK })), "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw");
});
Deno.test("cifrado: la KEK mínima es 32 (31 no, 32 sí)", async () => {
  assertEquals(kekConfigurada(entorno({ WEBHOOK_SIGNING_KEK: "k".repeat(31) })), false);
  assertEquals(await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: "k".repeat(31) })), null);
  assertEquals(kekConfigurada(entorno({ WEBHOOK_SIGNING_KEK: "k".repeat(32) })), true);
  assert(await sellarSecreto("whsec_abc", EP1, entorno({ WEBHOOK_SIGNING_KEK: "k".repeat(32) })));
});

Deno.test("cuerpo: sinPropios tiene que ser booleano (viaja al fetch); la prueba valida id y prefijo", () => {
  assertThrows(() => cuerpoDelTimbre(timbre({ sinPropios: "true&since=2020" as unknown as boolean })));
  const ok = { id: "5b0d6a4e-3c1f-4e8a-9d7e-2a6f0c9b1e33", creadoEn: new Date(0), prefijoLlave: "mvk_live_x" };
  assertThrows(() => cuerpoDePrueba({ ...ok, id: "x" }));
  assertThrows(() => cuerpoDePrueba({ ...ok, prefijoLlave: "tiene espacio" }));
});

Deno.test("envío: User-Agent Maven-Webhooks/1, y ni el nombre ni el valor de un encabezado pueden inyectar", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 204 No Content\r\n\r\n"] }]);
  await envio(t.conectar);
  assert(new TextDecoder().decode(t.conexiones[0].escrito).split("\r\n").includes("User-Agent: Maven-Webhooks/1"));
  const malos: Record<string, string>[] = [{ "x\r\nAuthorization": "Bearer robado" }, { "webhook-id": "a\u0000b" }, { "webhook-id": "ñ" }];
  for (const encabezados of malos) {
    let dnsConsultado = false;
    const espia: Resolvedor = () => { dnsConsultado = true; return Promise.resolve(["93.184.216.34"]); };
    await assertRejects(() => enviarWebhook({ href: HREF, cuerpo: "{}", resolver: espia, conectar: transporte([{ respuesta: [] }]).conectar, encabezados }));
    assert(!dnsConsultado, "un pedido que no se va a mandar no consulta el DNS");
  }
});

Deno.test("envío: status-line sin frase es respuesta; un 099 seguido de 200 sigue siendo inválido", async () => {
  for (const linea of ["HTTP/1.1 200 \r\n\r\n", "HTTP/1.1 204\r\n\r\n"]) {
    const r = await envio(transporte([{ respuesta: [linea] }]).conectar);
    assertEquals(r.tipo === "respuesta" && r.estado, Number(linea.slice(9, 12)), JSON.stringify(linea));
  }
  const r = await envio(transporte([{ respuesta: ["HTTP/1.1 099 Raro\r\n\r\nHTTP/1.1 200 OK\r\n\r\n"] }]).conectar);
  assertEquals(r.tipo === "incierto" && r.clase, "respuesta_invalida");
});
Deno.test("envío: el tope de encabezados es 16 KB: con trozos de ~4 KB, a la sexta lectura corta", async () => {
  const t = transporte([{ respuesta: ["HTTP/1.1 200 OK\r\n", ...Array(100).fill("X-Relleno: " + "a".repeat(4000) + "\r\n")] }]);
  await envio(t.conectar);
  assertEquals(t.conexiones[0].lecturas, 6); // 17 + 4 × 4013 = 16.069 ≤ 16.384 < 20.082
});
Deno.test("envío: el fin de encabezados se busca en bytes (un 1xx con ñ no corre la cuenta)", async () => {
  const r = await envio(transporte([{ respuesta: ["HTTP/1.1 103 Early\r\nX-Nombre: ñññ\r\n\r\nHTTP/1.1 200 OK\r\n\r\n"] }]).conectar);
  assertEquals(r.tipo === "respuesta" && r.estado, 200);
});

Deno.test("envío: cada conexión recibe a lo sumo 4 s y nunca más de lo que queda; a lo sumo 4 IPs", async () => {
  let reloj = 0;
  const plazos: number[] = [];
  const agujero: Conectar = (_ip, _host, plazoMs) => {
    plazos.push(plazoMs);
    reloj += plazoMs; // un agujero negro: se come todo su plazo
    return Promise.reject(new Error("ETIMEDOUT"));
  };
  const seis = dnsFalso(["93.184.216.34", "1.1.1.1", "8.8.8.8", "9.9.9.9", "8.8.4.4", "1.0.0.1"], []);
  const r = await envio(agujero, { resolver: seis, ahora: () => reloj, plazoMs: 10_000 });
  assertEquals(plazos, [4_000, 4_000, 2_000]);
  assertEquals(r.tipo === "sin_enviar" && r.clase, "plazo");
  const t = transporte(["no_conecta"]);
  await envio(t.conectar, { resolver: seis });
  assertEquals(t.conexiones.length, 4, "a lo sumo 4 IPs por intento");
});
Deno.test("envío: un DNS colgado o una escritura colgada no pasan el plazo del intento", async () => {
  const colgado: Resolvedor = (_h, _t, { signal }) =>
    new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abortado"))));
  let t0 = Date.now();
  const a = await envio(transporte([{ respuesta: [] }]).conectar, { resolver: colgado, plazoMs: 100 });
  assertEquals(a.tipo === "sin_enviar" && a.clase, "dns");
  assert(Date.now() - t0 < 1_000, "el DNS respeta el plazo del intento");
  let cerrar: () => void = () => {};
  const tapado: Conectar = () => Promise.resolve({
    write: () => new Promise<number>((_, reject) => { cerrar = () => reject(new Error("cerrada")); }),
    read: () => Promise.resolve(null),
    close: () => cerrar(),
  });
  t0 = Date.now();
  const b = await envio(tapado, { plazoMs: 150 });
  assertEquals(b.tipo, "sin_enviar");
  assert(Date.now() - t0 < 1_500, "la escritura respeta el plazo del intento");
});
Deno.test("envío: latenciaMs mide el intento (va a latency_ms, integer >= 0)", async () => {
  let llamadas = 0;
  const ahora = () => (llamadas++ === 0 ? 1_000_000 : 1_000_250);
  const r = await envio(transporte([{ respuesta: ["HTTP/1.1 204 No Content\r\n\r\n"] }]).conectar, { ahora });
  assertEquals(r.latenciaMs, 250);
});

Deno.test("reintentos: la escalera y el horizonte son los del diseño (números escritos, no comparados contra sí mismos)", () => {
  assertEquals([...ESPERAS_S], [30, 120, 600, 1_800, 3_600, 7_200, 14_400, 28_800]);
  assertEquals(vencioElHorizonte(new Date(0), 259_199_999), false);
  assertEquals(vencioElHorizonte(new Date(0), 259_200_000), true, "72 h exactas");
});

Deno.test("estructura: la red de verdad conecta a la IP en el 443 y valida el certificado contra el NOMBRE", async () => {
  const fuente = await Deno.readTextFile(new URL("./webhook-salida.ts", import.meta.url));
  const codigo = fuente.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  assertMatch(codigo, /Deno\.connect\(\{ hostname: ip, port: puerto \}\)/, "TCP a la IP que se verificó");
  assertMatch(codigo, /red\.conectarTcp\(ip, 443\)/, "siempre al 443");
  assertMatch(codigo, /Deno\.startTls\(tcp as Deno\.TcpConn, \{ hostname: host, alpnProtocols: \["http\/1\.1"\] \}\)/, "certificado del NOMBRE, solo HTTP/1.1");
  assert(!/connectTls\(/.test(codigo), "connectTls resuelve el nombre por su cuenta: saltea el chequeo de IP");
  assertEquals(codigo.match(/Deno\.resolveDns\(/g)?.length, 1, "un solo lugar resuelve DNS");
});

// ─── estructura ──────────────────────────────────────────────────────────────

Deno.test("estructura: el módulo no loguea nada ni usa fetch() para mandar", async () => {
  const fuente = await Deno.readTextFile(new URL("./webhook-salida.ts", import.meta.url));
  const codigo = fuente.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  assert(!/\bconsole\./.test(codigo), "no puede haber console.*: la URL y el cuerpo no se loguean");
  assert(!/\bfetch\(/.test(codigo), "no puede usar fetch(): se conecta a la IP verificada");
});
