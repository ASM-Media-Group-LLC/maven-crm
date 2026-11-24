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
  visible: vi.fn(async () => true),
  alCambiarVisibilidad: vi.fn(),
  soltarVisibilidad: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: keyof typeof pwa) => pwa[k]?.en ?? k }) }));
vi.mock("@/lib/escritorio", () => ({ escritorio: () => ({
  plataforma: "mac", memoria: mocks.memoria,
  visible: mocks.visible, alCambiarVisibilidad: mocks.alCambiarVisibilidad,
}) }));
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
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
  mocks.memoria.mockResolvedValue({ app_mb: 500, equipo_gb: 8, libre_gb: 0, cpu_equipo_pct: 100, cpu_app_pct: 8 });
  mocks.visible.mockResolvedValue(true);
  mocks.alCambiarVisibilidad.mockReturnValue(mocks.soltarVisibilidad);
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

  it("en segundo plano mide cada cinco minutos y vuelve a medir al abrir la app", async () => {
    const oculta = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    renderHook(() => useMedidorEquipo());
    await avanzar(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await avanzar(280_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await avanzar();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.guardar).toHaveBeenCalledTimes(2);
    oculta.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("la variación del ping no salta el registro de los cinco minutos", async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise((ok) => setTimeout(() => ok(new Response()), 100)))
      .mockImplementationOnce(() => new Promise((ok) => setTimeout(() => ok(new Response()), 50)));
    renderHook(() => useMedidorEquipo());
    await avanzar(100);
    expect(mocks.guardar).toHaveBeenCalledTimes(1);
    await avanzar(299_950); // segunda muestra: comienza a los 5 min y termina 50 ms después
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.guardar).toHaveBeenCalledTimes(2);
  });

  it("sin internet conserva el diagnóstico local sin enviar solicitudes y mide al recuperarlo", async () => {
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useMedidorEquipo());
    await avanzar(40_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.muestra?.en_linea).toBe(false);
    enLinea.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.muestra?.en_linea).toBe(true);
  });

  it("no duplica una medición pendiente al recibir eventos de vuelta", async () => {
    let terminar!: (r: { ok: boolean; status: number }) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { terminar = resolve as typeof terminar; }));
    renderHook(() => useMedidorEquipo());
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { terminar({ ok: true, status: 200 }); });
    expect(mocks.guardar).toHaveBeenCalledTimes(1);
  });

  it("cancelar la sesión aborta la petición y no guarda resultados tardíos", async () => {
    let signal: AbortSignal | undefined;
    let terminar!: (r: { ok: boolean; status: number }) => void;
    vi.mocked(fetch).mockImplementationOnce((_url, options) => {
      signal = options?.signal as AbortSignal;
      return new Promise((resolve) => { terminar = resolve as typeof terminar; });
    });
    const { unmount } = renderHook(() => useMedidorEquipo());
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { terminar({ ok: true, status: 200 }); });
    expect(mocks.guardar).not.toHaveBeenCalled();
    await avanzar(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renovar el objeto de usuario con la misma identidad no reinicia el medidor", async () => {
    const { rerender } = renderHook(() => useMedidorEquipo());
    await avanzar(0);
    mocks.user = { ...mocks.user };
    rerender();
    await avanzar(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("la app minimizada frena las consultas aunque document siga visible", async () => {
    mocks.visible.mockResolvedValue(false);
    const { unmount } = renderHook(() => useMedidorEquipo());
    await avanzar(280_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await avanzar();
    expect(fetch).toHaveBeenCalledTimes(2);
    const alCambiar = mocks.alCambiarVisibilidad.mock.calls[0][0];
    await act(async () => { alCambiar(true); });
    expect(fetch).toHaveBeenCalledTimes(3);
    unmount();
    expect(mocks.soltarVisibilidad).toHaveBeenCalledOnce();
  });
});
