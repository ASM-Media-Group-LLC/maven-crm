// CUÁNTO LE CUESTA A REALTIME CADA PESTAÑA DE MAVEN ABIERTA.
//
// Realtime chequea la RLS una vez POR ESCUCHA por cada fila que cambia en una
// tabla publicada (realtime.apply_rls recorre las suscripciones de a una; el
// filtro, si lo hay, va antes y una fila que no lo pasa no cuesta nada). Así que
// lo que importa no es cuántos canales hay sino cuántas escuchas quedan sobre
// cada (tabla, evento) y cuántas de ellas dejan pasar cada fila.
//
// Esto monta las piezas del AppShell que escuchan el Messenger y la campana
// —con los hooks REALES y una base falsa que anota cada `.on("postgres_changes")`—
// y cuenta. Después dispara mensajes, lecturas y notificaciones y mira que cada
// pantalla siga enterándose, una vez.
//
// La línea base TIENE que poder fallar: este mismo archivo, corrido contra
// origin/main (cfc36187, 28/09), falla en 5 de 7 casos (los dos que pasan son
// los de comportamiento, que tienen que pasar en los dos lados) e imprime:
//   cualquier pantalla: 4 canales; chat_messages:INSERT ×3, chat_participants:UPDATE ×2,
//     todo sin filtro, también notifications:INSERT (la RLS corría para cada
//     pestaña de cada persona); cada mensaje ajeno marcaba "entregado" DOS veces.
//   /messenger con un chat abierto: 7 canales; chat_messages:INSERT ×4 sin filtro,
//     chat_participants:UPDATE ×3.
//   costo por evento: mensaje ajeno 3, mi lectura 2, lectura de otro 2, mensaje
//     en un directo (updated_at) 1, notificación ajena 1.
// En prod, ese día (82 pestañas de 40 personas): 257 escuchas del INSERT de
// chat_messages, 188 del UPDATE de chat_participants y 71 de notifications,
// ninguna filtrada.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// Estable por referencia, como el de verdad entre renders.
const USUARIO = vi.hoisted(() => ({ id: "yo-1" }));

// ── Base falsa ──────────────────────────────────────────────────────────────
type Filtro = { event: string; schema: string; table: string; filter?: string };
type Escucha = { type: string; filtro: Filtro; cb: (p: unknown) => void };

const base = vi.hoisted(() => {
  class CanalFalso {
    escuchas: Escucha[] = [];
    removido = false;
    alEstado?: (s: string) => void;
    constructor(public topic: string) {}
    on(type: string, filtro: Filtro, cb: (p: unknown) => void) {
      this.escuchas.push({ type, filtro, cb });
      return this;
    }
    subscribe(cb?: (s: string) => void) {
      this.alEstado = cb;
      queueMicrotask(() => { if (!this.removido) cb?.("SUBSCRIBED"); });
      return this;
    }
    send() { return Promise.resolve("ok"); }
    track() { return Promise.resolve("ok"); }
    untrack() { return Promise.resolve("ok"); }
    presenceState() { return {}; }
    unsubscribe() { return Promise.resolve("ok"); }
  }
  type Escucha = { type: string; filtro: Filtro; cb: (p: unknown) => void };
  type Filtro = { event: string; schema: string; table: string; filter?: string };

  const canales: CanalFalso[] = [];
  const llamadas: { tabla: string; op: string }[] = [];
  const rpcs: string[] = [];

  const ahora = "2026-09-28T12:00:00.000Z";
  const filas: Record<string, Record<string, unknown>[]> = {
    profiles: [
      { id: "yo-1", full_name: "Yo Uno", avatar_url: null, avatar_seed: null, deleted_at: null },
      { id: "otro-1", full_name: "Otra Persona", avatar_url: null, avatar_seed: null, deleted_at: null },
    ],
    chat_participants: [
      { id: "p1", conversation_id: "c1", user_id: "yo-1", role: "admin", last_read_at: null, is_muted: false, notifications_mode: "all", joined_at: ahora, conversation: { type: "direct", name: null } },
      { id: "p2", conversation_id: "c1", user_id: "otro-1", role: "member", last_read_at: null, is_muted: false, notifications_mode: "all", joined_at: ahora, conversation: { type: "direct", name: null } },
    ],
    chat_conversations: [{ id: "c1", type: "direct", name: null, created_by: "yo-1", created_at: ahora, updated_at: ahora }],
  };
  const respuestasRpc: Record<string, unknown[]> = {
    get_last_messages: [{ id: "m0", conversation_id: "c1", sender_id: "otro-1", content: "hola", type: "text", created_at: ahora, is_deleted: false }],
    get_unread_counts: [{ conversation_id: "c1", unread_count: 0 }],
  };

  function cadena(tabla: string) {
    let op = "select";
    let uno = false;
    const c: Record<string, unknown> = {};
    const devolver = () => c;
    for (const m of ["select", "eq", "neq", "in", "gt", "lt", "gte", "lte", "order", "limit", "range", "is", "not", "or", "filter", "match", "contains"]) {
      c[m] = devolver;
    }
    for (const m of ["update", "upsert", "insert", "delete"]) {
      c[m] = () => { op = m; return c; };
    }
    c.maybeSingle = () => { uno = true; return c; };
    c.single = () => { uno = true; return c; };
    c.then = (ok: (v: unknown) => void, mal?: (e: unknown) => void) => {
      llamadas.push({ tabla, op });
      const data = op === "select" ? (filas[tabla] ?? []) : [];
      return Promise.resolve({ data: uno ? (data[0] ?? null) : data, error: null, count: data.length }).then(ok, mal);
    };
    return c;
  }

  const supabase = {
    channel(topic: string) {
      // Como realtime-js: el mismo topic devuelve el mismo canal mientras siga en la lista.
      const vivo = canales.find((c) => c.topic === topic && !c.removido);
      if (vivo) return vivo;
      const nuevo = new CanalFalso(topic);
      canales.push(nuevo);
      return nuevo;
    },
    removeChannel(c: CanalFalso) {
      c.removido = true;
      c.alEstado?.("CLOSED");
      return Promise.resolve("ok");
    },
    from: (tabla: string) => cadena(tabla),
    rpc: (nombre: string) => {
      rpcs.push(nombre);
      const c = cadena(`rpc:${nombre}`);
      c.then = (ok: (v: unknown) => void) => Promise.resolve({ data: respuestasRpc[nombre] ?? [], error: null }).then(ok);
      return c;
    },
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  };

  return { supabase, canales, llamadas, rpcs };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: USUARIO, session: null, loading: false }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k, language: "es" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => true }) }));
vi.mock("@/hooks/useNotificationPreferences", () => ({ useNotificationPreferences: () => ({ isCanalActivo: () => true }) }));
vi.mock("@/hooks/useNotificationSettings", () => ({
  useNotificationSettings: () => ({
    settings: { notifications_enabled: true, sound_enabled: false, dnd_enabled: false, push_enabled: false },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useBrowserNotifications", () => ({
  useBrowserNotifications: () => ({ notify: () => {} }),
  useNotificationPermission: () => {},
  playNotificationSound: () => {},
}));
vi.mock("@/hooks/useTabTitleAlert", () => ({ useTabTitleAlert: () => () => {} }));
vi.mock("@/lib/insigniaDeLaApp", () => ({
  actualizarInsignia: () => Promise.resolve(),
  contarChatsSinLeer: () => 0,
  cerrarNotificacionesDeChat: () => Promise.resolve(),
}));

import { ChatProvider, useChatShared } from "@/hooks/ChatProvider";
import { useMessengerNotifications } from "@/hooks/useMessengerNotifications";
import { useUnreadChatCount } from "@/hooks/useUnreadChatCount";
import { useNotifications } from "@/hooks/useNotifications";
import { useMentionedConversations } from "@/hooks/useMentionedConversations";
import { useMessages } from "@/hooks/useChat";

// ── Las piezas del AppShell ─────────────────────────────────────────────────
const visto = { noLeidos: -1, ultimoDeLaLista: "" };

function Shell({ children }: { children?: ReactNode }) {
  useMessengerNotifications(); // AppShell
  return <ChatProvider><Topbar />{children}</ChatProvider>;
}
function Topbar() {
  visto.noLeidos = useUnreadChatCount(); // DashboardSidebar
  useNotifications(); // NotificationBell
  const { conversations } = useChatShared();
  visto.ultimoDeLaLista = conversations[0]?.lastMessage?.id ?? "";
  return null;
}
function MessengerAbierto() {
  useMentionedConversations("Yo Uno", ["c1"]); // ChatSidebar
  useMessages("c1"); // el chat abierto
  return null;
}

function montar(extra?: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Shell>{extra}</Shell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const vivos = () => base.canales.filter((c) => !c.removido);

/** Escuchas de postgres_changes en los canales vivos, por tabla:evento [filtro]. */
function escuchas(): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const c of vivos()) {
    for (const e of c.escuchas) {
      if (e.type !== "postgres_changes") continue;
      const clave = `${e.filtro.table}:${e.filtro.event}${e.filtro.filter ? ` [${e.filtro.filter}]` : ""}`;
      cuenta[clave] = (cuenta[clave] ?? 0) + 1;
    }
  }
  return cuenta;
}

function pasaElFiltro(filtro: string | undefined, fila: Record<string, unknown>): boolean {
  if (!filtro) return true;
  const m = filtro.match(/^(\w+)=eq\.(.+)$/);
  return !!m && String(fila[m[1]]) === m[2];
}

/** Como Realtime: una fila nueva va a cada escucha de esa tabla/evento cuyo
 *  filtro la deja pasar. Devuelve cuántas escuchas la recibieron (= cuántas
 *  veces corrió la RLS en la base). */
function llega(table: string, event: string, fila: Record<string, unknown>, anterior: Record<string, unknown> = {}): number {
  let chequeos = 0;
  for (const c of vivos()) {
    for (const e of c.escuchas) {
      if (e.type !== "postgres_changes" || e.filtro.table !== table || (e.filtro.event !== event && e.filtro.event !== "*")) continue;
      if (!pasaElFiltro(e.filtro.filter, fila)) continue;
      chequeos++;
      e.cb({ new: fila, old: anterior, eventType: event, table, schema: "public" });
    }
  }
  return chequeos;
}

const esperar = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

beforeEach(() => {
  base.canales.length = 0;
  base.llamadas.length = 0;
  base.rpcs.length = 0;
});
afterEach(async () => {
  cleanup();
  await esperar();
});

/** Lo que le cuesta a ESTA pestaña cada cosa que pasa en la base (= cuántas
 *  veces corre la RLS por ella). Se imprime para comparar contra origin/main. */
async function costoPorEvento(): Promise<Record<string, number>> {
  const costo: Record<string, number> = {};
  await act(async () => {
    costo.mensajeAjeno = llega("chat_messages", "INSERT", {
      id: "mx", conversation_id: "c1", sender_id: "otro-1", content: "hola", type: "text",
      created_at: "2026-09-28T12:05:00.000Z", is_deleted: false,
    });
    const mia = { id: "p1", conversation_id: "c1", user_id: "yo-1", role: "admin", last_read_at: "2026-09-28T12:06:00.000Z", is_muted: false, notifications_mode: "all" };
    costo.leoYo = llega("chat_participants", "UPDATE", mia, { ...mia, last_read_at: null });
    const suya = { id: "p2", conversation_id: "c1", user_id: "otro-1", role: "member", last_read_at: "2026-09-28T12:06:00.000Z", is_muted: false, notifications_mode: "all" };
    costo.leeOtro = llega("chat_participants", "UPDATE", suya, { ...suya, last_read_at: null });
    const directo = { id: "c1", type: "direct", name: null, updated_at: "2026-09-28T12:05:00.000Z" };
    costo.mensajeMueveUnDirecto = llega("chat_conversations", "UPDATE", directo, { ...directo, updated_at: "2026-09-28T12:00:00.000Z" });
    const grupo = { id: "g9", type: "group", name: "Equipo", updated_at: "2026-09-28T12:05:00.000Z" };
    costo.mensajeMueveUnGrupo = llega("chat_conversations", "UPDATE", grupo, { ...grupo, updated_at: "2026-09-28T12:00:00.000Z" });
    costo.notificacionMia = llega("notifications", "INSERT", { id: "n2", user_id: "yo-1", type: "chat_message" });
    costo.notificacionAjena = llega("notifications", "INSERT", { id: "n1", user_id: "otro-1", type: "chat_message" });
  });
  await esperar();
  return costo;
}

describe("escuchas de Realtime por pestaña", () => {
  it("cualquier pantalla: una escucha por (tabla, evento); lo que solo es mío, filtrado", async () => {
    montar();
    await esperar();
    const e = escuchas();
    console.info("MEDIDA cualquier pantalla", JSON.stringify({ canales: vivos().map((c) => c.topic), escuchas: e }));
    expect(e).toEqual({
      "chat_messages:INSERT": 1,
      "chat_messages:UPDATE": 1,
      "chat_messages:DELETE": 1,
      "chat_participants:INSERT": 1,
      "chat_participants:UPDATE [user_id=eq.yo-1]": 1,
      "chat_participants:DELETE": 1,
      "chat_conversations:UPDATE [type=eq.group]": 1,
      "chat_conversations:DELETE": 1,
      "notifications:INSERT [user_id=eq.yo-1]": 1,
    });
    // El canal del chat y el de la campana.
    expect(vivos()).toHaveLength(2);
  });

  it("/messenger con un chat abierto: suma solo las escuchas FILTRADAS del chat abierto", async () => {
    montar(<MessengerAbierto />);
    await esperar();
    const e = escuchas();
    console.info("MEDIDA /messenger", JSON.stringify({ canales: vivos().map((c) => c.topic), escuchas: e }));
    // Las menciones ya no abren canal: viajan en el del chat.
    expect(e["chat_messages:INSERT"]).toBe(1);
    expect(e["chat_participants:UPDATE [user_id=eq.yo-1]"]).toBe(1);
    expect(e["chat_messages:INSERT [conversation_id=eq.c1]"]).toBe(1);
    // Ninguna tabla del chat con más de una escucha por (tabla, evento).
    const repetidas = Object.entries(e).filter(([, n]) => n > 1);
    expect(repetidas).toEqual([]);
    // Con postgres_changes: el del chat, la campana y el del chat abierto (el
    // cuarto es el de "escribiendo…", que es broadcast y no pasa por la RLS).
    const conEscuchas = vivos().filter((c) => c.escuchas.some((x) => x.type === "postgres_changes"));
    expect(conEscuchas).toHaveLength(3);
  });

  it("costo por evento para esta pestaña: 1 lo que le toca, 0 lo que no", async () => {
    montar();
    await esperar();
    const costo = await costoPorEvento();
    console.info("MEDIDA costo por evento", JSON.stringify(costo));
    expect(costo).toEqual({
      mensajeAjeno: 1,
      leoYo: 1,
      leeOtro: 0,
      mensajeMueveUnDirecto: 0,
      mensajeMueveUnGrupo: 1,
      notificacionMia: 1,
      notificacionAjena: 0,
    });
  });

  it("un mensaje ajeno cuesta UN chequeo y le llega a la lista, al globito y al aviso", async () => {
    montar();
    await esperar();
    expect(visto.ultimoDeLaLista).toBe("m0");
    base.llamadas.length = 0;
    base.rpcs.length = 0;

    let chequeos = 0;
    await act(async () => {
      chequeos = llega("chat_messages", "INSERT", {
        id: "m1", conversation_id: "c1", sender_id: "otro-1", content: "¿vienes?", type: "text",
        created_at: "2026-09-28T12:01:00.000Z", is_deleted: false,
      });
    });
    await esperar();

    expect(chequeos).toBe(1);
    // La lista (useChat) lo puso arriba…
    expect(visto.ultimoDeLaLista).toBe("m1");
    // …el globito (useUnreadChatCount) volvió a contar…
    expect(base.rpcs).toContain("get_unread_counts");
    // …y el aviso (useMessengerNotifications) miró si la conversación está silenciada.
    expect(base.llamadas.some((l) => l.tabla === "chat_participants" && l.op === "select")).toBe(true);
    // "Entregado" UNA vez por pestaña (antes: la lista y el aviso, dos upserts iguales).
    expect(base.llamadas.filter((l) => l.tabla === "chat_read_receipts" && l.op === "upsert")).toHaveLength(1);
  });

  it("mi lectura (UPDATE de mi participación) llega al globito y a las menciones, y no recarga la lista", async () => {
    montar(<MessengerAbierto />);
    await esperar();
    base.rpcs.length = 0;
    base.llamadas.length = 0;
    let chequeos = 0;
    const fila = { id: "p1", conversation_id: "c1", user_id: "yo-1", role: "admin", last_read_at: "2026-09-28T12:02:00.000Z", is_muted: false, notifications_mode: "all" };
    await act(async () => {
      chequeos = llega("chat_participants", "UPDATE", fila, { ...fila, last_read_at: null });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    await esperar();
    expect(chequeos).toBe(1);
    expect(base.rpcs).toContain("get_unread_counts");
    expect(base.rpcs).toContain("get_mentioned_conversations");
    // Solo cambió last_read_at: la lista no se recarga (como antes).
    expect(base.llamadas.some((l) => l.tabla === "chat_conversations")).toBe(false);
  });

  it("si me silencian o me cambian el rol (mi fila, algo más que leer), la lista se recarga", async () => {
    montar();
    await esperar();
    base.llamadas.length = 0;
    const antes = { id: "p1", conversation_id: "c1", user_id: "yo-1", role: "member", last_read_at: null, is_muted: false, notifications_mode: "all" };
    await act(async () => {
      llega("chat_participants", "UPDATE", { ...antes, role: "admin" }, antes);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    await esperar();
    expect(base.llamadas.some((l) => l.tabla === "chat_conversations" && l.op === "select")).toBe(true);
  });

  it("al desmontar no queda ningún canal", async () => {
    const { unmount } = montar(<MessengerAbierto />);
    await esperar();
    unmount();
    await esperar();
    expect(vivos()).toHaveLength(0);
  });
});
