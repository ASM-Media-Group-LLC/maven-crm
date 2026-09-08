import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { realtime: { setAuth: vi.fn() } } }));

import { arrancarSincronizadorDeJwt, sincronizarJwtDeRealtime } from "@/lib/realtimeAuthSync";

// Realtime tiene que releer el JWT vigente cada tanto y al volver a la pestaña:
// es lo que evita que una pestaña que NO hizo la renovación se quede con el JWT
// vencido y sus canales mueran al re-unirse (07/09/2026).
describe("sincronizador del JWT de Realtime", () => {
  type Cliente = Parameters<typeof arrancarSincronizadorDeJwt>[0];
  let setAuth: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let cliente: Cliente;
  let parar: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    setAuth = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    cliente = { realtime: { setAuth } };
  });
  afterEach(() => { parar?.(); parar = null; vi.useRealTimers(); });

  it("pide a Realtime que relea el JWT cada 30 s, sin pasarle uno a mano", async () => {
    parar = arrancarSincronizadorDeJwt(cliente, 30_000);
    await vi.advanceTimersByTimeAsync(30_000 * 3 + 10);
    expect(setAuth).toHaveBeenCalledTimes(3);
    expect(setAuth).toHaveBeenCalledWith();
  });

  it("también al volver a mirar la pestaña y cuando otra pestaña escribe la sesión", async () => {
    parar = arrancarSincronizadorDeJwt(cliente, 60_000);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new StorageEvent("storage", { key: "sb-lsagslbkliprespbyhts-auth-token" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "otra-cosa" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(setAuth).toHaveBeenCalledTimes(2);
  });

  it("un fallo de setAuth no rompe nada y la próxima vuelta lo reintenta", async () => {
    setAuth.mockRejectedValueOnce(new Error("sin red"));
    await expect(sincronizarJwtDeRealtime(cliente)).resolves.toBeUndefined();
    parar = arrancarSincronizadorDeJwt(cliente, 1_000);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(setAuth).toHaveBeenCalledTimes(3);
  });

  it("es idempotente y se puede parar", async () => {
    parar = arrancarSincronizadorDeJwt(cliente, 1_000);
    const otro = arrancarSincronizadorDeJwt(cliente, 1_000);
    await vi.advanceTimersByTimeAsync(1_050);
    expect(setAuth).toHaveBeenCalledTimes(1);
    otro();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(setAuth).toHaveBeenCalledTimes(1);
  });
});
