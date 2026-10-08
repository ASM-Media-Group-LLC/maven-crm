import Image from "@tiptap/extension-image";
import { anchoDeAtributo } from "@/lib/correo/imagenesDelCorreo";

// La imagen del editor del correo con su ANCHO (lib/correo/imagenesDelCorreo.ts).
// El ancho se guarda como atributo `width` —lo que respeta Outlook de
// escritorio— y como estilo, con max-width:100% y height:auto para que en un
// teléfono no se salga ni se deforme. Sin ancho (Original), solo el tope.
export const ImagenConTamano = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => anchoDeAtributo(el.getAttribute("width")),
        renderHTML: (attrs: { width?: number | null }) =>
          attrs.width
            ? { width: String(attrs.width), style: `width:${attrs.width}px;max-width:100%;height:auto` }
            : { style: "max-width:100%;height:auto" },
      },
    };
  },
});
