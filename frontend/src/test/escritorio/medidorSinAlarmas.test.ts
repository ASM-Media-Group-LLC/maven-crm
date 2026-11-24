import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marcarDetalleAbierto, useMedidorEquipo } from "@/hooks/useMedidorEquipo";
import { pwa } from "@/lib/i18n/pwa";

const mocks = vi.hoisted(() => ({
  user: { id: "prueba-local-medidor" },
  memoria: vi.fn(),
  guardar: vi.fn(async () => ({ error: null })),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: keyof typeof pwa) => pwa[k]?.en ?? k }) }));
vi.mock("@/lib/escritorio", () => ({ escritorio: () => ({ plataforma: "mac", memoria: mocks.memoria }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.guardar }) },
  SUPABASE_URL: "https://diagnostico.example", SUPABASE_PUBLISHABLE_KEY: "prueba-local",
}));
vi.mock("sonner", () => ({ toast: { info: mocks.info, warning: mocks.warning } }));

const avanzar = async (ms = 20_000) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
  mocks.memoria.mockResolvedValue({ app_mb: 500, equipo_gb: 8, libre_gb: 0, cpu_equipo_pct: 100, cpu_app_pct: 8 });
  marcarDetalleAbierto(false);
});
afterEach(() => {
  cleanup();
  marcarDetalleAbierto(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rendimiento sin alarmas sobre el computador", () => {
  it("mantiene las mediciones y su registro sin mostrar alertas de CPU o RAM", async () => {
    const { result } = renderHook(() => useMedidorEquipo());
    await avanzar(6 * 60_000);
    expect(result.current.luces).toEqual({ internet: "verde", computador: "rojo", memoria: "rojo" });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.guardar).toHaveBeenCalledWith(expect.objectContaining({
      user_id: mocks.user.id,
      datos: expect.objectContaining({ cpu_equipo_pct: 100, app_mb: 500, libre_gb: 0 }),
    }));
  });

  it("un corte de internet sí informa, sin mezclarlo con la carga del procesador o la RAM", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderHook(() => useMedidorEquipo());
    await avanzar(0);
    expect(mocks.info).not.toHaveBeenCalled();
    await avanzar();
    expect(mocks.info).toHaveBeenCalledWith("Offline", expect.objectContaining({
      description: "Check your internet connection to reconnect to Maven.",
    }));
    await avanzar(60_000);
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.warning).not.toHaveBeenCalled();
  });

  it("no interrumpe mientras la persona está consultando el diagnóstico", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    marcarDetalleAbierto(true);
    renderHook(() => useMedidorEquipo());
    await avanzar(60_000);
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
