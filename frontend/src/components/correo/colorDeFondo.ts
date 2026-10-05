import { Extension } from "@tiptap/core";

/**
 * Resaltar texto en el correo: el «Color de fondo» del menú de color de Gmail.
 *
 * Lo pidió Keila (02/10). Va como un atributo más de `textStyle`, igual que el
 * color de la letra y el tamaño, y NO con `@tiptap/extension-highlight`, a
 * propósito: esa extensión escribe la etiqueta MARK, que no sobrevive el viaje.
 *  · El saneador de Maven (`_shared/html-sanitize.ts`) no la tiene en su lista
 *    blanca: en Enviados el resaltado desaparecía.
 *  · Outlook de escritorio (motor de Word) y varios webmail tampoco la pintan.
 * Un SPAN con `background-color` en su estilo en línea lo entienden todos, y es
 * lo mismo que genera Gmail.
 *
 * (Sin etiquetas escritas con sus signos en este comentario: la guarda de
 * textos en español lee lo que hay entre un cierre y una apertura como si
 * fuera texto de pantalla.)
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    colorDeFondo: {
      setBackgroundColor: (color: string) => ReturnType;
      unsetBackgroundColor: () => ReturnType;
    };
  }
}

/** La paleta corta del resaltado, con tonos de la de Gmail. Son fondos CLAROS
 *  a propósito: el texto del correo es oscuro (y se lee sobre blanco), así que
 *  un fondo fuerte lo dejaría ilegible. Arriba los suaves; abajo los marcados,
 *  con el amarillo de resaltador de toda la vida. */
export const FONDOS: string[][] = [
  ["#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#ea9999", "#f9cb9c", "#ffff00", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#b4a7d6", "#d5a6bd"],
];

/** Valores que en la práctica significan «sin fondo». Google Docs, por ejemplo,
 *  pega `background-color: transparent` en CADA tramo de texto: guardarlo como
 *  resaltado llenaría el correo de estilos que no hacen nada. */
const SIN_FONDO = /^(transparent|initial|inherit|unset|none|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

/** El fondo de un elemento, o null si no tiene (o si es «transparente»). Se lee
 *  de `style.backgroundColor` y no del texto del atributo para entender también
 *  el atajo `background: #ff0` que traen algunas páginas al pegar. */
export function fondoDe(el: HTMLElement): string | null {
  const valor = el.style.backgroundColor?.replace(/['"]+/g, "").trim();
  return valor && !SIN_FONDO.test(valor) ? valor : null;
}

export const ColorDeFondo = Extension.create({
  name: "colorDeFondo",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (el) => fondoDe(el as HTMLElement),
            renderHTML: (attrs) =>
              attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setBackgroundColor:
        (color) =>
        ({ chain }) =>
          chain().setMark("textStyle", { backgroundColor: color }).run(),
      unsetBackgroundColor:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { backgroundColor: null }).removeEmptyTextStyle().run(),
    };
  },
});
