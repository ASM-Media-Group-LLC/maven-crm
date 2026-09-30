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
// origin/main (be1e1121, 29/09), falla en 6 de 10 casos. Los cuatro que pasan
// son de comportamiento puro y tienen que pasar en los dos lados (el grupo
// renombrado, mi fila silenciada, desmontar, y ponerse al día tras una caída);
// los dos de "mensaje ajeno" y "mi lectura" pasan allá todo lo que hace cada
// pantalla y fallan recién en el costo; el de "borrados" falla allá porque a
// cada pestaña le llegaban los borrados de toda la base y "me sacan del grupo"
// no hacía nada (leía `old.conversation_id`, que Realtime no manda). Imprime:
//   cualquier pantalla: 4 canales; chat_messages:INSERT ×3, chat_participants:UPDATE ×2,
//     todo sin filtro, también notifications:INSERT (la RLS corría para cada
//     pestaña de cada persona); cada mensaje ajeno marcaba "entregado" DOS veces.
//   /messenger con un chat abierto: 7 canales; chat_messages:INSERT ×4 sin filtro,
//     chat_participants:UPDATE ×3.
//   costo por evento: mensaje ajeno 3, mi lectura 2, lectura de otro 2, mensaje
//     en un directo (updated_at) 1, notificación ajena 1.
// En prod el 29/09 (70 pestañas de 36 personas): 218 escuchas sin filtro del
// INSERT de chat_messages, 161 del UPDATE de chat_participants, 70 del UPDATE de
// chat_conversations y 61 de notifications; ninguna de esas filtrada. Más tarde
// ese día, con 44 pestañas de 23 personas: 142, 103, 44 y 39 (la misma forma:
// ~3 del INSERT por pestaña, ~2 del UPDATE de participantes, 1 de cada resto).
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

  return { supabase, canales, llamadas, rpcs, filas, respuestasRpc };
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
const visto = { noLeidos: -1, ultimoDeLaLista: "", nombres: {} as Record<string, string> };

function Shell({ children }: { children?: ReactNode }) {
  useMessengerNotifications(); // AppShell
  return <ChatProvider><Topbar />{children}</ChatProvider>;
}
function Topbar() {
  visto.noLeidos = useUnreadChatCount(); // DashboardSidebar
  useNotifications(); // NotificationBell
  const { conversations } = useChatShared();
  visto.ultimoDeLaLista = conversations[0]?.lastMessage?.id ?? "";
  visto.nombres = Object.fromEntries(conversations.map((c) => [c.id, c.displayName]));
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

/** Un borrado como lo manda Realtime en prod: NO pasa por la RLS, el filtro se
 *  evalúa sobre la fila vieja completa (REPLICA IDENTITY FULL) y de la fila solo
 *  viaja la llave. Devuelve a cuántas escuchas de esta pestaña le llegó. */
function borrar(table: string, filaCompleta: Record<string, unknown>): number {
  let entregas = 0;
  for (const c of vivos()) {
    for (const e of c.escuchas) {
      if (e.type !== "postgres_changes" || e.filtro.table !== table || (e.filtro.event !== "DELETE" && e.filtro.event !== "*")) continue;
      if (!pasaElFiltro(e.filtro.filter, filaCompleta)) continue;
      entregas++;
      e.cb({ new: {}, old: { id: filaCompleta.id }, eventType: "DELETE", table, schema: "public" });
    }
  }
  return entregas;
}

const esperar = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
const dormir = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

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
      "chat_participants:INSERT": 1,
      "chat_participants:UPDATE [user_id=eq.yo-1]": 1,
      "chat_participants:DELETE [user_id=eq.yo-1]": 1,
      "chat_conversations:UPDATE [type=eq.group]": 1,
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

    // Primero lo que cada pantalla hace con el mensaje: esto pasa IGUAL contra
    // origin/main (el comportamiento no cambia); lo que falla allá es el costo.
    // La lista (useChat) lo puso arriba…
    expect(visto.ultimoDeLaLista).toBe("m1");
    // …el globito (useUnreadChatCount) volvió a contar…
    expect(base.rpcs).toContain("get_unread_counts");
    // …y el aviso (useMessengerNotifications) miró si la conversación está silenciada.
    expect(base.llamadas.some((l) => l.tabla === "chat_participants" && l.op === "select")).toBe(true);
    // "Entregado" UNA vez por pestaña (en main: la lista y el aviso, dos upserts iguales).
    expect(base.llamadas.filter((l) => l.tabla === "chat_read_receipts" && l.op === "upsert")).toHaveLength(1);
    // Y lo que le costó a Realtime (en main: 3).
    expect(chequeos).toBe(1);
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
    // Comportamiento primero (igual que en main), costo al final (en main: 3).
    expect(base.rpcs).toContain("get_unread_counts");
    expect(base.rpcs).toContain("get_mentioned_conversations");
    // Solo cambió last_read_at: la lista no se recarga (como antes).
    expect(base.llamadas.some((l) => l.tabla === "chat_conversations")).toBe(false);
    expect(chequeos).toBe(1);
  });

  it("un grupo renombrado se ve en la lista: filtrar a grupos no pierde nada", async () => {
    // La escucha de chat_conversations va filtrada a grupos: la lista solo copia
    // nombre, foto y descripción, que un directo no tiene. Esto pasa igual en main.
    const grupo = { id: "g1", type: "group", name: "Equipo", avatar_url: null, description: null, created_by: "yo-1", created_at: "2026-09-28T12:00:00.000Z", updated_at: "2026-09-28T12:00:00.000Z" };
    const filasAntes = {
      participants: base.filas.chat_participants.slice(),
      conversations: base.filas.chat_conversations.slice(),
    };
    base.filas.chat_conversations.push(grupo);
    base.filas.chat_participants.push({ id: "p3", conversation_id: "g1", user_id: "yo-1", role: "admin", last_read_at: null, is_muted: false, notifications_mode: "all", joined_at: "2026-09-28T12:00:00.000Z", conversation: { type: "group", name: "Equipo" } });
    try {
      montar();
      await esperar();
      await act(async () => {
        llega("chat_conversations", "UPDATE", { ...grupo, name: "Equipo Norte", updated_at: "2026-09-28T12:07:00.000Z" }, grupo);
      });
      await esperar();
      expect(visto.nombres.g1).toBe("Equipo Norte");
    } finally {
      base.filas.chat_participants.splice(0, Infinity, ...filasAntes.participants);
      base.filas.chat_conversations.splice(0, Infinity, ...filasAntes.conversations);
    }
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

  it("tras una caída del canal, la lista y el globito traen lo que llegó mientras no había canal", async () => {
    // Mientras el socket está caído los eventos se pierden: lo único que pone al
    // día es recargar al volver a conectar. La lista lo hace en `alSuscribir`
    // (useChat) y el globito en `alRevivir` (useUnreadChatCount); si falta
    // cualquiera de las dos, esto queda viejo hasta el poll de 60 s. Es
    // comportamiento puro: pasa igual contra origin/main (allí cada hook con su
    // canal), por eso no mira topics.
    const antes = { ...base.respuestasRpc };
    try {
      montar();
      await esperar();
      expect(visto.ultimoDeLaLista).toBe("m0");
      expect(visto.noLeidos).toBe(0);
      const caidos = vivos().filter((c) => c.escuchas.some((x) => x.type === "postgres_changes"));
      expect(caidos.length).toBeGreaterThan(0);

      // Se cae el socket: todos los canales con escuchas dan error.
      act(() => { for (const c of caidos) c.alEstado?.("CHANNEL_ERROR"); });
      // Llega un mensaje con el socket caído: no hay evento, solo cambió la base.
      base.respuestasRpc.get_last_messages = [{ id: "m5", conversation_id: "c1", sender_id: "otro-1", content: "¿sigues?", type: "text", created_at: "2026-09-28T12:09:00.000Z", is_deleted: false }];
      base.respuestasRpc.get_unread_counts = [{ conversation_id: "c1", unread_count: 1 }];

      // La primera espera es de 1 s (en origin/main la lista esperaba 2 s); los
      // canales nuevos conectan solos (la base falsa responde SUBSCRIBED al
      // suscribirse).
      await dormir(2_100);
      await esperar();
      expect(visto.ultimoDeLaLista).toBe("m5");
      expect(visto.noLeidos).toBe(1);
    } finally {
      Object.assign(base.respuestasRpc, antes);
    }
  });

  it("borrados: si borran la conversación o me sacan del grupo, se va de la lista; lo ajeno no llega", async () => {
    // En prod de un borrado solo viaja `old.id`. Hasta el 30/09 la lista tenía
    // tres DELETE sin filtro: le llegaban los borrados de toda la base (de
    // cualquier agencia) y dos de ellos leían `old.conversation_id`, que nunca
    // llega. Ahora hay uno, filtrado a MI fila de chat_participants.
    const grupo = { id: "g1", type: "group", name: "Equipo", avatar_url: null, description: null, created_by: "otro-1", created_at: "2026-09-28T12:00:00.000Z", updated_at: "2026-09-28T12:00:00.000Z" };
    const miFilaDelGrupo = { id: "p3", conversation_id: "g1", user_id: "yo-1", role: "member", last_read_at: null, is_muted: false, notifications_mode: "all", joined_at: "2026-09-28T12:00:00.000Z", conversation: { type: "group", name: "Equipo" } };
    const filasAntes = {
      participants: base.filas.chat_participants.slice(),
      conversations: base.filas.chat_conversations.slice(),
    };
    base.filas.chat_conversations.push(grupo);
    base.filas.chat_participants.push(miFilaDelGrupo);
    try {
      montar();
      await esperar();
      expect(Object.keys(visto.nombres).sort()).toEqual(["c1", "g1"]);

      // Lo que se borra en conversaciones ajenas no le llega a esta pestaña.
      let ajenas = 0;
      await act(async () => {
        ajenas += borrar("chat_messages", { id: "m-x", conversation_id: "c-otra", sender_id: "otro-9" });
        ajenas += borrar("chat_participants", { id: "p-x", conversation_id: "c-otra", user_id: "otro-9" });
        ajenas += borrar("chat_conversations", { id: "c-otra", type: "direct" });
      });
      expect(ajenas).toBe(0);

      // Borran el directo entero (delete_conversation_cascade: mensajes, las dos
      // participaciones y la conversación). En la base ya no está.
      base.filas.chat_conversations.splice(0, Infinity, grupo);
      base.filas.chat_participants.splice(0, Infinity, miFilaDelGrupo);
      let entregas = 0;
      await act(async () => {
        entregas += borrar("chat_messages", { id: "m0", conversation_id: "c1", sender_id: "otro-1" });
        entregas += borrar("chat_participants", { id: "p1", conversation_id: "c1", user_id: "yo-1" });
        entregas += borrar("chat_participants", { id: "p2", conversation_id: "c1", user_id: "otro-1" });
        entregas += borrar("chat_conversations", { id: "c1", type: "direct" });
      });
      expect(entregas).toBe(1); // solo mi participación
      await esperar();
      expect(Object.keys(visto.nombres)).toEqual(["g1"]);

      // Me sacan del grupo: solo se borra mi fila.
      base.llamadas.length = 0;
      base.filas.chat_participants.splice(0);
      base.filas.chat_conversations.splice(0);
      await act(async () => { borrar("chat_participants", { id: "p3", conversation_id: "g1", user_id: "yo-1" }); });
      await esperar();
      expect(visto.nombres).toEqual({});
      // Y además se recarga la lista (lo de la memoria es solo para no esperar).
      await dormir(120);
      await esperar();
      expect(base.llamadas.some((l) => l.tabla === "chat_participants" && l.op === "select")).toBe(true);
      expect(visto.nombres).toEqual({});
    } finally {
      base.filas.chat_participants.splice(0, Infinity, ...filasAntes.participants);
      base.filas.chat_conversations.splice(0, Infinity, ...filasAntes.conversations);
    }
  });

  it("al desmontar no queda ningún canal", async () => {
    const { unmount } = montar(<MessengerAbierto />);
    await esperar();
    unmount();
    await esperar();
    expect(vivos()).toHaveLength(0);
  });
});
