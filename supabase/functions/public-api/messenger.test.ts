// Tests del Messenger por API (solo lectura), con un cliente falso que imita a
// PostgREST y ANOTA cada consulta. Lo que importa probar:
//  * nunca se entrega el contenido de un mensaje borrado;
//  * el cursor no saltea ni repite mensajes del mismo instante (microsegundos);
//  * el feed mira como mucho una hora por pedido y nunca adelanta el cursor por
//    encima de lo que todavía se puede estar guardando;
//  * lo que la app esconde (lista de miembros, conversación directa vacía) también
//    se esconde acá;
//  * toda consulta a chat_messages va acotada por conversación.

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type Contexto, servirMessenger } from "./recursos-como-usuario.ts";
import {
  adjunto,
  claveDeTiempo,
  codificarCursor,
  compararMensajes,
  decodificarCursor,
  filtroDespues,
  type FilaDeMensaje,
  mensajeParaApi,
  tipoDeMensaje,
  vistaPrevia,
} from "./messenger-formato.ts";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const OTRA = "5a2d9c11-7e3b-4f60-9a8b-0c1d2e3f4a5b";
const CONV = "16750574-1111-4222-8333-944455556666";
const BASE = "https://proyecto.supabase.co";

const CTX: Contexto = {
  agenciaDeLaLlave: "30869615-f579-4981-8a1f-dbebc61eae2d",
  actuaComo: YO,
  scopes: ["messenger:read"],
  ruta: [],
  consulta: {},
  llave: { conWhitelist: true, venceEl: "2026-12-01T00:00:00Z" },
  baseDeArchivos: BASE,
  cupo: { limite: 1000, restantes: 999, reinicio: "2026-09-25T19:00:00+00:00" },
  idioma: "es",
};
const con = (ruta: string[], consulta: Record<string, string> = {}): Contexto => ({ ...CTX, ruta, consulta });

type Llamada = { tabla?: string; rpc?: string; ops: [string, unknown[]][] };
type Resp = { data: unknown; error: { message: string; code?: string } | null };

/** Cliente falso: `responder` decide qué devuelve cada consulta. Toda consulta
 *  queda anotada en `llamadas`. */
function clienteFalso(responder: (ll: Llamada) => Resp) {
  const llamadas: Llamada[] = [];
  const armar = (ll: Llamada): unknown => {
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(responder(ll)).then(res, rej);
        }
        if (prop === "maybeSingle") {
          return () => { ll.ops.push(["maybeSingle", []]); return Promise.resolve(responder(ll)); };
        }
        return (...args: unknown[]) => { ll.ops.push([String(prop), args]); return b; };
      },
    });
    return b;
  };
  const cliente = {
    from: (tabla: string) => { const ll: Llamada = { tabla, ops: [] }; llamadas.push(ll); return armar(ll); },
    rpc: (nombre: string, args?: unknown) => {
      const ll: Llamada = { rpc: nombre, ops: [["args", [args]]] };
      llamadas.push(ll);
      return Promise.resolve(responder(ll));
    },
  } as unknown as SupabaseClient;
  return { cliente, llamadas };
}

const op = (ll: Llamada, nombre: string) => ll.ops.filter(([n]) => n === nombre).map(([, a]) => a);
const ok = (data: unknown): Resp => ({ data, error: null });

function fila(parcial: Partial<FilaDeMensaje> & { id: string; created_at: string }): FilaDeMensaje {
  return {
    conversation_id: CONV, sender_id: OTRA, content: "hola", type: "text", file_url: null, file_name: null,
    reply_to_id: null, album_id: null, is_thread_reply: false, is_edited: false, is_deleted: false,
    updated_at: parcial.created_at, ...parcial,
  };
}

// ─── Puerta ──────────────────────────────────────────────────────────────────

Deno.test("sin IPs fijas o sin vencimiento: 403 y ni una consulta", async () => {
  for (const llave of [{ conWhitelist: false, venceEl: "2026-12-01T00:00:00Z" }, { conWhitelist: true, venceEl: null }]) {
    const { cliente, llamadas } = clienteFalso(() => { throw new Error("tocó la base"); });
    const r = await servirMessenger(cliente, { ...con(["conversations"]), llave });
    assert(!r.ok && r.estado === 403);
    assertEquals(llamadas.length, 0);
  }
});

Deno.test("rutas desconocidas: 404 sin tocar la base", async () => {
  for (const ruta of [[], ["chats"], ["conversations", CONV, "reactions"], ["feed", "x"], ["conversations", CONV, "messages", "x"]]) {
    const { cliente, llamadas } = clienteFalso(() => { throw new Error("tocó la base"); });
    const r = await servirMessenger(cliente, con(ruta));
    assert(!r.ok && r.estado === 404, `${ruta.join("/")} no dio 404`);
    assertEquals(llamadas.length, 0);
  }
});

// ─── /conversations/{id}/messages ────────────────────────────────────────────

Deno.test("messages: parámetros malos dan 400 sin tocar la base", async () => {
  const casos: [string[], Record<string, string>][] = [
    [["conversations", "no-es-uuid", "messages"], {}],
    [["conversations", CONV, "messages"], { limit: "0" }],
    [["conversations", CONV, "messages"], { limit: "101" }],
    [["conversations", CONV, "messages"], { limit: "diez" }],
    [["conversations", CONV, "messages"], { before: "abc", after: "def" }],
    [["conversations", CONV, "messages"], { before: "esto-no-es-un-cursor" }],
    [["conversations", CONV, "messages"], { include: "todo" }],
    [["conversations", CONV, "messages"], { thread_root_id: "x" }],
  ];
  for (const [ruta, consulta] of casos) {
    const { cliente, llamadas } = clienteFalso(() => { throw new Error("tocó la base"); });
    const r = await servirMessenger(cliente, con(ruta, consulta));
    assert(!r.ok && r.estado === 400, `${JSON.stringify(consulta)} no dio 400`);
    assertEquals(llamadas.length, 0);
  }
});

Deno.test("messages: conversación que no ve → 404 y no lee mensajes", async () => {
  const { cliente, llamadas } = clienteFalso((ll) => ll.tabla === "chat_conversations" ? ok(null) : ok([]));
  const r = await servirMessenger(cliente, con(["conversations", CONV, "messages"]));
  assert(!r.ok && r.estado === 404);
  assert(!llamadas.some((l) => l.tabla === "chat_messages"), "leyó mensajes de una conversación que no ve");
});

Deno.test("messages: un borrado sale SIN texto, texto rico ni adjunto, aunque la fila los tenga", async () => {
  const borrado = fila({
    id: "a0000000-0000-4000-8000-000000000001", created_at: "2026-09-25T10:00:00.123456+00:00",
    is_deleted: true, content: "secreto", content_rich: { type: "doc" },
    file_url: `${BASE}/storage/v1/object/public/chat-files/x/archivo.pdf`, file_name: "archivo.pdf",
  });
  const { cliente } = clienteFalso((ll) => {
    if (ll.tabla === "chat_conversations") return ok({ id: CONV });
    if (ll.tabla === "chat_messages") return ok([borrado]);
    if (ll.tabla === "profiles") return ok([]);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations", CONV, "messages"], { include: "rich" }));
  assert(r.ok);
  const m = (r.cuerpo as any).data[0];
  assertEquals([m.text, m.rich, m.attachment, m.kind, m.is_deleted], [null, null, null, null, true]);
  assert(!JSON.stringify(r.cuerpo).includes("secreto"));
});

Deno.test("messages: acotado por conversación, página+1 y cursor con microsegundos exactos", async () => {
  const filas = [
    fila({ id: "a0000000-0000-4000-8000-000000000003", created_at: "2026-09-25T10:00:00.123456+00:00" }),
    fila({ id: "a0000000-0000-4000-8000-000000000002", created_at: "2026-09-25T10:00:00.123456+00:00" }),
    fila({ id: "a0000000-0000-4000-8000-000000000001", created_at: "2026-09-25T09:59:59.9+00:00" }),
  ];
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_conversations") return ok({ id: CONV });
    if (ll.tabla === "chat_messages") return ok(filas);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations", CONV, "messages"], { limit: "2" }));
  assert(r.ok);
  const c = r.cuerpo as any;
  assertEquals(c.data.length, 2);
  assertEquals(c.has_more, true);
  assertEquals(c.order, "desc");
  const cur = decodificarCursor(c.next_cursor)!;
  assertEquals(cur, { t: "2026-09-25T10:00:00.123456+00:00", i: "a0000000-0000-4000-8000-000000000002" });
  const q = llamadas.find((l) => l.tabla === "chat_messages")!;
  assertEquals(op(q, "eq")[0], ["conversation_id", CONV]);
  assertEquals(op(q, "limit")[0], [3]);
});

Deno.test("messages: con cursor, DOS consultas (empates del instante + rango), sin or(), y en ese orden", async () => {
  // Con un solo or() el planificador leía todo un lado de la conversación (3.300+
  // bloques medidos). Cada consulta con un solo rango corta en limit+1.
  const cursor = { t: "2026-09-25T10:00:00.123456+00:00", i: "a0000000-0000-4000-8000-000000000005" };
  const empate = fila({ id: "a0000000-0000-4000-8000-000000000004", created_at: cursor.t });
  const viejo1 = fila({ id: "a0000000-0000-4000-8000-000000000009", created_at: "2026-09-25T09:00:00+00:00" });
  const viejo2 = fila({ id: "a0000000-0000-4000-8000-000000000001", created_at: "2026-09-25T08:00:00+00:00" });
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_conversations") return ok({ id: CONV });
    if (ll.tabla === "chat_messages") return ok(op(ll, "eq").some((a) => a[0] === "created_at") ? [empate] : [viejo1, viejo2]);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations", CONV, "messages"], { before: codificarCursor(cursor), limit: "2" }));
  assert(r.ok);
  const c = r.cuerpo as any;
  assertEquals(c.data.map((m: any) => m.id), [empate.id, viejo1.id], "no van primero los empates del instante");
  assertEquals(c.has_more, true);
  assertEquals(decodificarCursor(c.next_cursor), { t: viejo1.created_at, i: viejo1.id });
  const qs = llamadas.filter((l) => l.tabla === "chat_messages");
  assertEquals(qs.length, 2);
  for (const q of qs) {
    assertEquals(op(q, "eq")[0], ["conversation_id", CONV]);
    assertEquals(op(q, "or").length, 0, "volvió el or()");
    assertEquals(op(q, "limit")[0], [3]);
  }
  const [qe, qr] = [qs.find((q) => op(q, "eq").some((a) => a[0] === "created_at"))!, qs.find((q) => !op(q, "eq").some((a) => a[0] === "created_at"))!];
  assertEquals(op(qe, "lt")[0], ["id", cursor.i]);
  assertEquals(op(qr, "lt")[0], ["created_at", cursor.t]);
  assertEquals(op(qr, "order")[0], ["created_at", { ascending: false }]);
});

Deno.test("messages: con after, lo mismo hacia adelante (gt) y siempre hay cursor para seguir", async () => {
  const cursor = { t: "2026-09-25T10:00:00.123456+00:00", i: "a0000000-0000-4000-8000-000000000005" };
  const { cliente, llamadas } = clienteFalso((ll) => ll.tabla === "chat_conversations" ? ok({ id: CONV }) : ok([]));
  const r = await servirMessenger(cliente, con(["conversations", CONV, "messages"], { after: codificarCursor(cursor) }));
  assert(r.ok);
  const qs = llamadas.filter((l) => l.tabla === "chat_messages");
  assertEquals(qs.length, 2);
  assert(qs.some((q) => op(q, "gt").some((a) => a[0] === "id" && a[1] === cursor.i)));
  assert(qs.some((q) => op(q, "gt").some((a) => a[0] === "created_at" && a[1] === cursor.t)));
  assertEquals((r.cuerpo as any).order, "asc");
  assertEquals(decodificarCursor((r.cuerpo as any).next_cursor), cursor, "sin mensajes nuevos, el mismo cursor");
});

Deno.test("messages: sin cursor, una sola consulta, y sin más páginas no hay next_cursor", async () => {
  const { cliente, llamadas } = clienteFalso((ll) => ll.tabla === "chat_conversations" ? ok({ id: CONV }) : ok([]));
  const r = await servirMessenger(cliente, con(["conversations", CONV, "messages"]));
  assert(r.ok);
  assertEquals(llamadas.filter((l) => l.tabla === "chat_messages").length, 1);
  assertEquals((r.cuerpo as any).next_cursor, null);
});

// ─── /feed ───────────────────────────────────────────────────────────────────

Deno.test("feed: parámetros malos dan 400 sin tocar la base", async () => {
  const hace80h = new Date(Date.now() - 80 * 3600_000).toISOString();
  for (const consulta of [
    { after: codificarCursor({ t: "2026-09-25T10:00:00+00:00", i: CONV }), since: new Date().toISOString() },
    { since: hace80h },
    { since: "ayer" },
    { exclude_own: "si" },
    { after: "roto" },
    { after: codificarCursor({ t: "2026-09-25T10:00:00-05", i: CONV }) },
    { after: codificarCursor({ t: "2026-02-31T00:00:00Z", i: CONV }) },
    { limit: "500" },
  ]) {
    const { cliente, llamadas } = clienteFalso(() => { throw new Error("tocó la base"); });
    const r = await servirMessenger(cliente, con(["feed"], consulta));
    assert(!r.ok && r.estado === 400, `${JSON.stringify(consulta)} no dio 400`);
    assertEquals(llamadas.length, 0);
  }
});

Deno.test("feed: mira como mucho UNA hora por pedido y sigue desde ahí", async () => {
  const t = "2026-09-20T10:00:00.5+00:00"; // cursor viejo, de hace días
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_participants") return ok([{ conversation_id: CONV, role: "member", joined_at: t, last_read_at: null, is_muted: false, notifications_mode: "all" }]);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["feed"], { after: codificarCursor({ t, i: CONV }) }));
  assert(r.ok);
  const c = r.cuerpo as any;
  assertEquals(c.window.to, "2026-09-20T11:00:00.500Z");
  assertEquals(c.caught_up, false, "con un cursor de hace días no puede estar al día");
  assertEquals(c.has_more, true);
  assertEquals(decodificarCursor(c.next_cursor)!.t, "2026-09-20T11:00:00.500Z");
  const q = llamadas.find((l) => l.tabla === "chat_messages")!;
  assertEquals(op(q, "in")[0], ["conversation_id", [CONV]]);
  assertEquals(op(q, "lte")[0], ["created_at", "2026-09-20T11:00:00.500Z"]);
  assertEquals(op(q, "gte")[0], ["created_at", t]);
  assertEquals(op(q, "or")[0], [filtroDespues({ t, i: CONV })], "el feed no desempata por id");
});

Deno.test("feed: nunca adelanta el cursor por encima de ahora − 10 s", async () => {
  const hace5min = new Date(Date.now() - 5 * 60_000).toISOString();
  const { cliente } = clienteFalso((ll) =>
    ll.tabla === "chat_participants"
      ? ok([{ conversation_id: CONV, role: "member", joined_at: hace5min, last_read_at: null, is_muted: false, notifications_mode: "all" }])
      : ok([]));
  const antes = Date.now();
  const r = await servirMessenger(cliente, con(["feed"], { since: hace5min }));
  assert(r.ok);
  const c = r.cuerpo as any;
  const hasta = Date.parse(c.window.to);
  assert(hasta <= antes - 10_000 + 50 && hasta >= antes - 10_000 - 1000, `la ventana cierra en ${c.window.to}`);
  assertEquals(c.caught_up, true);
});

Deno.test("feed: un cursor en el futuro no avanza ni consulta mensajes", async () => {
  const futuro = { t: new Date(Date.now() + 3600_000).toISOString(), i: CONV };
  const { cliente, llamadas } = clienteFalso(() => ok([]));
  const r = await servirMessenger(cliente, con(["feed"], { after: codificarCursor(futuro) }));
  assert(r.ok);
  assertEquals(decodificarCursor((r.cuerpo as any).next_cursor), futuro);
  assert(!llamadas.some((l) => l.tabla === "chat_messages"));
});

Deno.test("feed: más de 100 conversaciones van en tandas y se mezclan en orden", async () => {
  const ids = Array.from({ length: 150 }, (_, k) => `c0000000-0000-4000-8000-${String(k).padStart(12, "0")}`);
  const desde = new Date(Date.now() - 30 * 60_000);
  const enMin = (m: number) => new Date(desde.getTime() + m * 60_000).toISOString().replace("Z", "+00:00");
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_participants") return ok(ids.map((conversation_id) => ({ conversation_id, role: "member", joined_at: enMin(0), last_read_at: null, is_muted: false, notifications_mode: "all" })));
    if (ll.tabla === "chat_messages") {
      const tanda = op(ll, "in")[0][1] as string[];
      return ok(tanda.includes(ids[0])
        ? [fila({ id: "b0000000-0000-4000-8000-000000000001", conversation_id: ids[0], created_at: enMin(2) }),
           fila({ id: "b0000000-0000-4000-8000-000000000003", conversation_id: ids[1], created_at: enMin(6) })]
        : [fila({ id: "b0000000-0000-4000-8000-000000000002", conversation_id: ids[120], created_at: enMin(4) })]);
    }
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["feed"], { since: desde.toISOString(), limit: "2" }));
  assert(r.ok);
  const tandas = llamadas.filter((l) => l.tabla === "chat_messages");
  assertEquals(tandas.length, 2);
  assertEquals((op(tandas[0], "in")[0][1] as string[]).length, 100);
  const c = r.cuerpo as any;
  assertEquals(c.data.map((m: any) => m.id), ["b0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000002"]);
  assertEquals(c.has_more, true);
  assertEquals(decodificarCursor(c.next_cursor)!.i, "b0000000-0000-4000-8000-000000000002");
});

Deno.test("feed: exclude_own=true filtra lo propio en la consulta", async () => {
  const { cliente, llamadas } = clienteFalso((ll) =>
    ll.tabla === "chat_participants"
      ? ok([{ conversation_id: CONV, role: "member", joined_at: "2026-09-25T00:00:00+00:00", last_read_at: null, is_muted: false, notifications_mode: "all" }])
      : ok([]));
  await servirMessenger(cliente, con(["feed"], { exclude_own: "true" }));
  const q = llamadas.find((l) => l.tabla === "chat_messages")!;
  assertEquals(op(q, "neq")[0], ["sender_id", YO]);
});

// ─── /conversations/{id} ─────────────────────────────────────────────────────

const GRUPO = {
  id: CONV, type: "group", name: "Equipo", description: null, avatar_url: null, created_by: OTRA,
  created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-09-25T00:00:00+00:00",
  msg_permission: "all", members_visibility: "admins", info_permission: "admins", add_permission: "admins", require_approval: false,
};
const miFila = (role: string) => ({ conversation_id: CONV, role, joined_at: "2026-01-02T00:00:00+00:00", last_read_at: "2026-09-25T00:00:00+00:00", is_muted: false, notifications_mode: "all" });

Deno.test("detalle: grupo que esconde miembros → un miembro NO ve la lista (ni se consulta)", async () => {
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_conversations") return ok(GRUPO);
    if (ll.tabla === "chat_participants" && op(ll, "maybeSingle").length) return ok(miFila("member"));
    if (ll.tabla === "chat_participants") return ok([{ user_id: OTRA, role: "member", joined_at: "2026-01-03T00:00:00+00:00" }]);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations", CONV]));
  assert(r.ok);
  const d = (r.cuerpo as any).data;
  assertEquals([d.participants, d.member_count, d.participants_hidden], [null, null, true]);
  assertEquals(d.created_by, null, "con la lista escondida, el creador tampoco sale");
  assertEquals(llamadas.filter((l) => l.tabla === "chat_participants").length, 1, "consultó la lista de miembros");
});

Deno.test("detalle: el admin DEL GRUPO sí la ve, y de los demás no sale cuándo leyeron", async () => {
  const { cliente } = clienteFalso((ll) => {
    if (ll.tabla === "chat_conversations") return ok(GRUPO);
    if (ll.tabla === "chat_participants" && op(ll, "maybeSingle").length) return ok(miFila("admin"));
    if (ll.tabla === "chat_participants") {
      return ok([{ user_id: YO, role: "admin", joined_at: "2026-01-02T00:00:00+00:00", last_read_at: "x", is_muted: true },
                 { user_id: OTRA, role: "member", joined_at: "2026-01-03T00:00:00+00:00", last_read_at: "y", is_muted: true }]);
    }
    if (ll.tabla === "profiles") return ok([{ id: OTRA, full_name: "Otra", avatar_url: null }]);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations", CONV]));
  assert(r.ok);
  const d = (r.cuerpo as any).data;
  assertEquals(d.member_count, 2);
  assertEquals(d.created_by, OTRA, "el admin del grupo sí ve quién lo creó");
  assertEquals(d.participants[1], { user: { id: OTRA, name: "Otra", avatar_url: null }, role: "member", joined_at: "2026-01-03T00:00:00+00:00" });
  assert(!JSON.stringify(d.participants).includes("last_read_at"));
  assert(!JSON.stringify(d.participants).includes("is_muted"));
});

Deno.test("detalle: una conversación que no ve es 404 (no se confirma que exista)", async () => {
  const { cliente } = clienteFalso(() => ok(null));
  const r = await servirMessenger(cliente, con(["conversations", CONV]));
  assert(!r.ok && r.estado === 404);
});

// ─── /conversations ──────────────────────────────────────────────────────────

Deno.test("bandeja: esconde la directa vacía ajena, tapa los no leídos en 100 y ordena por actividad", async () => {
  const D1 = "d1000000-0000-4000-8000-000000000001", D2 = "d2000000-0000-4000-8000-000000000002", G = CONV;
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_participants" && op(ll, "eq").some((a) => a[0] === "user_id")) {
      return ok([D1, D2, G].map((conversation_id) => ({ ...miFila("member"), conversation_id })));
    }
    if (ll.tabla === "chat_conversations") {
      return ok([
        { id: D1, type: "direct", name: null, avatar_url: null, created_by: OTRA, created_at: "2026-09-01T00:00:00+00:00", updated_at: "2026-09-01T00:00:00+00:00" },
        { id: D2, type: "direct", name: null, avatar_url: null, created_by: YO, created_at: "2026-09-02T00:00:00+00:00", updated_at: "2026-09-02T00:00:00+00:00" },
        { ...GRUPO, id: G, name: "Equipo" },
      ]);
    }
    if (ll.rpc === "get_last_messages") {
      return ok([fila({ id: "e0000000-0000-4000-8000-000000000001", conversation_id: G, created_at: "2026-09-25T12:00:00+00:00", content: "x".repeat(500) })]);
    }
    if (ll.rpc === "messenger_unread_counts") return ok([{ conversation_id: G, unread_count: 101 }]);
    if (ll.tabla === "chat_participants") return ok([{ conversation_id: D2, user_id: OTRA }]);
    if (ll.tabla === "profiles") return ok([{ id: OTRA, full_name: "Otra", avatar_url: null }]);
    if (ll.tabla === "chat_pinned") return ok([{ conversation_id: G, position: 1 }]);
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations"]));
  assert(r.ok);
  const c = r.cuerpo as any;
  // D1: directa, la creó la otra persona y no tiene mensajes → escondida, como en la app.
  assertEquals(c.data.map((x: any) => x.id), [G, D2]);
  assertEquals(c.count, 2);
  assertEquals([c.data[0].unread_count, c.data[0].unread_count_capped, c.data[0].is_pinned], [100, true, true]);
  assertEquals(c.data[0].last_message.text_preview.length, 200);
  assertEquals(c.data[1].counterpart, { id: OTRA, name: "Otra", avatar_url: null });
  assert(!llamadas.some((l) => l.rpc === "get_unread_counts"), "usó el conteo caro de la app");
});

Deno.test("bandeja: si el conteo de no leídos falla, dice null (no inventa ni cae al caro)", async () => {
  const { cliente, llamadas } = clienteFalso((ll) => {
    if (ll.tabla === "chat_participants") return ok([{ ...miFila("member"), conversation_id: CONV }]);
    if (ll.tabla === "chat_conversations") return ok([{ ...GRUPO }]);
    if (ll.rpc === "messenger_unread_counts") return { data: null, error: { message: "not found", code: "PGRST202" } };
    return ok([]);
  });
  const r = await servirMessenger(cliente, con(["conversations"]));
  assert(r.ok);
  assertEquals((r.cuerpo as any).data[0].unread_count, null);
  assert(!llamadas.some((l) => l.rpc === "get_unread_counts"));
});

// ─── Piezas puras ────────────────────────────────────────────────────────────

Deno.test("cursor: ida y vuelta exacta, y uno alterado no pasa", () => {
  const c = { t: "2026-09-25T10:00:00.123456+00:00", i: "a0000000-0000-4000-8000-000000000002" };
  assertEquals(decodificarCursor(codificarCursor(c)), c);
  for (const malo of ["", "@@@", codificarCursor({ t: "ayer", i: c.i }), codificarCursor({ t: c.t, i: "x" }), btoa("[]")]) {
    assertEquals(decodificarCursor(malo), null, `aceptó ${malo}`);
  }
  // Fechas que pasan una regex floja pero no existen, o que JS no sabe leer.
  for (const t of ["2026-09-25T10:00:00-05", "2026-02-31T00:00:00Z", "2026-09-25T25:00:00Z", "2026-13-01T00:00:00Z", "2026-09-25T10:00:00+0000"]) {
    assertEquals(decodificarCursor(codificarCursor({ t, i: c.i })), null, `aceptó la fecha ${t}`);
  }
  for (const t of ["2026-09-25T10:00:00Z", "2026-09-25T10:00:00.5+00:00", "2024-02-29T00:00:00+00:00"]) {
    assert(decodificarCursor(codificarCursor({ t, i: c.i })) !== null, `rechazó la fecha buena ${t}`);
  }
  assertEquals(filtroDespues(c), `created_at.gt."${c.t}",and(created_at.eq."${c.t}",id.gt.${c.i})`);
});

Deno.test("orden de marcas de tiempo sin perder microsegundos", () => {
  // Postgres saca la fracción sin ceros al final: .12345 es MENOR que .1235.
  assert(claveDeTiempo("2026-09-25T10:00:00.12345+00:00") < claveDeTiempo("2026-09-25T10:00:00.1235+00:00"));
  assert(claveDeTiempo("2026-09-25T10:00:00+00:00") < claveDeTiempo("2026-09-25T10:00:00.5+00:00"));
  const a = { created_at: "2026-09-25T10:00:00.1+00:00", id: "b" }, b = { created_at: "2026-09-25T10:00:00.100000+00:00", id: "c" };
  assertEquals(compararMensajes(a, b), -1, "mismo instante: desempata por id");
});

Deno.test("tipo de mensaje: el mismo criterio que la pantalla", () => {
  const t = (type: string, file_url: string | null, file_name: string | null = null) => tipoDeMensaje({ type, file_url, file_name });
  assertEquals(t("system", null), "system");
  assertEquals(t("text", null), "text");
  assertEquals(t("image", "https://x/a.jpg"), "image");
  assertEquals(t("file", "https://media.giphy.com/a.mp4", "gif.mp4"), "gif");
  assertEquals(t("file", "https://x/voice-note-1.webm", "voice-note-1.webm"), "voice_note");
  assertEquals(t("file", "https://x/cancion.mp3", "cancion.mp3"), "audio");
  assertEquals(t("file", "https://x/clip.mp4", "clip.mp4"), "video");
  assertEquals(t("file", "https://x/doc.pdf", "doc.pdf"), "file");
});

Deno.test("adjuntos: solo https, y se reconoce lo guardado en Maven", () => {
  assertEquals(adjunto("http://x/a.pdf", "a.pdf", BASE), null);
  assertEquals(adjunto("javascript:alert(1)", null, BASE), null);
  assertEquals(adjunto(`${BASE}/storage/v1/object/public/chat-files/u%201/a%20b.pdf`, "a b.pdf", BASE),
    { url: `${BASE}/storage/v1/object/public/chat-files/u%201/a%20b.pdf`, name: "a b.pdf", hosted_by: "maven", storage_path: "u 1/a b.pdf" });
  assertEquals(adjunto("https://media.giphy.com/x.mp4", "gif.mp4", BASE)?.hosted_by, "external");
});

Deno.test("vista previa y mensaje: nada del contenido si está borrado", () => {
  const m = fila({ id: "a0000000-0000-4000-8000-000000000009", created_at: "2026-09-25T10:00:00+00:00", is_deleted: true, content: "secreto", content_rich: { t: 1 } });
  assertEquals(vistaPrevia(m).text_preview, null);
  const api = mensajeParaApi(m, undefined, { conRico: true, baseMaven: BASE });
  assert(!JSON.stringify(api).includes("secreto"));
  assertEquals(api.rich, null);
});
