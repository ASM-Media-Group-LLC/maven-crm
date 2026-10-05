// La IP y las cabeceras de límite, por COMPORTAMIENTO: con un Request de verdad y
// cabeceras falsificadas, no leyendo el texto del código (un test de texto seguía
// en verde aunque se leyera una cabecera que escribe el cliente).

import { assert, assertEquals } from "jsr:@std/assert";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasDeCupo, clientIp, CUERPO_MAX_BYTES, esJson, fetchSinReintentos, ipAllowed, leerCuerpo } from "./peticion.ts";

const pedido = (h: Record<string, string>) => new Request("https://x/functions/v1/public-api/", { headers: h });
const FALSAS = {
  "x-forwarded-for": "1.2.3.4",
  "x-client-ip": "1.2.3.4",
  "true-client-ip": "1.2.3.4",
  "forwarded": "for=1.2.3.4",
};

Deno.test("IP: manda la que pone Cloudflare, aunque el cliente mande otras", () => {
  assertEquals(clientIp(pedido({ ...FALSAS, "x-real-ip": "5.6.7.8", "cf-connecting-ip": "9.9.9.9" })), "9.9.9.9");
});

Deno.test("IP: sin cf-connecting-ip, la del proxy; nunca una del cliente", () => {
  assertEquals(clientIp(pedido({ ...FALSAS, "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assertEquals(clientIp(pedido({ ...FALSAS })), null);
});

Deno.test("whitelist: sin IP conocida no entra; exacta y rango funcionan", () => {
  assertEquals(ipAllowed(null, ["1.2.3.4"]), false);
  // Con un rango que lo abarca todo tampoco: sin IP conocida, no entra.
  assertEquals(ipAllowed(null, ["0.0.0.0/0"]), false);
  assertEquals(ipAllowed(null, ["10.0.0.0/8", "1.2.3.4"]), false);
  assertEquals(ipAllowed("1.2.3.4", ["1.2.3.4"]), true);
  assertEquals(ipAllowed("1.2.3.5", ["1.2.3.4"]), false);
  assertEquals(ipAllowed("10.0.0.7", ["10.0.0.0/24"]), true);
  assertEquals(ipAllowed("10.0.1.7", ["10.0.0.0/24"]), false);
  assertEquals(ipAllowed("1.2.3.4", []), true, "sin whitelist no hay restricción");
  // Con cabeceras falsas y sin la del proxy, una llave con whitelist NO pasa.
  assertEquals(ipAllowed(clientIp(pedido(FALSAS)), ["1.2.3.4"]), false);
});

Deno.test("cupo por minuto: Retry-After ≤ 60 s y X-RateLimit-Reset es la próxima hora", () => {
  const ahora = Date.parse("2026-09-25T18:42:30Z");
  const c = cabecerasDeCupo({ permitido: false, limite: 1000, restantes: 940, reinicio: "2026-09-25T18:43:00+00:00", motivo: "minuto", limite_minuto: 60 }, ahora);
  assert(c.porMinuto);
  assertEquals(c.esperaSeg, 30);
  assertEquals(c.cabeceras["X-RateLimit-Reset"], String(Date.parse("2026-09-25T19:00:00Z") / 1000));
  assertEquals(c.cabeceras["X-RateLimit-Remaining"], "940");
});

Deno.test("cupo por hora: Reset y Retry-After apuntan a la hora siguiente", () => {
  const ahora = Date.parse("2026-09-25T18:42:30Z");
  const c = cabecerasDeCupo({ permitido: false, limite: 1000, restantes: 0, reinicio: "2026-09-25T19:00:00+00:00", motivo: "hora" }, ahora);
  assert(!c.porMinuto);
  assertEquals(c.esperaSeg, 17 * 60 + 30);
  assertEquals(c.cabeceras["X-RateLimit-Reset"], String(Date.parse("2026-09-25T19:00:00Z") / 1000));
});

// ─── El cuerpo de una escritura ──────────────────────────────────────────────

const JSON_CT = { "content-type": "application/json" };
/** Un Request cuyo cuerpo llega en trozos, SIN Content-Length (como un chunked). */
function enTrozos(trozos: Uint8Array[], cabeceras: Record<string, string> = JSON_CT) {
  let i = 0;
  const leidos = { trozos: 0 };
  // highWaterMark 0: el stream no adelanta nada; cada trozo sale solo cuando se lee.
  const cuerpo = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < trozos.length) { leidos.trozos++; c.enqueue(trozos[i++]); } else c.close();
    },
  }, { highWaterMark: 0 });
  return { req: new Request("https://x/functions/v1/public-api/messenger/conversations", { method: "POST", headers: cabeceras, body: cuerpo }), leidos };
}
const bytes = (s: string) => new TextEncoder().encode(s);

Deno.test("cuerpo: 4.000 emojis escritos con escapes entran (y el texto llega entero)", async () => {
  // 🙂 = \ud83d\ude42: 12 bytes escapados. 4.000 = 48.000 bytes + el resto del JSON.
  const texto = "\\ud83d\\ude42".repeat(4000);
  const cuerpo = `{"text":"${texto}"}`;
  assert(cuerpo.length > 48_000 && cuerpo.length < CUERPO_MAX_BYTES, `${cuerpo.length} bytes`);
  const r = await leerCuerpo(new Request("https://x/", { method: "POST", headers: JSON_CT, body: cuerpo }));
  assert(r.ok, JSON.stringify(r));
  assertEquals([...JSON.parse(r.texto).text].length, 4000);
  // Igual en trozos y sin Content-Length.
  const t = await leerCuerpo(enTrozos([bytes(cuerpo.slice(0, 30_000)), bytes(cuerpo.slice(30_000))]).req);
  assert(t.ok && t.texto === cuerpo);
});

Deno.test("cuerpo: 413 por Content-Length SIN leer nada, y 413 en streaming cuando falta o miente", async () => {
  // Con Content-Length de más: ni un trozo leído.
  const { req, leidos } = enTrozos([bytes("{}")], { ...JSON_CT, "content-length": String(CUERPO_MAX_BYTES + 1) });
  assertEquals(await leerCuerpo(req), { ok: false, estado: 413 });
  assertEquals(leidos.trozos, 0, "leyó el cuerpo aunque el Content-Length ya pasaba del tope");
  // Un Content-Length que no es un número tampoco pasa.
  assertEquals(await leerCuerpo(enTrozos([bytes("{}")], { ...JSON_CT, "content-length": "12abc" }).req), { ok: false, estado: 413 });
  // Sin Content-Length: se corta en cuanto pasa del tope, sin leer lo que sigue.
  const kb = new Uint8Array(1024).fill(0x61);
  const muchos = enTrozos(Array.from({ length: 1000 }, () => kb));
  assertEquals(await leerCuerpo(muchos.req), { ok: false, estado: 413 });
  assert(muchos.leidos.trozos <= 66, `leyó ${muchos.leidos.trozos} KB de 1000 (tenía que cortar en 64)`);
  // Exacto en el tope entra; un byte más, no.
  const justo = new Uint8Array(CUERPO_MAX_BYTES).fill(0x20);
  assert((await leerCuerpo(enTrozos([justo]).req)).ok);
  assertEquals(await leerCuerpo(enTrozos([justo, bytes(" ")]).req), { ok: false, estado: 413 });
  // Un tope más chico, por parámetro.
  assertEquals(await leerCuerpo(enTrozos([bytes("12345")]).req, 4), { ok: false, estado: 413 });
});

Deno.test("cuerpo: 415 si no dice que es JSON (o es otro charset); el charset utf-8 sí", async () => {
  for (const ct of [null, "text/plain", "application/x-www-form-urlencoded", "application/json-patch+json", "application/json; charset=latin1", "multipart/form-data"]) {
    const h: Record<string, string> = ct === null ? {} : { "content-type": ct };
    assertEquals(await leerCuerpo(new Request("https://x/", { method: "POST", headers: h, body: "{}" })), { ok: false, estado: 415 }, String(ct));
  }
  for (const ct of ["application/json", "Application/JSON", "application/json; charset=utf-8", 'application/json;charset="UTF-8"']) {
    assert(esJson(ct), ct);
    assert((await leerCuerpo(new Request("https://x/", { method: "POST", headers: { "content-type": ct }, body: "{}" }))).ok, ct);
  }
});

Deno.test("cuerpo: UTF-8 inválido es un 400 (no se reemplaza por U+FFFD)", async () => {
  for (const malos of [[0x7b, 0xff, 0x7d], [0xc3], [0xed, 0xa0, 0x80], [0xe2, 0x82]]) {
    const r = await leerCuerpo(new Request("https://x/", { method: "POST", headers: JSON_CT, body: new Uint8Array(malos) }));
    assertEquals(r, { ok: false, estado: 400 }, JSON.stringify(malos));
  }
  const bien = await leerCuerpo(new Request("https://x/", { method: "POST", headers: JSON_CT, body: bytes('{"text":"ñandú 🙂"}') }));
  assert(bien.ok && JSON.parse(bien.texto).text === "ñandú 🙂");
});

// ─── fetch sin reintentos ────────────────────────────────────────────────────

/** Cambia el fetch global mientras corre `f`, contando las llamadas. */
async function conFetch(falso: (n: number, init?: RequestInit) => Promise<Response>, f: () => Promise<void>) {
  const original = globalThis.fetch;
  const vistos: { n: number } = { n: 0 };
  globalThis.fetch = ((_: unknown, init?: RequestInit) => falso(++vistos.n, init)) as typeof fetch;
  try {
    await f();
  } finally {
    globalThis.fetch = original;
  }
  return vistos.n;
}

Deno.test("fetchSinReintentos: un 503/520 sale como 502, y un pedido marcado como reintento se corta", async () => {
  for (const estado of [503, 520]) {
    await conFetch(() => Promise.resolve(new Response("x", { status: estado, headers: { "Retry-After": "1" } })), async () => {
      const r = await fetchSinReintentos(1_000)("https://x");
      assertEquals(r.status, 502);
      assertEquals(r.headers.get("Retry-After"), "1");
    });
  }
  await conFetch(() => Promise.resolve(new Response("{}", { status: 200 })), async () => {
    assertEquals((await fetchSinReintentos(1_000)("https://x")).status, 200);
    let err: unknown = null;
    await fetchSinReintentos(1_000)("https://x", { headers: { "X-Retry-Count": "1" } }).catch((e) => (err = e));
    assert(err instanceof DOMException && err.name === "AbortError", "un reintento no se corta");
  });
});

Deno.test("fetchSinReintentos: una falla de red o el plazo salen como AbortError, y el plazo corta", async () => {
  await conFetch(() => Promise.reject(new TypeError("fetch failed")), async () => {
    let err: unknown = null;
    await fetchSinReintentos(1_000)("https://x").catch((e) => (err = e));
    assert(err instanceof DOMException && err.name === "AbortError");
  });
  const t0 = Date.now();
  await conFetch((_, init) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init!.signal!.reason))), async () => {
    let err: unknown = null;
    await fetchSinReintentos(150)("https://x").catch((e) => (err = e));
    assert(err instanceof DOMException && err.name === "AbortError");
  });
  assert(Date.now() - t0 < 1_000, "el plazo no cortó");
});

Deno.test("fetchSinReintentos con supabase-js de verdad: NINGÚN reintento (GET, POST, red, 503)", async () => {
  // postgrest-js reintenta por su cuenta GET/HEAD que fallan por red y todo 503/520
  // (hasta 3 veces, con esperas de 1+2+4 s). Con fetchSinReintentos: una sola llamada.
  const cliente = () => createClient("https://proyecto.supabase.co", "anon", {
    global: { fetch: fetchSinReintentos(2_000) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const casos: [string, () => Promise<Response>][] = [
    ["503", () => Promise.resolve(new Response('{"message":"x"}', { status: 503, headers: { "Retry-After": "0" } }))],
    ["520", () => Promise.resolve(new Response("x", { status: 520 }))],
    ["red", () => Promise.reject(new TypeError("fetch failed"))],
  ];
  for (const [nombre, falso] of casos) {
    let resultado: { error: { code?: string } | null } | null = null;
    const n1 = await conFetch(falso, async () => {
      resultado = await cliente().from("chat_messages").select("id").limit(1);
    });
    assertEquals(n1, 1, `GET con ${nombre}: ${n1} llamadas`);
    assert(resultado!.error, `GET con ${nombre}: sin error`);
    let rpc: { error: { code?: string } | null } | null = null;
    const n2 = await conFetch(falso, async () => {
      rpc = await cliente().rpc("api_messenger_enviar", { _conversacion: "x" });
    });
    assertEquals(n2, 1, `POST con ${nombre}: ${n2} llamadas`);
    // Sin respuesta de PostgREST no hay código: el edge lo lee como resultado incierto.
    if (nombre === "red") assert(!rpc!.error?.code, `la red caída trae código: ${JSON.stringify(rpc)}`);
  }
});
