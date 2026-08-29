import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, act, cleanup } from "@testing-library/react";

// Que la llamada salga SOLA a la ventana flotante cuando la persona se va a otro
// programa — WhatsApp, OnlyFans, otra pestaña.
//
// POR QUÉ HACE FALTA UNA ACCIÓN DE MEDIASESSION Y NO UN `visibilitychange`:
// abrir esa ventana exige un gesto del usuario; `requestWindow()` se rechaza sin
// él. La ÚNICA vía sin clic es la acción "enterpictureinpicture", que Chrome
// dispara justo al cambiar de app y que solo en ese momento habilita la
// apertura. Es la misma que usa Meet. Si alguien "simplifica" esto a un
// listener de visibilidad, deja de funcionar y no lo va a avisar nadie.
//
// Y la otra mitad, que es la que cuida al usuario: la ventana se guarda sola al
// volver SOLO si la sacó el navegador. Quien la sacó a mano seguramente la puso
// en otro monitor a propósito, y cerrársela le rompe lo que armó.

const abrir = vi.fn();
const cerrar = vi.fn();
/** Empuja el estado del mock para simular que la ventana quedó abierta. */
let ponerVentana: ((w: unknown) => void) | null = null;

vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({
  default: () => <div data-testid="llamada" />,
}));
vi.mock("@/hooks/useCoworkRequestAlerts", () => ({ useCoworkRequestAlerts: () => {} }));

vi.mock("@/pages/cowork/usePipWindow", async () => {
  const React = await import("react");
  return {
    docPipSupported: () => true,
    usePipWindow: () => {
      const [pipWindow, set] = React.useState<unknown>(null);
      ponerVentana = set;
      return {
        pipWindow,
        openPip: async (m?: unknown) => { abrir(m); return true; },
        closePip: () => { cerrar(); set(null); },
      };
    },
  };
});

const { PersistentCallProvider, usePersistentCall } = await import(
  "@/components/PersistentCallProvider"
);

/** Los manejadores que la app registró en MediaSession. */
const registrados = new Map<string, (() => void) | null>();

function Pagina({ conLlamada }: { conLlamada: boolean }) {
  const { startCall } = usePersistentCall();
  useEffect(() => {
    if (conLlamada) startCall({ key: "sala", roomName: "sala" } as never);
  }, [conLlamada, startCall]);
  return null;
}

/** Monta, deja que arranque la llamada y BORRA los contadores.
 *
 *  Lo último importa: el provider cierra la ventana del sistema cuando no hay
 *  llamada (PersistentCallProvider.tsx:134), y en el primer render todavía no
 *  la hay. Ese cierre inicial es correcto, pero si no se limpia acá ensucia las
 *  aserciones de los tests que cuentan cierres. */
const montar = async (conLlamada = true) => {
  const r = render(<PersistentCallProvider><Pagina conLlamada={conLlamada} /></PersistentCallProvider>);
  await act(async () => { await Promise.resolve(); });
  abrir.mockClear(); cerrar.mockClear();
  return r;
};

const cambiarVisibilidad = async (estado: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: estado, configurable: true });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
};

describe("la llamada sale sola al irse a otro programa", () => {
  beforeEach(() => {
    abrir.mockClear(); cerrar.mockClear(); registrados.clear(); ponerVentana = null;
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { setActionHandler: (a: string, h: (() => void) | null) => registrados.set(a, h) },
    });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  // Sin esto, los provider de los tests anteriores siguen montados y SUS
  // escuchas de visibilidad responden también: el test de "no la cierra" veía
  // el cierre que disparaba el montaje de un test previo.
  afterEach(cleanup);

  it("con una llamada activa, registra la acción del navegador", async () => {
    await montar();
    expect(registrados.get("enterpictureinpicture")).toBeTypeOf("function");
  });

  it("sin llamada NO la registra: no hay nada que sacar", async () => {
    await montar(false);
    expect(registrados.get("enterpictureinpicture")).toBeUndefined();
  });

  it("cuando el navegador la dispara, abre la ventana flotante", async () => {
    await montar();
    await act(async () => { registrados.get("enterpictureinpicture")?.(); });
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("al volver, se guarda sola si la sacó el navegador", async () => {
    await montar();
    await act(async () => { registrados.get("enterpictureinpicture")?.(); });
    await act(async () => { ponerVentana?.({}); });      // la ventana quedó abierta
    await cambiarVisibilidad("hidden");
    await cambiarVisibilidad("visible");
    expect(cerrar).toHaveBeenCalled();
  });

  it("pero NO la cierra si la sacó la persona a mano", async () => {
    await montar();
    // Nadie disparó la acción del navegador: la ventana se abrió por el botón.
    await act(async () => { ponerVentana?.({}); });
    await cambiarVisibilidad("hidden");
    await cambiarVisibilidad("visible");
    // Se la puso en otro monitor a propósito. Cerrársela sería romperle lo que armó.
    expect(cerrar).not.toHaveBeenCalled();
  });

  it("no abre una segunda ventana si ya está afuera", async () => {
    await montar();
    await act(async () => { ponerVentana?.({}); });
    await act(async () => { registrados.get("enterpictureinpicture")?.(); });
    expect(abrir).not.toHaveBeenCalled();
  });

  it("si el navegador no soporta la acción, no rompe nada", async () => {
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { setActionHandler: () => { throw new Error("no soportada"); } },
    });
    await expect(montar()).resolves.toBeTruthy();   // queda el botón manual
  });
});
