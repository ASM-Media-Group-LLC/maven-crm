// Los colores de las etiquetas, los mismos de Gmail.
//
// Gmail guarda DOS colores por etiqueta —fondo y texto— y los dos salen de una
// lista cerrada: la API rechaza cualquier hex que no esté en ella. No hay
// cuentagotas ni campo para escribir un color. Acá igual: la base solo
// valida el formato, y la UI solo ofrece lo de abajo.

export interface ParDeColores {
  fondo: string;
  texto: string;
}

/** La paleta rápida del submenú «Color de etiqueta» (cinco renglones, como
 *  Gmail): claras con texto oscuro, oscuras con texto claro, y las vivas con
 *  texto blanco. Todos los hex son de la lista que acepta Gmail. */
export const PALETA_RAPIDA: ParDeColores[][] = [
  [
    { fondo: "#e7e7e7", texto: "#464646" },
    { fondo: "#b6cff5", texto: "#0d3472" },
    { fondo: "#98d7e4", texto: "#0d3b44" },
    { fondo: "#e3d7ff", texto: "#3d188e" },
    { fondo: "#fbd3e0", texto: "#711a36" },
    { fondo: "#f2b2a8", texto: "#8a1c0a" },
  ],
  [
    { fondo: "#666666", texto: "#ffffff" },
    { fondo: "#285bac", texto: "#ffffff" },
    { fondo: "#0d3b44", texto: "#98d7e4" },
    { fondo: "#653e9b", texto: "#ffffff" },
    { fondo: "#b65775", texto: "#ffffff" },
    { fondo: "#cc3a21", texto: "#ffffff" },
  ],
  [
    { fondo: "#ffc8af", texto: "#7a2e0b" },
    { fondo: "#ffdeb5", texto: "#7a4706" },
    { fondo: "#fbe983", texto: "#594c05" },
    { fondo: "#fdedc1", texto: "#684e07" },
    { fondo: "#b3efd3", texto: "#0b4f30" },
    { fondo: "#a2dcc1", texto: "#04502e" },
  ],
  [
    { fondo: "#ff7537", texto: "#ffffff" },
    { fondo: "#cca6ac", texto: "#094228" },
    { fondo: "#ebdbde", texto: "#662e37" },
    { fondo: "#994a64", texto: "#ffffff" },
    { fondo: "#42d692", texto: "#094228" },
    { fondo: "#16a765", texto: "#ffffff" },
  ],
  [
    { fondo: "#2da2bb", texto: "#ffffff" },
    { fondo: "#4986e7", texto: "#ffffff" },
    { fondo: "#ffad46", texto: "#ffffff" },
  ],
];

/** Las grillas del diálogo «Agregar color personalizado» (la misma para fondo
 *  y para texto): un renglón de grises, uno de vivos y seis de tonos, del más
 *  claro al más oscuro. Son los primeros 64 colores de la lista de Gmail, en
 *  su orden. */
export const GRILLA_PERSONALIZADA: string[][] = [
  ["#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff"],
  ["#fb4c2f", "#ffad47", "#fad165", "#16a766", "#43d692", "#4a86e8", "#a479e2", "#f691b3"],
  ["#f6c5be", "#ffe6c7", "#fef1d1", "#b9e4d0", "#c6f3de", "#c9daf8", "#e4d7f5", "#fcdee8"],
  ["#efa093", "#ffd6a2", "#fce8b3", "#89d3b2", "#a0eac9", "#a4c2f4", "#d0bcf1", "#fbc8d9"],
  ["#e66550", "#ffbc6b", "#fcda83", "#44b984", "#68dfa9", "#6d9eeb", "#b694e8", "#f7a7c0"],
  ["#cc3a21", "#eaa041", "#f2c960", "#149e60", "#3dc789", "#3c78d8", "#8e63ce", "#e07798"],
  ["#ac2b16", "#cf8933", "#d5ae49", "#0b804b", "#2a9c68", "#285bac", "#653e9b", "#b65775"],
  ["#822111", "#a46a21", "#aa8831", "#076239", "#1a764d", "#1c4587", "#41236d", "#83334c"],
];

/** Lo que Gmail propone al abrir el diálogo cuando la etiqueta no tiene color. */
export const PAR_POR_DEFECTO: ParDeColores = { fondo: "#999999", texto: "#ffffff" };

/** «RGB (255, 188, 107)», el globito que muestra Gmail al pasar el mouse. */
export function rgbDe(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `RGB (${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export const mismoPar = (a: ParDeColores | null, b: ParDeColores | null) =>
  !!a && !!b && a.fondo === b.fondo && a.texto === b.texto;
