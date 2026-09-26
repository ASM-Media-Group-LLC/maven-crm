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

Deno.test("canario: el feed de verdad trae el contenido, y de acá sale SOLO cuántos, dónde y los cursores", async () => {
  // Primero: que el handler real efectivamente devuelva el canario (si no, el test no prueba nada).
  const { servirComoUsuario } = await import("../public-api/recursos-como-usuario.ts");
  const crudo = await servirComoUsuario("messenger", clienteFalso(responderFeed).cliente, {
    agenciaDeLaLlave: AGENCIA, actuaComo: YO, scopes: ["messenger:read"], ruta: ["feed"],
    consulta: { after: DESDE, exclude_own: "true", limit: "100" },
    llave: { conWhitelist: true, venceEl: new Date(Date.now() + 86_400_000).toISOString() },
    baseDeArchivos: "https://proyecto.supabase.co", cupo: { limite: 0, restantes: 0, reinicio: "x" }, idioma: "es",
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
