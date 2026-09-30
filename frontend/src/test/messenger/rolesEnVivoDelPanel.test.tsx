// EL ROL DE LOS DEMÁS, EN VIVO, EN EL PANEL DE MIEMBROS.
//
// Hasta el 28/09 lo traía el canal de la lista (useChat), que escuchaba TODAS las
// filas de chat_participants de todas mis conversaciones sin filtro. Como esa
// fila cambia cada vez que alguien lee, era lo que más RLS le hacía correr a
// Realtime (~534 UPDATE por hora × cada pestaña abierta). Ahora la lista escucha
// solo MI fila (canalDelChat.ts) y el panel, que es el único lugar donde se ve el
// rol de otro, escucha su conversación mientras está abierto.
//
// Lo que tiene que pasar: si a otro le cambian el rol, el panel pide recargar;
// una lectura (mismo rol) no; mi propia fila tampoco (esa llega por el canal del
// chat y la lista ya recarga sola).
//
// Y como el rol ajeno solo llega en vivo con el panel ABIERTO: al abrirlo se
// compara contra la base (y se recarga si hay diferencia), y al salir del grupo
// quién queda de admin se decide con los roles de la base, no con los de la
// lista (un admin viejo ahí dejaba el grupo sin ningún admin).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, fireEvent, screen } from "@testing-library/react";

const base = vi.hoisted(() => {
  type Filtro = { event: string; schema: string; table: string; filter?: string };
  class CanalFalso {
    escuchas: { filtro: Filtro; cb: (p: unknown) => void }[] = [];
    removido = false;
    constructor(public topic: string) {}
    on(_type: string, filtro: Filtro, cb: (p: unknown) => void) {
      this.escuchas.push({ filtro, cb });
      return this;
    }
    subscribe(cb?: (s: string) => void) {
      queueMicrotask(() => { if (!this.removido) cb?.("SUBSCRIBED"); });
      return this;
    }
  }
  const canales: CanalFalso[] = [];
  // Lo que "hay en la base" por tabla (los selects lo devuelven tal cual) y lo
  // que se escribió, con sus .eq().
  const filas: Record<string, Record<string, unknown>[]> = {};
  const escrituras: { tabla: string; op: string; valores: unknown; eq: Record<string, unknown> }[] = [];
  const cadena = (tabla: string) => {
    let op = "select";
    let valores: unknown = null;
    const eq: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    for (const m of ["select", "neq", "in", "order", "limit", "is", "maybeSingle", "single"]) c[m] = () => c;
    c.eq = (col: string, v: unknown) => { eq[col] = v; return c; };
    for (const m of ["update", "insert", "delete"]) c[m] = (v?: unknown) => { op = m; valores = v ?? null; return c; };
    c.then = (ok: (v: unknown) => void) => {
      if (op !== "select") escrituras.push({ tabla, op, valores, eq });
      const data = op === "select" ? (filas[tabla] ?? []) : [{ id: "x" }];
      return Promise.resolve({ data, error: null }).then(ok);
    };
    return c;
  };
  const supabase = {
    channel(topic: string) {
      const c = new CanalFalso(topic);
      canales.push(c);
      return c;
    },
    removeChannel(c: CanalFalso) {
      c.removido = true;
      return Promise.resolve("ok");
    },
    from: (tabla: string) => cadena(tabla),
  };
  return { supabase, canales, filas, escrituras };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k, language: "es" }) }));
vi.mock("@/hooks/useOnlinePresence", () => ({ useOnlinePresence: () => ({ isOnline: () => false }) }));

import GroupMembersPanel from "@/pages/messenger/components/GroupMembersPanel";
import type { ConversationWithDetails } from "@/pages/messenger/types";

const ahora = "2026-09-28T12:00:00.000Z";
const participante = (user_id: string, role: "admin" | "member", joined_at = ahora) => ({
  id: `p-${user_id}`, conversation_id: "g1", user_id, role, joined_at,
  last_read_at: null, is_muted: false, notifications_mode: "all" as const,
});
const grupo = {
  id: "g1", type: "group", name: "Equipo", created_by: "yo", created_at: ahora, updated_at: ahora,
  displayName: "Equipo", unreadCount: 0, lastMessage: null,
  members_visibility: "all", info_permission: "admins", add_permission: "admins", msg_permission: "all",
  participants: [participante("yo", "admin"), participante("ana", "member")],
} as unknown as ConversationWithDetails;

const vivos = () => base.canales.filter((c) => !c.removido);
const esperar = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

function llega(fila: Record<string, unknown>): number {
  let entregas = 0;
  for (const c of vivos()) {
    for (const e of c.escuchas) {
      if (e.filtro.table !== "chat_participants" || e.filtro.event !== "UPDATE") continue;
      const m = e.filtro.filter?.match(/^(\w+)=eq\.(.+)$/);
      if (m && String(fila[m[1]]) !== m[2]) continue;
      entregas++;
      e.cb({ new: fila, old: {} });
    }
  }
  return entregas;
}

beforeEach(() => {
  base.canales.length = 0;
  base.escrituras.length = 0;
  for (const k of Object.keys(base.filas)) delete base.filas[k];
});
afterEach(() => cleanup());

describe("panel de miembros: el rol de los demás en vivo", () => {
  it("escucha SOLO su conversación, y solo mientras está abierto", async () => {
    const { unmount } = render(<GroupMembersPanel conversation={grupo} profiles={{}} onClose={() => {}} onMembersChanged={() => {}} />);
    await esperar();
    const deRoles = vivos().flatMap((c) => c.escuchas).filter((e) => e.filtro.table === "chat_participants");
    expect(deRoles.map((e) => `${e.filtro.event} [${e.filtro.filter}]`)).toEqual(["UPDATE [conversation_id=eq.g1]"]);
    // Una lectura en OTRA conversación no le cuesta nada.
    expect(llega({ conversation_id: "otra", user_id: "ana", role: "member" })).toBe(0);
    unmount();
    await esperar();
    expect(vivos().flatMap((c) => c.escuchas).filter((e) => e.filtro.table === "chat_participants")).toEqual([]);
  });

  it("a otro le cambian el rol → recarga; si solo leyó, o es mi fila → no", async () => {
    const recargar = vi.fn();
    render(<GroupMembersPanel conversation={grupo} profiles={{}} onClose={() => {}} onMembersChanged={recargar} />);
    await esperar();

    act(() => { llega({ conversation_id: "g1", user_id: "ana", role: "member", last_read_at: ahora }); });
    expect(recargar).not.toHaveBeenCalled();

    act(() => { llega({ conversation_id: "g1", user_id: "yo", role: "member" }); });
    expect(recargar).not.toHaveBeenCalled();

    act(() => { llega({ conversation_id: "g1", user_id: "ana", role: "admin" }); });
    expect(recargar).toHaveBeenCalledTimes(1);

    // Mientras la recarga viaja, Ana sigue leyendo (llega con el rol nuevo):
    // no se pide otra por cada lectura.
    act(() => { llega({ conversation_id: "g1", user_id: "ana", role: "admin", last_read_at: ahora }); });
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("al abrir: si a otro le cambiaron el rol con el panel cerrado, recarga una vez; si está al día, no", async () => {
    // La lista dice que Ana es admin, pero se lo quitaron mientras el panel estaba cerrado.
    base.filas.chat_participants = [
      { user_id: "yo", role: "admin", joined_at: ahora },
      { user_id: "ana", role: "member", joined_at: ahora },
    ];
    const viejo = { ...grupo, participants: [participante("yo", "admin"), participante("ana", "admin")] } as ConversationWithDetails;
    const recargar = vi.fn();
    render(<GroupMembersPanel conversation={viejo} profiles={{}} onClose={() => {}} onMembersChanged={recargar} />);
    await esperar();
    expect(recargar).toHaveBeenCalledTimes(1);
    cleanup();

    const alDia = vi.fn();
    render(<GroupMembersPanel conversation={grupo} profiles={{}} onClose={() => {}} onMembersChanged={alDia} />);
    await esperar();
    expect(alDia).not.toHaveBeenCalled();
  });

  it("salir siendo el último admin: el sucesor se decide con los roles de la BASE, no con los de la lista", async () => {
    // La lista (vieja) dice que Ana sigue de admin; en la base ya no lo es. Con
    // los roles de la lista, salía sin promover a nadie y el grupo quedaba sin admin.
    base.filas.chat_participants = [
      { user_id: "yo", role: "admin", joined_at: "2026-09-01T00:00:00.000Z" },
      { user_id: "ana", role: "member", joined_at: "2026-09-10T00:00:00.000Z" },
      { user_id: "beto", role: "member", joined_at: "2026-09-05T00:00:00.000Z" },
    ];
    const viejo = {
      ...grupo,
      participants: [
        participante("yo", "admin", "2026-09-01T00:00:00.000Z"),
        participante("ana", "admin", "2026-09-10T00:00:00.000Z"),
        participante("beto", "member", "2026-09-05T00:00:00.000Z"),
      ],
    } as ConversationWithDetails;
    render(<GroupMembersPanel conversation={viejo} profiles={{}} onClose={() => {}} onMembersChanged={() => {}} />);
    await esperar();

    fireEvent.click(screen.getByRole("button", { name: "messenger.members.salirDelGrupo" }));
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "messenger.members.salir" })); });
    await esperar();

    const promociones = base.escrituras.filter((w) => w.tabla === "chat_participants" && w.op === "update");
    // El más antiguo de los que quedan (Beto), no nadie.
    expect(promociones).toEqual([
      { tabla: "chat_participants", op: "update", valores: { role: "admin" }, eq: { conversation_id: "g1", user_id: "beto" } },
    ]);
    // Y recién después, mi salida.
    const orden = base.escrituras.map((w) => `${w.tabla}:${w.op}`);
    expect(orden.indexOf("chat_participants:update")).toBeLessThan(orden.indexOf("chat_participants:delete"));
  });
});
