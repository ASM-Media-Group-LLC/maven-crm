import { describe, it, expect } from "vitest";
import { copyStyles } from "@/pages/cowork/usePipWindow";

// La ventana flotante del sistema nace EN BLANCO: su <html> y su <body> tienen
// alto AUTO. Adentro se portaliza una caja con `height: 100%`, y un 100% contra
// un padre sin alto definido resuelve a CERO.
//
// El resultado se ve así: aparecen el encabezado y los controles —que tienen
// alto propio— y el video colapsado, con la ventana medio vacía. Sin un solo
// error en consola. Jhon lo reportó con una captura el 29/08.
//
// Este test existe para que nadie "limpie" esas tres líneas por parecer de más.

/** Una ventana de mentira con lo mínimo que toca copyStyles. */
function ventanaFalsa(): Window {
  const doc = document.implementation.createHTMLDocument("pip");
  return { document: doc } as unknown as Window;
}

describe("estilos de la ventana flotante", () => {
  it("le da alto al documento, o el contenido colapsa a cero", () => {
    const w = ventanaFalsa();
    copyStyles(w);
    expect(w.document.documentElement.style.height).toBe("100%");
    expect(w.document.body.style.height).toBe("100%");
  });

  it("saca el margen del body: si no, la ventana muestra un borde blanco", () => {
    const w = ventanaFalsa();
    copyStyles(w);
    expect(w.document.body.style.margin).toBe("0px");
  });

  it("copia el tema, para que no salga en claro sobre una app oscura", () => {
    document.documentElement.className = "dark";
    const w = ventanaFalsa();
    copyStyles(w);
    expect(w.document.documentElement.className).toContain("dark");
  });
});
