import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
const cargador = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cargarVistaDeLlamada", () => ({ cargarVistaDeLlamada: cargador }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguageSiHay: () => null }));
vi.mock("@/lib/i18n", () => ({ traducir: (clave: string) => clave }));
import VistaDeLlamadaDiferida from "@/components/VistaDeLlamadaDiferida";
import { hayLlamadaActiva, marcarLlamadaActiva, olvidarLlamadasActivas } from "@/lib/llamadaActiva";

const props = { roomName: "dm_prueba", displayName: "Prueba", onLeave: vi.fn() };
const lista = { default: ({ compact }: { compact?: boolean }) => <div data-testid="llamada">{compact ? "mini" : "grande"}</div> };
const vaciar = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
beforeEach(() => { cargador.mockReset(); olvidarLlamadasActivas(); });
afterEach(() => { cleanup(); olvidarLlamadasActivas(); });

describe("cargar una llamada con internet inestable", () => {
  it("protege el intento desde antes de descargar el motor y deja reintentar el fallo", async () => {
    let protegida = false;
    cargador.mockImplementationOnce(async () => { protegida = hayLlamadaActiva(); throw new Error("sin red"); });
    cargador.mockResolvedValueOnce(lista);
    render(<VistaDeLlamadaDiferida {...props} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await vaciar();
    expect(protegida).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("messenger.callView.cargaFallo");
    expect(hayLlamadaActiva()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "messenger.callView.reintentarCarga" }));
    await vaciar();
    expect(cargador).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("llamada")).toBeInTheDocument();
  });

  it("si Vite devuelve undefined tras preloadError se muestra el mismo reintento", async () => {
    cargador.mockResolvedValueOnce(undefined);
    render(<VistaDeLlamadaDiferida {...props} />); await vaciar();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(hayLlamadaActiva()).toBe(false);
  });

  it("cerrar durante la carga suelta la protección y no monta una llamada tardía", async () => {
    let terminar!: (valor: typeof lista) => void;
    cargador.mockImplementationOnce(() => new Promise((ok) => { terminar = ok; }));
    const { unmount } = render(<VistaDeLlamadaDiferida {...props} />);
    expect(hayLlamadaActiva()).toBe(true);
    unmount(); expect(hayLlamadaActiva()).toBe(false);
    act(() => { terminar(lista); }); await vaciar();
    expect(screen.queryByTestId("llamada")).not.toBeInTheDocument();
  });

  it("moverla a miniatura conserva el mismo componente y no vuelve a descargar", async () => {
    cargador.mockResolvedValueOnce(lista);
    const { rerender } = render(<VistaDeLlamadaDiferida {...props} />); await vaciar();
    const llamada = screen.getByTestId("llamada");
    rerender(<VistaDeLlamadaDiferida {...props} compact />);
    expect(screen.getByTestId("llamada")).toBe(llamada);
    expect(llamada).toHaveTextContent("mini");
    expect(cargador).toHaveBeenCalledTimes(1);
  });

  it("un fallo de carga no libera la protección de otra llamada que sigue activa", async () => {
    marcarLlamadaActiva("cowork_otra");
    cargador.mockRejectedValueOnce(new Error("sin red"));
    render(<VistaDeLlamadaDiferida {...props} />); await vaciar();
    expect(hayLlamadaActiva()).toBe(true);
  });
});
