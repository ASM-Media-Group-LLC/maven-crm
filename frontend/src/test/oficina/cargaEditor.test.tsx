import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
import { cargarApiDeOnlyOffice, useEditorDeOffice } from "@/hooks/useOnlyOffice";

type Eventos = { onAppReady: () => void; onDocumentReady: () => void; onError: () => void; onRequestHistory?: () => Promise<void> };
let eventos: Eventos;
let destruir: ReturnType<typeof vi.fn>;
const apertura = { servidor: "https://oficina.example", config: { document: { key: "archivo-v1" }, editorConfig: { mode: "edit" }, token: "firma" } };
function instalarApi() {
  window.DocsAPI = { DocEditor: vi.fn().mockImplementation(function (_id, config) {
    eventos = config.events;
    // La API real agrega propiedades: el objeto firmado original no debe cambiar.
    config.editorConfig.canUseHistory = true;
    return { destroyEditor: destruir, refreshHistory: vi.fn(), setHistoryData: vi.fn() };
  }) };
}
async function montar() {
  const hook = renderHook(({ datos }) => useEditorDeOffice("editor", datos), { initialProps: { datos: apertura } });
  await act(async () => {});
  return hook;
}
beforeEach(() => { vi.useFakeTimers(); destruir = vi.fn(); instalarApi(); });
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.DocsAPI; document.head.querySelectorAll('script[src*="oficina.example"]').forEach(e => e.remove()); });

describe("apertura real del documento", () => {
  it("el constructor y la interfaz lista no significan que el documento abrió", async () => {
    const h = await montar();
    expect(h.result.current.estado).toBe("cargando");
    act(() => eventos.onAppReady());
    expect(h.result.current.estado).toBe("abriendo");
    act(() => eventos.onDocumentReady());
    expect(h.result.current.estado).toBe("listo");
    act(() => vi.advanceTimersByTime(60_000));
    expect(h.result.current.error).toBeNull();
    expect(apertura.config.editorConfig).toEqual({ mode: "edit" });
  });
  it("una carga detenida ofrece recuperación sin destruir el editor", async () => {
    const h = await montar();
    act(() => eventos.onAppReady());
    act(() => vi.advanceTimersByTime(45_000));
    expect(h.result.current.error).toBe("oficina.doc.cargaLenta");
    expect(h.result.current.puedeReintentar).toBe(true);
    expect(destruir).not.toHaveBeenCalled();
    act(() => eventos.onDocumentReady());
    expect(h.result.current.estado).toBe("listo");
    expect(h.result.current.error).toBeNull();
  });
  it("un error de conexión durante la carga no se interpreta como falta de permiso", async () => {
    const h = await montar();
    act(() => eventos.onError());
    expect(h.result.current.error).toBe("oficina.doc.cargaFallida");
    expect(h.result.current.puedeReintentar).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(h.result.current.error).toBe("oficina.doc.cargaFallida");
  });
  it("no ofrece reiniciar un documento que ya abrió y puede tener cambios", async () => {
    const h = await montar();
    act(() => eventos.onDocumentReady());
    act(() => eventos.onError());
    expect(h.result.current.error).toBe("oficina.doc.conexionInterrumpida");
    expect(h.result.current.puedeReintentar).toBe(false);
    expect(destruir).not.toHaveBeenCalled();
  });
  it("ignora eventos tardíos del archivo anterior y limpia su temporizador", async () => {
    const h = await montar();
    const anteriores = eventos;
    h.rerender({ datos: { ...apertura, config: { ...apertura.config, document: { key: "otro-v1" } } } });
    await act(async () => {});
    act(() => anteriores.onDocumentReady());
    expect(h.result.current.estado).toBe("cargando");
    act(() => anteriores.onError());
    expect(h.result.current.error).toBeNull();
    expect(destruir).toHaveBeenCalledTimes(1);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("conserva los eventos de carga cuando el historial está habilitado", async () => {
    const lista = vi.fn().mockResolvedValue({ currentVersion: 1, history: [] });
    const h = renderHook(() => useEditorDeOffice("editor", apertura, { pedirLista: lista, pedirVersion: vi.fn(), restaurar: vi.fn(), alCerrar: vi.fn() }));
    await act(async () => {});
    await act(async () => eventos.onRequestHistory?.());
    expect(lista).toHaveBeenCalledOnce();
    act(() => eventos.onDocumentReady());
    expect(h.result.current.estado).toBe("listo");
  });
});
describe("descarga de la API del editor", () => {
  it("agota la espera de un script colgado y permite descargarlo de nuevo", async () => {
    delete window.DocsAPI;
    const fallo = cargarApiDeOnlyOffice(apertura.servidor).catch(e => e.message);
    expect(document.head.querySelectorAll('script[src*="oficina.example"]')).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(await fallo).toBe("office-api-unavailable");
    expect(document.head.querySelectorAll('script[src*="oficina.example"]')).toHaveLength(0);
    const nuevo = cargarApiDeOnlyOffice(apertura.servidor);
    instalarApi();
    document.head.querySelector('script[src*="oficina.example"]')!.dispatchEvent(new Event("load"));
    await expect(nuevo).resolves.toBeUndefined();
  });
});
