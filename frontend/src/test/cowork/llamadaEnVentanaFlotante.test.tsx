import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, act, cleanup } from "@testing-library/react";

// La llamada tiene que MUDARSE a la ventana flotante SIN remontarse.
//
// Remontar una videollamada no es un detalle de rendimiento: es reconectarla.
// Video en negro, audio cortado, unos segundos perdidos — y en Cowork eso lo ve
// el supervisor como si la persona se hubiera ido. Ya pasó una vez por cambiar
// el contenedor de un createPortal.
//
// Por eso el componente dibuja SIEMPRE dentro de la misma `caja` y lo que se
// mueve es la caja, con appendChild. Mover un nodo del DOM a mano no remonta
// nada; portalizar a un contenedor distinto sí.
//
// Este test existe para que nadie "simplifique" eso a
// `createPortal(children, pipWindow ? pipBody : ancla)`, que parece lo mismo y
// reconecta la llamada en cada mudanza.

let ponerVentana: ((w: unknown) => void) | null = null;
const abrir = vi.fn();
const cerrar = vi.fn();

vi.mock("@/pages/cowork/usePipWindow", async () => {
  const React = await import("react");
  return {
    docPipSupported: () => true,
    usePipWindow: () => {
      const [pipWindow, set] = React.useState<unknown>(null);
      ponerVentana = set;
      return {
        pipWindow,
        openPip: async () => { abrir(); return true; },
        closePip: () => { cerrar(); set(null); },
      };
    },
  };
});

const { LlamadaEnVentanaFlotante } = await import("@/components/LlamadaEnVentanaFlotante");

/** Cuenta montajes: si sube de 1, la llamada se reconectó. */
const montajes = vi.fn();
function LlamadaDeMentira() {
  useEffect(() => { montajes(); }, []);
  return <video data-testid="video" autoPlay />;
}

/** Una ventana flotante de mentira, con su propio documento. */
function ventanaFalsa() {
  const doc = document.implementation.createHTMLDocument("pip");
  return { document: doc } as unknown as Window;
}

describe("mudar la llamada a la ventana flotante", () => {
  beforeEach(() => { montajes.mockClear(); abrir.mockClear(); cerrar.mockClear(); ponerVentana = null; });
  afterEach(cleanup);

  it("al salir a la ventana NO se remonta", async () => {
    render(<LlamadaEnVentanaFlotante activa><LlamadaDeMentira /></LlamadaEnVentanaFlotante>);
    expect(montajes).toHaveBeenCalledTimes(1);

    await act(async () => { ponerVentana?.(ventanaFalsa()); });

    // Si esto da 2, la llamada se reconectó al mudarse.
    expect(montajes).toHaveBeenCalledTimes(1);
  });

  it("y al volver tampoco", async () => {
    render(<LlamadaEnVentanaFlotante activa><LlamadaDeMentira /></LlamadaEnVentanaFlotante>);
    await act(async () => { ponerVentana?.(ventanaFalsa()); });
    await act(async () => { ponerVentana?.(null); });
    expect(montajes).toHaveBeenCalledTimes(1);
  });

  it("el contenido termina DENTRO del documento de la ventana", async () => {
    render(<LlamadaEnVentanaFlotante activa><LlamadaDeMentira /></LlamadaEnVentanaFlotante>);
    const w = ventanaFalsa();
    await act(async () => { ponerVentana?.(w); });
    // Si esto falla, la llamada se dibuja donde nadie la ve.
    expect(w.document.body.querySelector("video")).not.toBeNull();
  });

  it("al volver, el contenido vuelve al documento de la página", async () => {
    const { container } = render(
      <LlamadaEnVentanaFlotante activa><LlamadaDeMentira /></LlamadaEnVentanaFlotante>,
    );
    await act(async () => { ponerVentana?.(ventanaFalsa()); });
    await act(async () => { ponerVentana?.(null); });
    expect(container.querySelector("video")).not.toBeNull();
  });
});
