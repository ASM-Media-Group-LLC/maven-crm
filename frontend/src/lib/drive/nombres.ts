// Cambiar el nombre de un archivo sin perder su extensión, como Google con un
// archivo de Office («Balance.xlsx»: se edita «Balance» y el «.xlsx» queda).

/** Dónde termina el nombre sin la extensión («Balance» de «Balance.xlsx»). Un
 *  nombre sin punto o que empieza con punto («.env»): entero. */
export function finDelNombreSinExtension(nombre: string): number {
  const punto = nombre.lastIndexOf(".");
  return punto > 0 ? punto : nombre.length;
}

/** El nombre nuevo con la extensión del original: se escribe «Balance 2026» y
 *  queda «Balance 2026.xlsx». Si quien escribe ya la puso, no se repite. */
export function conLaExtension(texto: string, original: string): string {
  const ext = original.slice(finDelNombreSinExtension(original)); // «.xlsx» o «»
  if (!ext || texto.toLowerCase().endsWith(ext.toLowerCase())) return texto;
  return `${texto}${ext}`;
}
