import { describe, it, expect } from "vitest";

// EL VISOR DE IMAGEN SALE POR PORTAL.
//
// Jhon (14/09): al agrandar una imagen desde la ventana flotante, el visor
// quedaba preso en la columna de la ventanita y la página se dibujaba ENCIMA.
// La ventana es un .glass-panel con backdrop-filter, que en Chrome crea bloque
// contenedor para los descendientes `fixed`: el inset-0 pasa a ser la caja de
// la ventana, y el z-[100] no vale nada dentro de ese contexto. Con portal a
// document.body el visor escapa de cualquier ancestro. Esta guarda evita que
// alguien lo vuelva inline "porque en la página grande funciona igual".
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/messenger/components/ImageLightbox.tsx", { query: "?raw", import: "default", eager: true });

describe("ImageLightbox", () => {
  const c = Object.values(fuentes)[0] ?? "";
  it("existe", () => expect(c).toBeTruthy());
  it("renderiza por createPortal a document.body", () => {
    expect(c).toMatch(/import \{ createPortal \} from "react-dom"/);
    expect(c).toMatch(/return createPortal\(/);
    expect(c).toMatch(/document\.body,?\s*\)/);
  });
  it("sigue tapando toda la pantalla y por encima del muelle (z-50)", () => {
    expect(c).toMatch(/fixed inset-0 z-\[100\]/);
  });
});
