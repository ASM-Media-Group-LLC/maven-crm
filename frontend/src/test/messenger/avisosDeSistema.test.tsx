// LOS AVISOS DE SISTEMA LOS ARMA LA BASE.
//
// Hasta el 01/10 la app insertaba en chat_messages una fila type 'system' con el
// texto armado aquí ("Ana agregó a Beto al grupo"), y la base aceptaba cualquier
// texto: un aviso inventado se dibuja sin autor y se notifica a todo el grupo.
// Desde la migración 20261001100000_chat_mensajes_de_sistema el texto lo arma la
// base (chat_evento_sistema) con el evento y los nombres de profiles, y con sesión
// de usuario un aviso con texto libre se rechaza.
//
// Lo que tiene que pasar en la app:
//   · los 6 lugares que avisaban (renombrar el grupo; sumar, aceptar, sacar, hacer o
//     quitar admin, salir) llaman a la RPC con el evento y la persona, y nada inserta
//     un aviso directo;
//   · al salir, el aviso va ANTES de borrar la fila propia;
//   · los nombres de los eventos son los que la base conoce (un nombre distinto es
//     un aviso que falla en silencio, con los tests en verde).
//
// El texto exacto de cada aviso lo prueba el banco de la base
// (supabase/tests/chat_mensajes_de_sistema.ts), contra el que escribía la app.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, fireEvent, screen } from "@testing-library/react";
import { avisarEvento, EVENTOS_DE_SISTEMA, type ClienteParaAvisos } from "@/pages/messenger/avisoDeSistema";

const base = vi.hoisted(() => {
  class CanalFalso {
    removido = false;
    constructor(public topic: string) {}
    on() { return this; }
    subscribe(cb?: (s: string) => void) {
      queueMicrotask(() => { if (!this.removido) cb?.("SUBSCRIBED"); });
      return this;
    }
  }
  // Lo que "hay en la base" por tabla (los selects lo devuelven tal cual) y lo que
  // se escribió, en orden, con sus .eq(). Las RPC se anotan con op "rpc".
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
    channel: (topic: string) => new CanalFalso(topic),
    removeChannel: (c: CanalFalso) => { c.removido = true; return Promise.resolve("ok"); },
    from: (tabla: string) => cadena(tabla),
    rpc: (fn: string, args: Record<string, unknown>) => {
      escrituras.push({ tabla: fn, op: "rpc", valores: args, eq: {} });
      return Promise.resolve({ data: "id-del-aviso", error: null });
    },
  };
  return { supabase, filas, escrituras };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useOnlinePresence", () => ({
  useOnlinePresence: () => ({
    isOnline: () => false, getStatus: () => null, getStatusText: () => "", getStatusColorPersonal: () => null,
  }),
}));

import GroupMembersPanel from "@/pages/messenger/components/GroupMembersPanel";
import ChatHeader from "@/pages/messenger/components/ChatHeader";
import type { ConversationWithDetails } from "@/pages/messenger/types";

const ahora = "2026-10-01T12:00:00.000Z";
const participante = (user_id: string, role: "admin" | "member") => ({
  id: `p-${user_id}`, conversation_id: "g1", user_id, role, joined_at: ahora,
  last_read_at: null, is_muted: false, notifications_mode: "all" as const,
});
const grupo = (anaEs: "admin" | "member" = "member") => ({
  id: "g1", type: "group", name: "Equipo", description: null, avatar_url: null, created_by: "yo", created_at: ahora, updated_at: ahora,
  displayName: "Equipo", unreadCount: 0, lastMessage: null,
  members_visibility: "all", info_permission: "admins", add_permission: "admins", msg_permission: "all", require_approval: false,
  participants: [participante("yo", "admin"), participante("ana", anaEs)],
}) as unknown as ConversationWithDetails;
const PERFILES = {
  yo: { id: "yo", full_name: "Jhon Lopez", avatar_url: null },
  ana: { id: "ana", full_name: "Ana Ruiz", avatar_url: null },
} as unknown as Record<string, import("@/pages/messenger/types").UserProfile>;

const esperar = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const aviso = (evento: string, objetivo: string | null = null, texto: string | null = null) =>
  ({ tabla: "chat_evento_sistema", op: "rpc", valores: { _conv: "g1", _evento: evento, _objetivo: objetivo, _texto: texto }, eq: {} });
const avisosLibres = () => base.escrituras.filter((w) => w.tabla === "chat_messages");
const orden = () => base.escrituras.map((w) => (w.op === "rpc" ? `aviso:${(w.valores as { _evento: string })._evento}` : `${w.tabla}:${w.op}`));
const panel = (conv = grupo()) =>
  render(<GroupMembersPanel conversation={conv} profiles={PERFILES} onClose={() => {}} onMembersChanged={() => {}} />);

beforeEach(() => {
  base.escrituras.length = 0;
  for (const k of Object.keys(base.filas)) delete base.filas[k];
});
afterEach(() => cleanup());

describe("avisarEvento", () => {
  it("manda el evento, la persona y el texto, con null en lo que no lleva", async () => {
    const llamadas: unknown[] = [];
    const db: ClienteParaAvisos = { rpc: async (fn, args) => { llamadas.push([fn, args]); return { error: null }; } };
    await avisarEvento(db, "g1", "agrego", { objetivo: "ana" });
    await avisarEvento(db, "g1", "renombro", { texto: "Ventas" });
    await avisarEvento(db, "g1", "salio");
    expect(llamadas).toEqual([
      ["chat_evento_sistema", { _conv: "g1", _evento: "agrego", _objetivo: "ana", _texto: null }],
      ["chat_evento_sistema", { _conv: "g1", _evento: "renombro", _objetivo: null, _texto: "Ventas" }],
      ["chat_evento_sistema", { _conv: "g1", _evento: "salio", _objetivo: null, _texto: null }],
    ]);
  });

  it("no tira: devuelve el error de la base, y también si el pedido revienta", async () => {
    const conError: ClienteParaAvisos = { rpc: async () => ({ error: { message: "chat_evento_no_autorizado: …" } }) };
    expect(await avisarEvento(conError, "g1", "salio")).toEqual({ error: { message: "chat_evento_no_autorizado: …" } });
    const revienta: ClienteParaAvisos = { rpc: () => { throw new Error("Failed to fetch"); } };
    expect(await avisarEvento(revienta, "g1", "salio")).toEqual({ error: { message: "Failed to fetch" } });
  });
});

describe("panel de miembros: cada aviso va por la RPC, con el evento y la persona", () => {
  it("sumar a alguien", async () => {
    base.filas.profiles = [{ id: "beto", full_name: "Beto Paz", avatar_url: null }];
    panel();
    await esperar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar miembro" }));
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Beto Paz/ })); });
    await esperar();
    expect(orden()).toEqual(["chat_participants:insert", "aviso:agrego"]);
    expect(base.escrituras[1]).toEqual(aviso("agrego", "beto"));
  });

  it("aceptar una solicitud", async () => {
    base.filas.chat_join_requests = [{ id: "r1", user_id: "beto", requested_by: "ana" }];
    base.filas.profiles = [{ id: "beto", full_name: "Beto Paz" }, { id: "ana", full_name: "Ana Ruiz" }];
    panel();
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Aprobar a Beto Paz" })); });
    await esperar();
    expect(orden()).toEqual(["chat_participants:insert", "chat_join_requests:delete", "aviso:acepto"]);
    expect(base.escrituras[2]).toEqual(aviso("acepto", "beto"));
  });

  it("hacer admin y quitar admin", async () => {
    panel();
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Hacer admin a Ana Ruiz" })); });
    await esperar();
    expect(orden()).toEqual(["chat_participants:update", "aviso:nombro_admin"]);
    expect(base.escrituras[1]).toEqual(aviso("nombro_admin", "ana"));
    cleanup();
    base.escrituras.length = 0;
    panel(grupo("admin"));
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Quitar admin a Ana Ruiz" })); });
    await esperar();
    expect(orden()).toEqual(["chat_participants:update", "aviso:quito_admin"]);
    expect(base.escrituras[1]).toEqual(aviso("quito_admin", "ana"));
  });

  it("sacar a alguien del grupo", async () => {
    panel();
    await esperar();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar a Ana Ruiz del grupo" }));
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Eliminar" })); });
    await esperar();
    expect(orden()).toEqual(["chat_participants:delete", "aviso:elimino"]);
    expect(base.escrituras[1]).toEqual(aviso("elimino", "ana"));
  });

  it("salir: el aviso va ANTES de borrar mi fila (después la base ya no me deja avisar)", async () => {
    // Quedo yo solo de admin con Ana: primero la promuevo, después aviso, después salgo.
    base.filas.chat_participants = [
      { user_id: "yo", role: "admin", joined_at: ahora },
      { user_id: "ana", role: "member", joined_at: ahora },
    ];
    panel();
    await esperar();
    fireEvent.click(screen.getByRole("button", { name: "Salir del grupo" }));
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salir" })); });
    await esperar();
    expect(orden()).toEqual(["chat_participants:update", "aviso:salio", "chat_participants:delete"]);
    expect(base.escrituras[1]).toEqual(aviso("salio"));
  });

  it("y nada de eso inserta un aviso directo en chat_messages", async () => {
    base.filas.profiles = [{ id: "beto", full_name: "Beto Paz", avatar_url: null }];
    panel();
    await esperar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar miembro" }));
    await esperar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Beto Paz/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Hacer admin a Ana Ruiz" })); });
    await esperar();
    expect(base.escrituras.filter((w) => w.op === "rpc")).toHaveLength(2);
    expect(avisosLibres()).toEqual([]);
  });
});

describe("encabezado del chat: renombrar el grupo", () => {
  it("el aviso va por la RPC con el nombre nuevo (sin espacios en las puntas), después de renombrar", async () => {
    const { container } = render(
      <ChatHeader
        conversation={grupo()} profiles={PERFILES} typingUsers={[]}
        onSearchToggle={() => {}} onBack={() => {}} onStartVideoCall={() => {}}
        onOpenNotificationSettings={() => {}} onOpenSharedFiles={() => {}}
      />,
    );
    await esperar();
    fireEvent.click(screen.getByRole("button", { name: "Editar nombre del grupo" }));
    const input = container.querySelector('input:not([type="file"])') as HTMLInputElement; // la otra es la de la foto
    fireEvent.change(input, { target: { value: "  Ventas  " } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    await esperar();
    expect(orden()).toEqual(["chat_conversations:update", "aviso:renombro"]);
    expect(base.escrituras[0].valores).toEqual({ name: "Ventas" });
    expect(base.escrituras[1]).toEqual(aviso("renombro", null, "Ventas"));
    expect(avisosLibres()).toEqual([]);
  });
});

// Los fuentes se leen con el glob de Vite y no con node:fs (el tsconfig del front
// compila los tests y no trae los tipos de Node). Un glob que no encuentra nada no
// falla solo: por eso cada test mira primero que lo que lee haya cargado.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const migracion = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/supabase/migrations/20261001100000_chat_mensajes_de_sistema.sql", { query: "?raw", import: "default", eager: true });
const SQL = migracion["/supabase/migrations/20261001100000_chat_mensajes_de_sistema.sql"] ?? "";

// Un objeto con type "system": lo que llevaba cada INSERT de aviso de la app.
const insertaAvisoLibre = (src: string) => /\btype\s*:\s*(["'`])system\1/.test(src);

describe("nada del frontend inserta un aviso de sistema directo", () => {
  it("la guarda reconoce el INSERT de antes (línea base que puede fallar)", () => {
    // Tal cual estaba en GroupMembersPanel.tsx (main 1ab8e4fc7).
    const antes = `await supabase.from("chat_messages").insert({
        conversation_id: conversation.id, sender_id: user!.id, type: "system",
        content: \`\${profiles[user!.id]?.full_name || "Admin"} aceptó a \${reqName(req.user_id, "Usuario")} en el grupo\`,
      });`;
    expect(insertaAvisoLibre(antes)).toBe(true);
    expect(insertaAvisoLibre(`if (message.type === "system") return null;`)).toBe(false);
    expect(insertaAvisoLibre(`type: "text" | "image" | "file" | "system";`)).toBe(false);
  });

  it("ningún archivo (fuera de los tests) arma un mensaje type 'system'", () => {
    const rutas = Object.keys(fuentes);
    expect(rutas.length).toBeGreaterThan(200);
    expect(rutas).toContain("/frontend/src/pages/messenger/components/GroupMembersPanel.tsx");
    const malos = rutas.filter((r) => !/\/test\/|\.test\.tsx?$/.test(r) && insertaAvisoLibre(fuentes[r]));
    expect(malos).toEqual([]);
  });

  it("los 6 lugares que avisaban ahora llaman a la RPC con su evento", () => {
    const header = fuentes["/frontend/src/pages/messenger/components/ChatHeader.tsx"] ?? "";
    const miembros = fuentes["/frontend/src/pages/messenger/components/GroupMembersPanel.tsx"] ?? "";
    expect(header).toMatch(/avisarEvento\([^)]*"renombro", \{ texto: v \}\)/);
    for (const llamada of ['avisar("acepto", req.user_id)', 'avisar("agrego", userId)', 'avisar("elimino", removingUser.id)',
      'avisar(makeAdmin ? "nombro_admin" : "quito_admin", userId)', 'avisar("salio")']) {
      expect(miembros).toContain(llamada);
    }
  });
});

describe("el contrato con la migración", () => {
  it("la migración se cargó", () => {
    expect(SQL.length).toBeGreaterThan(2000);
  });

  it("los eventos de la app son exactamente los que la base conoce", () => {
    const lista = SQL.match(/_evento not in \(([^)]*)\)/)?.[1] ?? "";
    const enLaBase = [...lista.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(enLaBase).toEqual([...EVENTOS_DE_SISTEMA]);
  });

  it("la RPC se llama como la llama la app, con esos argumentos", () => {
    expect(SQL).toMatch(/create or replace function public\.chat_evento_sistema\(\s*_conv uuid,\s*_evento text,\s*_objetivo uuid default null,\s*_texto text default null\s*\)/);
    // Con sesión de usuario, el aviso libre se rechaza con este prefijo.
    expect(SQL).toContain("'chat_sistema_sin_evento: ");
  });
});
