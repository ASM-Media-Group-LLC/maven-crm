import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { leer } = vi.hoisted(() => ({ leer: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: leer }) }) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useCanalQueRevive", () => ({ useCanalQueRevive: () => {} }));
vi.mock("@/hooks/canalDelChat", () => ({ useSaludDelChat: () => "conectado" }));

import { useReactions, REFRESCO_REACCIONES_MS, type Reaction } from "@/hooks/useReactions";

const reaccion = (message_id: string): Reaction => ({
  id: `reaccion-${message_id}`, message_id, user_id: "otra-persona", emoji: "👍", created_at: "2026-11-24T00:00:00Z",
});
const avanzar = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe("reacciones de la conversación abierta", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T00:00:00Z"));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    leer.mockReset().mockImplementation((_column: string, ids: string[]) => Promise.resolve({ data: ids.map(reaccion), error: null }));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("al pasar de A a B deja de pedir los mensajes de A en los repasos", async () => {
    const { result, rerender } = renderHook(({ chat }) => useReactions(chat), { initialProps: { chat: "a" } });
    act(() => { result.current.addMessageId("a-1"); result.current.addMessageId("a-2"); });
    await avanzar(100);
    expect(leer).toHaveBeenLastCalledWith("message_id", ["a-1", "a-2"]);
    expect(result.current.getReactionsForMessage("a-1")).toHaveLength(1);

    rerender({ chat: "b" });
    act(() => { result.current.addMessageId("b-1"); });
    await avanzar(100);
    expect(leer).toHaveBeenLastCalledWith("message_id", ["b-1"]);
    expect(result.current.getReactionsForMessage("a-1")).toEqual([]);
    await avanzar(REFRESCO_REACCIONES_MS);
    expect(leer).toHaveBeenLastCalledWith("message_id", ["b-1"]);
  });

  it("una respuesta tardía del chat anterior no pisa el chat nuevo", async () => {
    let responderA!: (value: { data: Reaction[]; error: null }) => void;
    leer.mockImplementationOnce(() => new Promise((resolve) => { responderA = resolve; }));
    const { result, rerender } = renderHook(({ chat }) => useReactions(chat), { initialProps: { chat: "a" } });
    act(() => { result.current.addMessageId("a-1"); });
    await avanzar(100);
    rerender({ chat: "b" });
    act(() => { result.current.addMessageId("b-1"); });
    await avanzar(100);
    await act(async () => { responderA({ data: [reaccion("a-1")], error: null }); });
    expect(result.current.getReactionsForMessage("a-1")).toEqual([]);
    expect(result.current.getReactionsForMessage("b-1")).toHaveLength(1);
  });

  it("una petición de 30 s no genera cuatro peticiones adicionales encima", async () => {
    let responder!: (value: { data: Reaction[]; error: null }) => void;
    leer.mockImplementationOnce(() => new Promise((resolve) => { responder = resolve; }));
    const { result } = renderHook(() => useReactions("a"));
    act(() => { result.current.addMessageId("a-1"); });
    await avanzar(30_000);
    expect(leer).toHaveBeenCalledTimes(1);
    await act(async () => { responder({ data: [reaccion("a-1")], error: null }); });
    await avanzar(REFRESCO_REACCIONES_MS);
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it("sin red no sigue consultando y retoma en el próximo repaso", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    const { result } = renderHook(() => useReactions("a"));
    act(() => { result.current.addMessageId("a-1"); });
    await avanzar(100);
    online.mockReturnValue(false);
    await avanzar(30_000);
    expect(leer).toHaveBeenCalledTimes(1);
    online.mockReturnValue(true);
    await avanzar(REFRESCO_REACCIONES_MS);
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it("un error conserva las reacciones conocidas y permite reintentar", async () => {
    const { result } = renderHook(() => useReactions("a"));
    act(() => { result.current.addMessageId("a-1"); });
    await avanzar(100);
    leer.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    await avanzar(REFRESCO_REACCIONES_MS);
    expect(result.current.getReactionsForMessage("a-1")).toHaveLength(1);
    await avanzar(REFRESCO_REACCIONES_MS);
    expect(leer).toHaveBeenCalledTimes(3);
  });

  it("desmontar antes de la primera lectura cancela el trabajo pendiente", async () => {
    const { result, unmount } = renderHook(() => useReactions("a"));
    act(() => { result.current.addMessageId("a-1"); });
    unmount();
    await avanzar(20_000);
    expect(leer).not.toHaveBeenCalled();
  });

  it("el primer render de B no vuelve a registrar los mensajes que todavía vienen de A", async () => {
    const { result, rerender } = renderHook(({ chat }) => useReactions(chat), { initialProps: { chat: "a" } });
    act(() => { result.current.addMessageId("a-1", "a"); });
    await avanzar(100);
    rerender({ chat: "b" });
    act(() => { result.current.addMessageId("a-1", "a"); result.current.addMessageId("b-1", "b"); });
    await avanzar(100);
    expect(leer).toHaveBeenLastCalledWith("message_id", ["b-1"]);
  });

});
