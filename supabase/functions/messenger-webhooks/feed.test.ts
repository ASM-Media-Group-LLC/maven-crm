// El feed como la persona, para el timbre: que del contenido de los mensajes no
// salga NADA, que las fallas se reduzcan a clases cerradas y que cada pedido tenga
// plazo. Con el handler REAL del feed (servirComoUsuario) y un cliente falso que
// imita a PostgREST, como messenger.test.ts.
// Correr: deno test --allow-read --no-lock supabase/functions/messenger-webhooks/feed.test.ts

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { codificarCursor, decodificarCursor } from "../public-api/messenger-formato.ts";
import { DETALLE_TOPE_CONVERSACIONES } from "../public-api/recursos-como-usuario.ts";
import { clasificar503, extraerDelFeed, fetchConPlazo, leerFeedCon, type PedidoDelFeed } from "./feed.ts";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const OTRA = "5a2d9c11-7e3b-4f60-9a8b-0c1d2e3f4a5b";
const AGENCIA = "30869615-f579-4981-8a1f-dbebc61eae2d";
const CONV_A = "16750574-1111-4222-8333-944455556666";
const CONV_B = "26750574-1111-4222-8333-944455556667";
const CANARIO = "CANARIO-7d1f";

type Llamada = { tabla?: string; rpc?: string; ops: [string, unknown[]][] };
type Resp = { data: unknown; error: { message: string; code?: string } | null };

function clienteFalso(responder: (ll: Llamada) => Resp) {
  const llamadas: Llamada[] = [];
  const armar = (ll: Llamada): unknown => {
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(responder(ll)).then(res, rej);
        }
        if (prop === "maybeSingle") return () => (ll.ops.push(["maybeSingle", []]), Promise.resolve(responder(ll)));
        return (...args: unknown[]) => (ll.ops.push([String(prop), args]), b);
      },
    });
    return b;
  };
  const cliente = {
    from: (tabla: string) => {
      const ll: Llamada = { tabla, ops: [] };
      llamadas.push(ll);
      return armar(ll);
    },
    rpc: (nombre: string, args?: unknown) => {
      const ll: Llamada = { rpc: nombre, ops: [["args", [args]]] };
      llamadas.push(ll);
      return Promise.resolve(responder(ll));
    },
  } as unknown as SupabaseClient;
  return { cliente, llamadas };
}
const ok = (data: unknown): Resp => ({ data, error: null });

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString().replace("Z", "+00:00");
const DESDE = codificarCursor({ t: hace(30), i: "00000000-0000-0000-0000-000000000000" });

function pedido(extra: Partial<PedidoDelFeed> = {}): PedidoDelFeed {
  return {
    persona: YO, agencia: AGENCIA, scopes: ["messenger:read"], conWhitelist: true,
    venceEl: new Date(Date.now() + 86_400_000).toISOString(), despues: DESDE, sinPropios: true,
    hastaMs: Date.now() + 10_000, ...extra,
  };
}

/** Mensajes con contenido de verdad: texto, adjunto, remitente con nombre y foto. */
function mensajes() {
  return [
    {
      id: "a0000000-0000-4000-8000-000000000001", conversation_id: CONV_A, sender_id: OTRA,
      content: `hola ${CANARIO}`, content_rich: { t: CANARIO }, type: "text", file_url: `https://x/${CANARIO}.pdf`,
      file_name: `${CANARIO}.pdf`, reply_to_id: null, album_id: null, is_thread_reply: false, is_edited: false,
      is_deleted: false, created_at: hace(20), updated_at: hace(20),
    },
    {
      id: "a0000000-0000-4000-8000-000000000002", conversation_id: CONV_B, sender_id: OTRA,
      content: `chau ${CANARIO}`, type: "image", file_url: `https://x/${CANARIO}.png`, file_name: `${CANARIO}.png`,
      reply_to_id: null, album_id: null, is_thread_reply: false, is_edited: false, is_deleted: false,
      created_at: hace(19), updated_at: hace(19),
    },
    {
      id: "a0000000-0000-4000-8000-000000000003", conversation_id: CONV_A, sender_id: OTRA,
      content: CANARIO, type: "text", file_url: null, file_name: null, reply_to_id: null, album_id: null,
      is_thread_reply: false, is_edited: false, is_deleted: false, created_at: hace(18), updated_at: hace(18),
    },
  ];
}

function responderFeed(ll: Llamada): Resp {
  if (ll.rpc === "current_tenant_id") return ok(AGENCIA);
  if (ll.tabla === "chat_participants") {
    return ok([CONV_A, CONV_B].map((c) => ({ conversation_id: c, role: "member", joined_at: hace(999), last_read_at: null, is_muted: false, notifications_mode: "all" })));
  }
  if (ll.tabla === "chat_messages") return ok(mensajes());
  if (ll.tabla === "profiles") return ok([{ id: OTRA, full_name: `Nombre ${CANARIO}`, avatar_url: `https://x/${CANARIO}.jpg` }]);
  return { data: null, error: { message: `tabla inesperada ${CANARIO}` } };
}

Deno.test("canario: el feed de verdad trae el contenido, y de aquí sale SOLO cuántos, dónde y los cursores", async () => {
  // Primero: que el handler real efectivamente devuelva el canario (si no, el test no prueba nada).
  const { servirComoUsuario } = await import("../public-api/recursos-como-usuario.ts");
  const crudo = await servirComoUsuario("messenger", clienteFalso(responderFeed).cliente, {
    agenciaDeLaLlave: AGENCIA, actuaComo: YO, scopes: ["messenger:read"], ruta: ["feed"],
    consulta: { after: DESDE, exclude_own: "true", limit: "100" },
    llave: { conWhitelist: true, venceEl: new Date(Date.now() + 86_400_000).toISOString() },
    baseDeArchivos: "https://proyecto.supabase.co", cupo: { limite: 0, restantes: 0, reinicio: "x" }, idioma: "es",
    metodo: "GET", cuerpo: null, idempotencia: null,
  });
  assert(crudo.ok && JSON.stringify(crudo.cuerpo).includes(CANARIO), `el feed real trae el contenido: ${JSON.stringify(crudo).slice(0, 300)}`);

  const { cliente, llamadas } = clienteFalso(responderFeed);
  const p = await leerFeedCon(cliente, pedido());
  assert(p.ok, JSON.stringify(p));
  assertEquals(Object.keys(p).sort(), ["cantidad", "conversaciones", "hayMas", "ok", "siguiente"]);
  assertEquals(p.cantidad, 3);
  assertEquals(p.conversaciones.sort(), [CONV_A, CONV_B].sort());
  assert(decodificarCursor(p.siguiente), "el siguiente es un cursor del feed");
  assert(!JSON.stringify(p).includes(CANARIO), "ni rastro del contenido");
  // Y se leyó como la persona, por la entrada que mira scope y agencia.
  assert(llamadas.some((l) => l.rpc === "current_tenant_id"), "servirComoUsuario verificó la agencia de la sesión");
  const msgs = llamadas.find((l) => l.tabla === "chat_messages")!;
  assert(msgs.ops.some(([n, a]) => n === "neq" && a[0] === "sender_id" && a[1] === YO), "exclude_own llegó al feed");
});

Deno.test("canario: un 503 con el mensaje de la base adentro sale como una clase, sin el texto", async () => {
  const conError = (ll: Llamada): Resp =>
    ll.rpc === "current_tenant_id" ? { data: null, error: { message: `boom ${CANARIO}` } } : responderFeed(ll);
  const p = await leerFeedCon(clienteFalso(conError).cliente, pedido());
  assertEquals(p, { ok: false, permanente: false, falla: "sesion" });
  const otraAgencia = (ll: Llamada): Resp => (ll.rpc === "current_tenant_id" ? ok("99999999-0000-4000-8000-000000000000") : responderFeed(ll));
  assertEquals(await leerFeedCon(clienteFalso(otraAgencia).cliente, pedido()), { ok: false, permanente: false, falla: "sesion" });
  const mensajesRotos = (ll: Llamada): Resp => (ll.tabla === "chat_messages" ? { data: null, error: { message: CANARIO } } : responderFeed(ll));
  const r = await leerFeedCon(clienteFalso(mensajesRotos).cliente, pedido());
  assertEquals(r, { ok: false, permanente: false, falla: "base" });
  assert(!JSON.stringify(r).includes(CANARIO));
});

Deno.test("el tope de conversaciones es permanente, con el texto que exporta el propio feed (handler real)", async () => {
  const muchas = (ll: Llamada): Resp =>
    ll.tabla === "chat_participants"
      ? ok(Array.from({ length: 501 }, (_, n) => ({ conversation_id: `c${n}`, role: "member" })))
      : responderFeed(ll);
  assertEquals(await leerFeedCon(clienteFalso(muchas).cliente, pedido()), { ok: false, permanente: true, falla: "tope" });
  assertEquals(clasificar503(DETALLE_TOPE_CONVERSACIONES), { ok: false, permanente: true, falla: "tope" });
  assertEquals(clasificar503("la sesión fabricada no es de la agencia de la llave (base: x)").ok, false);
  assertEquals(clasificar503("feed: timeout").ok === false && (clasificar503("feed: timeout") as { falla: string }).falla, "base");
});

Deno.test("un pedido que el feed rechaza (cursor roto, sin scope, llave sin reglas) es permanente", async () => {
  const f = clienteFalso(responderFeed).cliente;
  assertEquals(await leerFeedCon(f, pedido({ despues: "esto-no-es-un-cursor" })), { ok: false, permanente: true, falla: "feed_400" });
  assertEquals(await leerFeedCon(f, pedido({ scopes: ["creators:read"] })), { ok: false, permanente: true, falla: "feed_403" });
  assertEquals(await leerFeedCon(f, pedido({ conWhitelist: false })), { ok: false, permanente: true, falla: "feed_403" });
});

Deno.test("extraerDelFeed: solo esas claves; una forma rara no pasa por buena", () => {
  const p = extraerDelFeed({ data: [{ conversation_id: CONV_A, text: CANARIO }], next_cursor: DESDE, has_more: true, caught_up: false });
  assertEquals(p, { ok: true, cantidad: 1, conversaciones: [CONV_A], siguiente: DESDE, hayMas: true });
  for (const malo of [null, {}, { data: [], next_cursor: 1, has_more: true }, { data: [{}], next_cursor: DESDE, has_more: false }, { data: "x", next_cursor: DESDE, has_more: false }]) {
    assertEquals(extraerDelFeed(malo), { ok: false, permanente: false, falla: "forma" }, JSON.stringify(malo));
  }
});

Deno.test("fetchConPlazo: corta el pedido al vencer (entre 0,5 y 5 s) y respeta la señal del que llama", async () => {
  const original = globalThis.fetch;
  const vistos: number[] = [];
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => {
      const t0 = Date.now();
      init?.signal?.addEventListener("abort", () => (vistos.push(Date.now() - t0), rej(new DOMException("abortado", "AbortError"))));
    })) as typeof fetch;
  try {
    let err: unknown = null;
    await fetchConPlazo(() => 0)("https://x").catch((e) => (err = e));
    assert(err, "se cortó");
    assert(vistos[0] >= 450 && vistos[0] < 1_500, `el mínimo es 0,5 s (${vistos[0]} ms)`);
    const propio = new AbortController();
    const p = fetchConPlazo(() => 60_000)("https://x", { signal: propio.signal }).catch(() => "cortado");
    propio.abort();
    assertEquals(await p, "cortado", "la señal del que llama sigue valiendo");
  } finally {
    globalThis.fetch = original;
  }
});


// ─── lo que encontró la revisión por mutaciones ──────────────────────────────

Deno.test("leerFeedCon: páginas de 100, sin vencimiento no hay feed, y una excepción NO es permanente", async () => {
  const { cliente, llamadas } = clienteFalso(responderFeed);
  assert((await leerFeedCon(cliente, pedido())).ok);
  const msgs = llamadas.find((l) => l.tabla === "chat_messages")!;
  assert(msgs.ops.some(([n, a]) => n === "limit" && a[0] === 101), "limit 100 (+1 para saber si hay más)");
  assertEquals(await leerFeedCon(clienteFalso(responderFeed).cliente, pedido({ venceEl: null })), { ok: false, permanente: true, falla: "feed_403" });
  const tira = { rpc: () => { throw new Error(CANARIO); }, from: () => { throw new Error(CANARIO); } } as unknown as SupabaseClient;
  assertEquals(await leerFeedCon(tira, pedido()), { ok: false, permanente: false, falla: "base" }, "un bug o una red caída no detiene el endpoint");
});

Deno.test("fetchConPlazo: el plazo va de 0,5 a 5 s y se combina con la señal del que llama (las dos cortan)", async () => {
  const timeoutOriginal = AbortSignal.timeout;
  const fetchOriginal = globalThis.fetch;
  const vistos: number[] = [];
  AbortSignal.timeout = (ms: number) => (vistos.push(ms), timeoutOriginal.call(AbortSignal, ms));
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init!.signal!.reason)))) as typeof fetch;
  try {
    for (const [restante, esperado] of [[60_000, 5_000], [1_234, 1_234], [-5, 500]]) {
      const c = new AbortController();
      const p = fetchConPlazo(() => restante)("https://x", { signal: c.signal }).catch(() => "cortado");
      c.abort();
      await p;
      assertEquals(vistos.at(-1), esperado, `restante ${restante}`);
    }
    const propio = new AbortController();
    const t0 = Date.now();
    const p = fetchConPlazo(() => 5_000)("https://x", { signal: propio.signal }).catch(() => "cortado");
    propio.abort();
    assertEquals(await p, "cortado");
    assert(Date.now() - t0 < 1_000, "la señal del que llama corta en el acto, no a los 5 s");
    const t1 = Date.now();
    assertEquals(await fetchConPlazo(() => 600)("https://x", { signal: new AbortController().signal }).catch(() => "cortado"), "cortado");
    assert(Date.now() - t1 < 1_500, "y el plazo corta aunque el que llama traiga su señal");
  } finally {
    AbortSignal.timeout = timeoutOriginal;
    globalThis.fetch = fetchOriginal;
  }
});


// Con el cliente DE VERDAD (supabase-js, el mismo import que index.ts y como-usuario.ts).
Deno.test("fetchConPlazo + supabase-js: un GET que cuelga o da 503 es UN pedido de ≤ el plazo (supabase-js reintenta 3 veces por su cuenta)", async () => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const { crearDatosDespacho } = await import("./datos.ts");
  const fetchOriginal = globalThis.fetch;
  for (const modo of ["503", "cuelga"] as const) {
    let pedidos = 0;
    globalThis.fetch = ((_: unknown, init?: RequestInit) => {
      pedidos++;
      if (modo === "503") {
        return Promise.resolve(new Response('{"code":"PGRST000","message":"x"}', { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "0" } }));
      }
      return new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init!.signal!.reason)));
    }) as typeof fetch;
    try {
      const c = createClient("https://x.supabase.co", "k", {
        global: { fetch: fetchConPlazo(() => 500) },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const datos = crearDatosDespacho({ antes: c, despues: c });
      const t0 = Date.now();
      assertEquals(await datos.llave(YO, AGENCIA), { ok: false });
      assertEquals(pedidos, 1, `${modo}: un solo pedido (hubo ${pedidos})`);
      assert(Date.now() - t0 < 1_500, `${modo}: ${Date.now() - t0} ms`);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  }
});

Deno.test("leerFeedComoPersona: la sesión recibe el fetch con plazo, su falla es 'sesion', y el feed entero se corta en hastaMs (sin timers colgados)", async () => {
  const { crearLeerFeedComoPersona } = await import("./feed.ts");
  const timeoutOriginal = AbortSignal.timeout;
  const fetchOriginal = globalThis.fetch;
  const vistos: number[] = [];
  let recibido: typeof fetch | undefined;
  AbortSignal.timeout = (ms: number) => (vistos.push(ms), timeoutOriginal.call(AbortSignal, ms));
  globalThis.fetch = (() => Promise.resolve(new Response("{}"))) as typeof fetch;
  try {
    const leer = crearLeerFeedComoPersona((_persona, o) => ((recibido = o.fetch), Promise.resolve(clienteFalso(responderFeed).cliente)));
    assert((await leer(pedido({ hastaMs: Date.now() + 1_500 }))).ok);
    await recibido!("https://x");
    assert(vistos.length === 1 && vistos[0] > 1_000 && vistos[0] <= 1_500, `plazo del fetch de la sesión: ${vistos}`);
  } finally {
    AbortSignal.timeout = timeoutOriginal;
    globalThis.fetch = fetchOriginal;
  }
  assertEquals(await crearLeerFeedComoPersona(() => Promise.resolve(null))(pedido()), { ok: false, permanente: false, falla: "sesion" });
  assertEquals(await crearLeerFeedComoPersona(() => Promise.reject(new Error("x")))(pedido()), { ok: false, permanente: false, falla: "sesion" });
  const colgado = { rpc: () => new Promise(() => {}), from: () => new Promise(() => {}) } as unknown as SupabaseClient;
  let tope: ReturnType<typeof setTimeout> | undefined;
  const r = await Promise.race([
    crearLeerFeedComoPersona(() => Promise.resolve(colgado))(pedido({ hastaMs: Date.now() + 300 })),
    new Promise((res) => (tope = setTimeout(() => res("colgado"), 2_000))),
  ]);
  clearTimeout(tope);
  assertEquals(r, { ok: false, permanente: false, falla: "plazo" }, "a los 300 ms, no nunca");
});

Deno.test("fetchConPlazo: un pedido que ya viene marcado como reintento (X-Retry-Count) se corta sin tocar la red", async () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (() => (llamadas++, Promise.resolve(new Response("{}")))) as typeof fetch;
  try {
    let err: unknown = null;
    await fetchConPlazo(() => 5_000)("https://x", { headers: { "X-Retry-Count": "1" } }).catch((e) => (err = e));
    assertEquals([(err as DOMException | null)?.name, llamadas], ["AbortError", 0]);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("fetchConPlazo + supabase-js: un 503 con Retry-After largo NO hace dormir a supabase-js (vuelve en el acto)", async () => {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const original = globalThis.fetch;
  let pedidos = 0;
  globalThis.fetch = (() => (pedidos++, Promise.resolve(new Response('{"code":"PGRST000","message":"x"}', { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "30" } })))) as typeof fetch;
  try {
    const c = createClient("https://x.supabase.co", "k", {
      global: { fetch: fetchConPlazo(() => 5_000) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const t0 = Date.now();
    const r = await c.from("api_keys").select("id").limit(1);
    const ms = Date.now() - t0;
    assert(r.error, "vuelve con el error");
    assert(ms < 5_000, `tardó ${ms} ms: supabase-js durmió el Retry-After`);
    assertEquals(pedidos, 1);
  } finally {
    globalThis.fetch = original;
  }
});
