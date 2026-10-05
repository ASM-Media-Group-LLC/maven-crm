// DOS LENTITUDES QUE REPORTÓ KEILA (02/10).
//
// 1) «Llega el aviso de un correo nuevo pero no aparece en la lista.» La lista
//    del Correo se entera de lo nuevo SOLO por Realtime, y el número del menú
//    se relee cada 60 s por su cuenta. El canal se suscribía sin mirar su
//    estado: en realtime-js un canal que queda CLOSED (el socket se cayó, la
//    computadora se suspendió) no vuelve nunca. El número seguía subiendo y la
//    lista quedaba congelada hasta recargar.
//
// 2) «Eliminar borradores tarda ~5 s.» Medido en los registros de la edge:
//    5,2 s, 6,6 s y 6,2 s (Zoho), contra ~1,2 s de un archivar. La lista ya
//    sacaba la fila al instante, pero la barra quedaba deshabilitada hasta que
//    contestara el servidor: el siguiente borrador había que esperarlo. Ahora
//    se puede seguir, y una acción no le devuelve a la pantalla lo que otra ya
//    sacó.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ── Supabase falso: canales que se pueden matar y una edge que contesta cuando
//    la prueba quiere ─────────────────────────────────────────────────────────
type CanalFalso = {
  topic: string;
  alCambiar: ((p: unknown) => void) | null;
  alEstado: ((s: string) => void) | null;
  on: (tipo: string, filtro: unknown, cb: (p: unknown) => void) => CanalFalso;
  subscribe: (cb?: (s: string) => void) => CanalFalso;
};
const canales: CanalFalso[] = [];
type Pendiente = { body: Record<string, unknown>; resolver: (v: unknown) => void };
const pedidos: Pendiente[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => {
      const c: CanalFalso = {
        topic,
        alCambiar: null,
        alEstado: null,
        on(_t, _f, cb) { c.alCambiar = cb; return c; },
        subscribe(cb) { c.alEstado = cb ?? null; return c; },
      };
      canales.push(c);
      return c;
    },
    removeChannel: vi.fn(async () => "ok"),
    functions: {
      invoke: (_nombre: string, { body }: { body: Record<string, unknown> }) =>
        new Promise((resolver) => pedidos.push({ body, resolver })),
    },
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import {
  useMailRealtime, useMailBulk, useDeleteServerDraft,
  CLAVES_QUE_ESCRIBE_EL_SINCRONIZADOR, ESPERA_REALTIME_MS, type MailSummary,
} from "@/hooks/useMailbox";

function correo(id: string, uid: number): MailSummary {
  return {
    id, uid, from: "a@x.com", to: "b@x.com", subject: id, date: "2026-10-02T14:00:00Z",
    inReplyTo: undefined, refs: undefined, unread: false, origen: "cache",
  };
}

let qc: QueryClient;
let invalidar: ReturnType<typeof vi.spyOn>;
const envoltorio = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const claves = () => invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
const lista = (folder: string) =>
  (qc.getQueryData([`mail-messages`, folder, 0]) as { messages: MailSummary[] }).messages.map((m) => m.id);
const contestar = async (i: number, data: unknown) => {
  await act(async () => { pedidos[i].resolver({ data, error: null }); await Promise.resolve(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

beforeEach(() => {
  canales.length = 0;
  pedidos.length = 0;
  toastError.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  invalidar = vi.spyOn(qc, "invalidateQueries");
});

afterEach(async () => {
  vi.useRealTimers();
  // El semáforo de useMailbox (2 llamadas a la vez) es del módulo: lo que una
  // prueba deja sin contestar le quitaría el turno a la siguiente.
  for (const p of pedidos) p.resolver({ data: { ok: true, afectados: 0 }, error: null });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  qc.clear();
});

describe("la lista del Correo no se queda congelada si el canal se cae", () => {
  beforeEach(() => vi.useFakeTimers());

  it("un canal CLOSED se vuelve a crear solo", () => {
    renderHook(() => useMailRealtime(true), { wrapper: envoltorio });
    expect(canales).toHaveLength(1);
    expect(canales[0].topic.startsWith("mail-u1")).toBe(true);
    // Sin callback de estado (el bug) no hay a quién avisarle que murió.
    expect(canales[0].alEstado).toBeTypeOf("function");

    act(() => { canales[0].alEstado!("SUBSCRIBED"); canales[0].alEstado!("CLOSED"); });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(canales).toHaveLength(2);
    expect(canales[1].topic.startsWith("mail-u1")).toBe(true);
  });

  it("al revivir relee TODO lo que se pudo perder mientras estuvo muerto", () => {
    renderHook(() => useMailRealtime(true), { wrapper: envoltorio });
    act(() => { canales[0].alEstado!("SUBSCRIBED"); canales[0].alEstado!("CHANNEL_ERROR"); });
    act(() => { vi.advanceTimersByTime(1_000); });
    invalidar.mockClear();
    act(() => { canales[1].alEstado!("SUBSCRIBED"); });
    for (const k of CLAVES_QUE_ESCRIBE_EL_SINCRONIZADOR) expect(claves()).toContain(JSON.stringify(k));
  });

  it("un correo nuevo relee la lista, el número del menú, las etiquetas y la conversación abierta", () => {
    renderHook(() => useMailRealtime(true), { wrapper: envoltorio });
    act(() => { canales[0].alEstado!("SUBSCRIBED"); });
    invalidar.mockClear();
    // Una ráfaga (una tanda de correos) relee UNA vez, y espera a que el
    // sincronizador termine de poner la etiqueta heredada.
    act(() => { canales[0].alCambiar!({}); canales[0].alCambiar!({}); canales[0].alCambiar!({}); });
    expect(invalidar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(ESPERA_REALTIME_MS); });
    expect(claves()).toEqual(CLAVES_QUE_ESCRIBE_EL_SINCRONIZADOR.map((k) => JSON.stringify(k)));
    for (const k of ["mail-messages", "sidebar-badges", "mail-por-etiqueta", "mail-hilo"]) {
      expect(claves()).toContain(JSON.stringify([k]));
    }
  });

  it("con una acción masiva en vuelo no relee (traería lo que la acción ya sacó)", () => {
    renderHook(() => useMailRealtime(true), { wrapper: envoltorio });
    act(() => { canales[0].alEstado!("SUBSCRIBED"); });
    invalidar.mockClear();
    const enVuelo = vi.spyOn(qc, "isMutating").mockReturnValue(1);
    act(() => { canales[0].alCambiar!({}); vi.advanceTimersByTime(ESPERA_REALTIME_MS); });
    expect(invalidar).not.toHaveBeenCalled();
    enVuelo.mockRestore();
  });
});

describe("eliminar varios seguidos no espera a Zoho ni resucita filas", () => {
  beforeEach(() => {
    qc.setQueryData(["mail-messages", "Borrador", 0], {
      messages: [correo("a", 1), correo("b", 2), correo("c", 3)],
    });
  });

  it("dos eliminaciones en vuelo: la primera en terminar NO relee la lista", async () => {
    const { result } = renderHook(() => useMailBulk(), { wrapper: envoltorio });
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    await act(async () => { p1 = result.current.mutateAsync({ folder: "Borrador", op: "delete", items: [correo("a", 1)] }); });
    await act(async () => { p2 = result.current.mutateAsync({ folder: "Borrador", op: "delete", items: [correo("b", 2)] }); });
    // Las dos filas salieron al instante, sin esperar al servidor.
    expect(lista("Borrador")).toEqual(["c"]);
    expect(pedidos).toHaveLength(2);
    invalidar.mockClear();

    await contestar(0, { ok: true, afectados: 1 });
    await p1;
    // Releer ahora traería del servidor la "b", que todavía no se terminó de
    // mover: volvería a aparecer hasta que conteste la segunda.
    expect(claves()).not.toContain(JSON.stringify(["mail-messages"]));
    expect(lista("Borrador")).toEqual(["c"]);

    await contestar(1, { ok: true, afectados: 1 });
    await p2;
    expect(claves()).toContain(JSON.stringify(["mail-messages"]));
  });

  it("si una falla, relee enseguida: lo suyo vuelve a la lista (el aviso lo da la pantalla)", async () => {
    const { result } = renderHook(() => useMailBulk(), { wrapper: envoltorio });
    let p1!: Promise<unknown>;
    await act(async () => { p1 = result.current.mutateAsync({ folder: "Borrador", op: "delete", items: [correo("a", 1)] }).catch((e) => e); });
    await act(async () => { void result.current.mutateAsync({ folder: "Borrador", op: "delete", items: [correo("b", 2)] }).catch(() => {}); });
    invalidar.mockClear();
    await contestar(0, { error: "IMAP no pudo aplicar" });
    expect(await p1).toBeInstanceOf(Error);
    expect(claves()).toContain(JSON.stringify(["mail-messages"]));
  });
});

describe("la barra de selección no espera a que conteste el servidor", () => {
  const fuentes = (import.meta as unknown as {
    glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
  }).glob(["/frontend/src/pages/correo/CorreoPage.tsx"], { query: "?raw", import: "default", eager: true });
  const pagina = Object.values(fuentes)[0] ?? "";

  it("el fuente cargó (si no, lo de abajo pasaría en vacío)", () => {
    expect(pagina).toContain("ejecutarMasiva(\"delete\", items)");
  });

  it("ningún botón se deshabilita mientras haya una acción masiva en vuelo", () => {
    // Era lo que hacía esperar 5-6 s para eliminar el siguiente borrador.
    expect(pagina).not.toMatch(/masiva\.isPending/);
  });
});

describe("enviar un borrador lo saca de Borradores al instante", () => {
  beforeEach(() => {
    qc.setQueryData(["mail-messages", "Borrador", 0], { messages: [correo("a", 7), correo("b", 8)] });
  });

  it("sale de la lista antes de que conteste el servidor", async () => {
    const { result } = renderHook(() => useDeleteServerDraft(), { wrapper: envoltorio });
    await act(async () => { result.current.mutate({ uid: 7 }); });
    expect(lista("Borrador")).toEqual(["b"]);
    expect(pedidos[0].body).toMatchObject({ action: "delete_draft", uid: 7 });
  });

  it("la edge también lo saca de la caché (si no, volvía a aparecer al releer)", () => {
    const edge = Object.values((import.meta as unknown as {
      glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
    }).glob(["/supabase/functions/mail-fetch/index.ts"], { query: "?raw", import: "default", eager: true }))[0] ?? "";
    const i = edge.indexOf('if (action === "delete_draft") {');
    expect(i).toBeGreaterThan(0);
    const rama = edge.slice(i, edge.indexOf("return json(req, { ok });", i));
    expect(rama).toMatch(/if \(ok\) \{\s*await admin\.from\("mail_messages"\)\.delete\(\)\s*\.eq\("user_id", user\.id\)\.eq\("folder", box\)\.eq\("uid", uid\);/);
  });

  it("si el servidor no pudo, se avisa y la lista se vuelve a leer (reaparece)", async () => {
    const { result } = renderHook(() => useDeleteServerDraft(), { wrapper: envoltorio });
    await act(async () => { result.current.mutate({ uid: 7 }); });
    invalidar.mockClear();
    await contestar(0, { ok: false });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(claves()).toContain(JSON.stringify(["mail-messages", "Borrador"]));
  });
});
