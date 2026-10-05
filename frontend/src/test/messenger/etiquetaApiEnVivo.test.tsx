// LA ETIQUETA «API» EN LO QUE LLEGA EN VIVO (PR 3 de la escritura por API).
//
// Tres cosas que pasan cuando Realtime trae un mensaje que mandó una integración,
// con los hooks REALES y una base falsa que anota cada consulta:
//  1. El aviso dentro de la app dice «BLU (API)», con el nombre de la FILA, y NO
//     le pregunta a profiles (que diría el nombre y la foto de la persona dueña de
//     la key, y es una consulta por mensaje).
//  2. El optimista de lo que estoy escribiendo solo lo reemplaza la fila que
//     escribí yo: un mensaje de MI integración (mismo sender_id, mismo texto, al
//     mismo tiempo) no se lo puede comer.
//  3. Un mensaje de una conversación que la lista no tiene (un directo que una
//     integración acaba de abrir conmigo) recarga la lista, una vez.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const USUARIO = vi.hoisted(() => ({ id: "yo-1" }));

const base = vi.hoisted(() => {
  type Filtro = { event: string; schema: string; table: string; filter?: string };
  type Escucha = { type: string; filtro: Filtro; cb: (p: unknown) => void };
  class CanalFalso {
    escuchas: Escucha[] = [];
    removido = false;
    constructor(public topic: string) {}
    on(type: string, filtro: Filtro, cb: (p: unknown) => void) { this.escuchas.push({ type, filtro, cb }); return this; }
    subscribe(cb?: (s: string) => void) { queueMicrotask(() => { if (!this.removido) cb?.("SUBSCRIBED"); }); return this; }
    send() { return Promise.resolve("ok"); }
    track() { return Promise.resolve("ok"); }
    untrack() { return Promise.resolve("ok"); }
    presenceState() { return {}; }
    unsubscribe() { return Promise.resolve("ok"); }
  }
  const canales: CanalFalso[] = [];
  const llamadas: { tabla: string; op: string; columnas?: string }[] = [];
  const ahora = "2026-10-01T12:00:00.000Z";
  const filas: Record<string, Record<string, unknown>[]> = {
    profiles: [
      { id: "yo-1", full_name: "Yo Uno", avatar_url: null, avatar_seed: null, deleted_at: null },
      { id: "otro-1", full_name: "Jhon Lopez", avatar_url: "https://fotos/jhon.jpg", avatar_seed: null, deleted_at: null },
    ],
    chat_participants: [
      { id: "p1", conversation_id: "c1", user_id: "yo-1", role: "admin", last_read_at: null, is_muted: false, notifications_mode: "all", joined_at: ahora, conversation: { type: "direct", name: null } },
      { id: "p2", conversation_id: "c1", user_id: "otro-1", role: "member", last_read_at: null, is_muted: false, notifications_mode: "all", joined_at: ahora, conversation: { type: "direct", name: null } },
    ],
    chat_conversations: [{ id: "c1", type: "direct", name: null, created_by: "yo-1", created_at: ahora, updated_at: ahora }],
  };
  const respuestasRpc: Record<string, unknown[]> = {
    get_last_messages: [{ id: "m0", conversation_id: "c1", sender_id: "otro-1", content: "hola", type: "text", created_at: ahora, is_deleted: false, api_key_id: null, api_display_name: null }],
    get_unread_counts: [{ conversation_id: "c1", unread_count: 0 }],
  };
  function cadena(tabla: string) {
    let op = "select";
    let columnas: string | undefined;
    let uno = false;
    const c: Record<string, unknown> = {};
    const devolver = () => c;
    for (const m of ["eq", "neq", "in", "gt", "lt", "gte", "lte", "order", "limit", "range", "is", "not", "or", "filter", "match", "contains", "like", "ilike"]) c[m] = devolver;
    c.select = (cols?: string) => { if (op === "select") columnas = cols; return c; };
    for (const m of ["update", "upsert", "insert", "delete"]) c[m] = () => { op = m; return c; };
    c.maybeSingle = () => { uno = true; return c; };
    c.single = () => { uno = true; return c; };
    c.then = (ok: (v: unknown) => void, mal?: (e: unknown) => void) => {
      llamadas.push({ tabla, op, columnas });
      const data = op === "select" ? (filas[tabla] ?? []) : [];
      return Promise.resolve({ data: uno ? (data[0] ?? null) : data, error: null, count: data.length }).then(ok, mal);
    };
    return c;
  }
  const supabase = {
    channel(topic: string) {
      const vivo = canales.find((c) => c.topic === topic && !c.removido);
      if (vivo) return vivo;
      const nuevo = new CanalFalso(topic);
      canales.push(nuevo);
      return nuevo;
    },
    removeChannel(c: CanalFalso) { c.removido = true; return Promise.resolve("ok"); },
    from: (tabla: string) => cadena(tabla),
    rpc: (nombre: string) => {
      const c = cadena(`rpc:${nombre}`);
      c.then = (ok: (v: unknown) => void) => Promise.resolve({ data: respuestasRpc[nombre] ?? [], error: null }).then(ok);
      return c;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  };
  return { supabase, canales, llamadas, filas };
});

const avisos = vi.hoisted(() => ({
  navegador: [] as { titulo: string; cuerpo: string }[],
  pestana: [] as string[],
  persona: [] as { nombre: string; foto: string | null; titulo: string }[],
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: USUARIO, session: null, loading: false }) }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => true }) }));
vi.mock("@/hooks/useNotificationPreferences", () => ({ useNotificationPreferences: () => ({ isCanalActivo: () => true }) }));
vi.mock("@/hooks/useNotificationSettings", () => ({
  useNotificationSettings: () => ({
    settings: { notifications_enabled: true, sound_enabled: false, dnd_enabled: false, push_enabled: false },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useBrowserNotifications", () => ({
  useBrowserNotifications: () => ({ notify: (titulo: string, cuerpo: string) => { avisos.navegador.push({ titulo, cuerpo }); } }),
  useNotificationPermission: () => {},
  playNotificationSound: () => {},
}));
vi.mock("@/hooks/useTabTitleAlert", () => ({ useTabTitleAlert: () => (texto: string) => { avisos.pestana.push(texto); } }));
vi.mock("@/lib/avisoPersona", () => ({
  avisarPersona: (a: { nombre: string; foto: string | null; titulo: string }) => { avisos.persona.push(a); },
}));
vi.mock("@/lib/plataformaPwa", async (original) => ({ ...(await original() as object), esMovil: () => false }));
vi.mock("@/lib/pushDispositivo", async (original) => ({ ...(await original() as object), tienePushEnEsteDispositivo: () => false }));
vi.mock("@/lib/insigniaDeLaApp", () => ({
  actualizarInsignia: () => Promise.resolve(),
  contarChatsSinLeer: () => 0,
  cerrarNotificacionesDeChat: () => Promise.resolve(),
}));

import { useMessengerNotifications } from "@/hooks/useMessengerNotifications";
import { useChat, useMessages, RECARGA_DESCONOCIDA_MS } from "@/hooks/useChat";

const vivos = () => base.canales.filter((c) => !c.removido);
function pasaElFiltro(filtro: string | undefined, fila: Record<string, unknown>): boolean {
  if (!filtro) return true;
  const m = filtro.match(/^(\w+)=eq\.(.+)$/);
  return !!m && String(fila[m[1]]) === m[2];
}
/** Como Realtime: la fila va a cada escucha de esa tabla/evento cuyo filtro la deja pasar. */
function llega(table: string, event: string, fila: Record<string, unknown>) {
  for (const c of vivos()) {
    for (const e of c.escuchas) {
      if (e.type !== "postgres_changes" || e.filtro.table !== table || e.filtro.event !== event) continue;
      if (!pasaElFiltro(e.filtro.filter, fila)) continue;
      e.cb({ new: fila, old: {}, eventType: event, table, schema: "public" });
    }
  }
}
const esperar = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
const dormir = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  base.canales.length = 0;
  base.llamadas.length = 0;
  avisos.navegador.length = 0;
  avisos.pestana.length = 0;
  avisos.persona.length = 0;
  localStorage.clear();
});
afterEach(async () => {
  cleanup();
  await esperar();
});

// ─── 1. El aviso dentro de la app ───────────────────────────────────────────

function Avisos() {
  useMessengerNotifications();
  return null;
}
const montarAvisos = () => render(<MemoryRouter><Avisos /></MemoryRouter>);
const preguntasAProfiles = () => base.llamadas.filter((l) => l.tabla === "profiles" && l.op === "select");

describe("el aviso de un mensaje por API", () => {
  it("dice «BLU (API)» con el nombre de la fila y no consulta profiles", async () => {
    montarAvisos();
    await esperar();
    base.llamadas.length = 0; // al montar se pide MI nombre (una vez): eso no cuenta

    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "m-api", conversation_id: "c1", sender_id: "otro-1", content: "Tu reporte está listo", type: "text",
        created_at: "2026-10-01T12:01:00.000Z", is_deleted: false, api_key_id: "key-blu", api_display_name: "BLU",
      });
    });
    await esperar();

    // MUTANTE: sin la rama de API, el nombre sale de profiles → «Jhon Lopez» y 1 consulta.
    expect(avisos.navegador).toEqual([{ titulo: "BLU (API)", cuerpo: "Tu reporte está listo" }]);
    expect(avisos.pestana).toEqual(["💬 BLU (API) te escribió"]);
    expect(preguntasAProfiles()).toEqual([]);
  });

  it("la línea base PUEDE fallar: un mensaje escrito a mano sí consulta profiles y dice el nombre", async () => {
    montarAvisos();
    await esperar();
    base.llamadas.length = 0;
    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "m-mano", conversation_id: "c1", sender_id: "otro-1", content: "hola", type: "text",
        created_at: "2026-10-01T12:01:00.000Z", is_deleted: false, api_key_id: null, api_display_name: null,
      });
    });
    await esperar();
    // La base falsa contesta el primer perfil a cualquier maybeSingle: lo que importa
    // es que la consulta se hizo y que el título sale de ella, no de la fila.
    expect(preguntasAProfiles()).toHaveLength(1);
    expect(avisos.navegador).toHaveLength(1);
    expect(avisos.navegador[0].titulo).not.toContain("(API)");
  });

  it("lo que mandó MI integración no me avisa a mí (igual que lo que escribo yo)", async () => {
    montarAvisos();
    await esperar();
    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "m-mio", conversation_id: "c1", sender_id: "yo-1", content: "hola", type: "text",
        created_at: "2026-10-01T12:01:00.000Z", is_deleted: false, api_key_id: "key-blu", api_display_name: "BLU",
      });
    });
    await esperar();
    expect(avisos.navegador).toEqual([]);
  });
});

// ─── 2. El optimista ────────────────────────────────────────────────────────

describe("el optimista solo lo reemplaza la fila escrita desde la app", () => {
  async function escriboHola() {
    const hook = renderHook(() => useMessages("c1"));
    await esperar();
    await act(async () => { await hook.result.current.sendMessage("hola"); });
    await esperar();
    // La base falsa no devuelve la fila insertada: el optimista queda esperando a
    // que Realtime traiga la real (como cuando el INSERT llega antes que la respuesta).
    const optimista = hook.result.current.messages.find((m) => m.content === "hola");
    expect(optimista).toBeDefined();
    return { hook, optimista: optimista! };
  }

  it("si llega por Realtime un «hola» de MI integración, el mío sigue y los dos se ven", async () => {
    const { hook, optimista } = await escriboHola();
    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "real-api", conversation_id: "c1", sender_id: "yo-1", content: "hola", type: "text",
        created_at: optimista.created_at, updated_at: optimista.created_at, is_deleted: false, is_edited: false,
        api_key_id: "key-blu", api_display_name: "BLU",
      });
    });
    await esperar();
    // MUTANTE: sin `newMsg.api_key_id != null ? undefined :` el de BLU reemplaza al
    // mío (queda 1, con la marca de API) y lo que escribí desaparece.
    const ids = hook.result.current.messages.map((m) => m.id);
    expect(ids).toContain(optimista.id);
    expect(ids).toContain("real-api");
    expect(hook.result.current.messages.find((m) => m.id === optimista.id)?.api_key_id).toBeNull();
  });

  it("la línea base PUEDE fallar: la fila que escribí yo sí reemplaza al optimista", async () => {
    const { hook, optimista } = await escriboHola();
    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "real-mio", conversation_id: "c1", sender_id: "yo-1", content: "hola", type: "text",
        created_at: optimista.created_at, updated_at: optimista.created_at, is_deleted: false, is_edited: false,
        api_key_id: null, api_display_name: null,
      });
    });
    await esperar();
    const ids = hook.result.current.messages.map((m) => m.id);
    expect(ids).toEqual(["real-mio"]);
  });
});

// ─── 3. La conversación que la lista no conoce ──────────────────────────────

describe("un mensaje de una conversación desconocida recarga la lista", () => {
  const recargas = () => base.llamadas.filter((l) => l.tabla === "chat_conversations" && l.op === "select").length;

  it("una recarga por conversación desconocida; las conocidas se actualizan en memoria", async () => {
    const hook = renderHook(() => useChat());
    await dormir(100);
    await esperar();
    expect(hook.result.current.conversations.map((c) => c.id)).toEqual(["c1"]);
    const antes = recargas();

    // BLU abre un directo conmigo: conversación, participantes y primer mensaje en
    // la misma transacción. Llega el mensaje de una conversación que no está.
    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "m-nuevo", conversation_id: "c-nueva", sender_id: "otro-1", content: "hola", type: "text",
        created_at: "2026-10-01T12:05:00.000Z", is_deleted: false, api_key_id: "key-blu", api_display_name: "BLU",
      });
    });
    await dormir(400);
    await esperar();
    // Línea base: `if (!isKnownConversation(...)) return;` → 0 recargas, el chat
    // nuevo no aparecía hasta el poll de 60 s.
    expect(recargas()).toBe(antes + 1);

    // Más mensajes de la misma (si la recarga no la trajo): ninguna recarga más
    // dentro del freno. Si no, sería una recarga (4 consultas) POR mensaje.
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        llega("chat_messages", "INSERT", {
          id: `m-nuevo-${i}`, conversation_id: "c-nueva", sender_id: "otro-1", content: "otro", type: "text",
          created_at: "2026-10-01T12:05:01.000Z", is_deleted: false, api_key_id: "key-blu", api_display_name: "BLU",
        });
      }
    });
    await dormir(400);
    await esperar();
    expect(recargas()).toBe(antes + 1);
    expect(RECARGA_DESCONOCIDA_MS).toBeGreaterThanOrEqual(30_000);

    // Uno de la conocida no recarga: se aplica en memoria (como siempre).
    await act(async () => {
      llega("chat_messages", "INSERT", {
        id: "m-c1", conversation_id: "c1", sender_id: "otro-1", content: "de la conocida", type: "text",
        created_at: "2026-10-01T12:06:00.000Z", is_deleted: false, api_key_id: "key-blu", api_display_name: "BLU",
      });
    });
    await dormir(400);
    await esperar();
    expect(recargas()).toBe(antes + 1);
    expect(hook.result.current.conversations[0].lastMessage?.id).toBe("m-c1");
  });
});
