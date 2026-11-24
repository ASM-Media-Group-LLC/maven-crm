import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pwa } from "@/lib/i18n/pwa";
import { AvisoActualizacionApp, ESPERA_REINICIO_MS } from "@/components/AvisoActualizacionApp";

const app = vi.hoisted(() => ({
  actualizarAhora: vi.fn<() => Promise<boolean>>(),
  actualizacionPendiente: vi.fn(async () => "2.1.2611212204"),
  alActualizacionLista: vi.fn(() => () => {}),
}));
const llamada = vi.hoisted(() => ({ activa: false }));
vi.mock("@/lib/escritorio", () => ({ escritorio: () => app }));
vi.mock("@/lib/llamadaActiva", () => ({ hayLlamadaActiva: () => llamada.activa }));
vi.mock("@/hooks/useEsDueno", () => ({ useEsDueno: () => ({ esDueno: false }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: keyof typeof pwa) => pwa[k]?.en ?? k }) }));
vi.mock("@/lib/novedadesApp", () => ({ alCambiarTarjeta: () => () => {} }));

const abrir = async () => { await act(async () => { render(<AvisoActualizacionApp />); }); };
const pulsar = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); }); };
const avanzar = async () => { await act(async () => { vi.advanceTimersByTime(ESPERA_REINICIO_MS); }); };

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  vi.clearAllMocks();
  llamada.activa = false;
  app.actualizarAhora.mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("recuperación del actualizador de escritorio", () => {
  it("una solicitud aceptada sin reinicio deja reintentar o seguir trabajando", async () => {
    await abrir();
    await pulsar("Update");
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
    await avanzar();
    expect(screen.getByRole("button", { name: "Retry update" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Download the installer and see the steps" })).toHaveAttribute("href", "/app?descargar=1");
    await pulsar("Keep working");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download the installer and see the steps" })).toHaveAttribute("href", "/app?descargar=1");
    // Ir a la guía o recargar no vuelve a encerrar a la persona en el cartel.
    cleanup();
    await abrir();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download the installer and see the steps" })).toHaveAttribute("href", "/app?descargar=1");
    expect(app.actualizarAhora).toHaveBeenCalledTimes(1);
    await pulsar("Retry update");
    expect(app.actualizarAhora).toHaveBeenCalledTimes(2);
  });

  it.each(["rechazo", "fallo", "sin respuesta"])("recupera el acceso ante %s del instalador", async (tipo) => {
    if (tipo === "rechazo") app.actualizarAhora.mockResolvedValue(false);
    else if (tipo === "fallo") app.actualizarAhora.mockRejectedValue(new Error("installer error"));
    else app.actualizarAhora.mockImplementation(() => new Promise(() => {}));
    await abrir();
    await pulsar("Update");
    await avanzar();
    expect(screen.getByRole("button", { name: "Keep working" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Updating…" })).not.toBeInTheDocument();
  });

  it("una respuesta atrasada no cancela un segundo intento", async () => {
    let responder!: (ok: boolean) => void;
    app.actualizarAhora.mockImplementationOnce(() => new Promise((resolve) => { responder = resolve; }));
    await abrir();
    await pulsar("Update");
    await avanzar();
    await pulsar("Retry update");
    await act(async () => { responder(false); });
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
    await avanzar();
    expect(screen.getByRole("button", { name: "Keep working" })).toBeEnabled();
  });

  it("espera a que termine la llamada y no repite la instalación fallida", async () => {
    llamada.activa = true;
    await abrir();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(app.actualizarAhora).not.toHaveBeenCalled();
    llamada.activa = false;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(app.actualizarAhora).toHaveBeenCalledTimes(1);
    await avanzar();
    await avanzar();
    expect(app.actualizarAhora).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Keep working" })).toBeEnabled();
  });
});
