import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, act } from "@testing-library/react";

// La llamada tiene que SOBREVIVIR a cambiar de página: mientras la página ofrece
// un hueco se dibuja ahí, y cuando esa página se desmonta pasa a la ventanita
// flotante en vez de morirse.
//
// EL BUG QUE ESTO CUIDA: la baja del hueco se decidía con
// `document.contains(nodo)`, pero React llama a la ref con null ANTES de sacar
// el nodo del DOM (ver refDetachOrden.test.tsx). O sea que la respuesta era
// siempre "sigue vivo": el provider se quedaba apuntando a un div huérfano y
// portaleaba la llamada adentro. No había ventanita, no había video, no había
// audio — y encima no se notaba, porque nada tiraba error.

vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({
  default: ({ callDisplayName }: { callDisplayName?: string }) => (
    <div data-testid="llamada">{callDisplayName}</div>
  ),
}));

vi.mock("@/pages/cowork/usePipWindow", () => ({
  usePipWindow: () => ({ pipWindow: null, openPip: async () => false, closePip: () => {} }),
  docPipSupported: () => false,
}));

vi.mock("@/hooks/useCoworkRequestAlerts", () => ({ useCoworkRequestAlerts: () => {} }));

const { PersistentCallProvider, CallOutlet, usePersistentCall } = await import(
  "@/components/PersistentCallProvider"
);

/** Página que ofrece hueco y arranca la llamada al montarse. */
function PaginaConHueco({ nombre }: { nombre: string }) {
  const { startCall } = usePersistentCall();
  useEffect(() => {
    startCall({ key: `sala-${nombre}`, roomName: nombre, callDisplayName: nombre } as never);
  }, [nombre, startCall]);
  return <div data-testid={`hueco-${nombre}`}><CallOutlet /></div>;
}

/** Otra sección de Maven, sin hueco. */
function PaginaSinHueco() {
  return <div data-testid="otra-seccion" />;
}

function App({ ruta }: { ruta: string }) {
  return (
    <PersistentCallProvider>
      {ruta === "cowork" ? <PaginaConHueco nombre="Hub" /> : null}
      {ruta === "otra" ? <PaginaSinHueco /> : null}
      {ruta === "cowork2" ? <PaginaConHueco nombre="Otra sala" /> : null}
    </PersistentCallProvider>
  );
}

const esperarFlotante = async () => {
  // El provider espera un frame antes de decidir que no hay hueco, para no
  // dibujar en la ventanita algo que enseguida se muda.
  await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
};

describe("la llamada persistente al navegar", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it("se dibuja en el hueco de la página mientras esa página está", async () => {
    render(<App ruta="cowork" />);
    await act(async () => {});
    const hueco = screen.getByTestId("hueco-Hub");
    expect(hueco).toContainElement(screen.getByTestId("llamada"));
  });

  it("al irse a otra sección pasa a la ventanita, SIN cortarse", async () => {
    const { rerender } = render(<App ruta="cowork" />);
    await act(async () => {});
    const llamadaAntes = screen.getByTestId("llamada");

    rerender(<App ruta="otra" />);
    await esperarFlotante();

    // Sigue existiendo (no se cortó) y está DENTRO del documento — que es
    // justo lo que fallaba: quedaba viva pero colgando de un div huérfano.
    const llamadaDespues = screen.getByTestId("llamada");
    expect(document.contains(llamadaDespues)).toBe(true);
    expect(llamadaDespues).toBe(llamadaAntes); // el mismo nodo: se movió, no se remontó
    // Y aparece la ventanita, con su barra de título.
    expect(screen.getByLabelText("Colgar")).toBeInTheDocument();
  });

  it("al volver a una página con hueco se mete de nuevo adentro", async () => {
    const { rerender } = render(<App ruta="cowork" />);
    await act(async () => {});
    rerender(<App ruta="otra" />);
    await esperarFlotante();
    expect(screen.getByLabelText("Colgar")).toBeInTheDocument();

    rerender(<App ruta="cowork" />);
    await act(async () => {});
    expect(screen.getByTestId("hueco-Hub")).toContainElement(screen.getByTestId("llamada"));
    expect(screen.queryByLabelText("Colgar")).toBeNull(); // ya no hace falta la ventanita
  });

  it("de una página con hueco a OTRA con hueco, no se cae a la ventanita", async () => {
    const { rerender } = render(<App ruta="cowork" />);
    await act(async () => {});
    rerender(<App ruta="cowork2" />);
    await esperarFlotante();
    expect(screen.getByTestId("hueco-Otra sala")).toContainElement(screen.getByTestId("llamada"));
    expect(screen.queryByLabelText("Colgar")).toBeNull();
  });
});
