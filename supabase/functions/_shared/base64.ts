// Tamaños de contenido codificado.
//
// Vive SOLO acá y sin un solo import a propósito: `mime.ts` arrastra
// `imap.ts`, que usa `Deno.*`, y con eso el typecheck del frontend —que
// también compila los tests— se llena de errores de un archivo que nadie tocó.

/** Cuántos bytes ocupa de verdad un adjunto que viaja en base64.
 *
 *  ⚠️ El sync guarda el tamaño YA DECODIFICADO (`a.size` de mailparser), y la
 *  búsqueda de la parte lo usa para desempatar cuando dos adjuntos comparten
 *  nombre. Guardar la longitud del base64 —un 33 % más— haría que el desempate
 *  eligiera el archivo equivocado: la persona pide una hoja de vida y baja
 *  otra. */
export function tamanoDeBase64(b64: string): number {
  const limpio = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const relleno = limpio.match(/=+$/)?.[0].length ?? 0;
  return Math.max(0, Math.floor(limpio.length * 3 / 4) - relleno);
}
