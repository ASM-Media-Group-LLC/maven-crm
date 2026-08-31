// Qué texto lleva un mensaje que manda un archivo.
//
// ── EL CONTRATO, QUE ESTABA ROTO ────────────────────────────────────────────
//
// La burbuja YA muestra el nombre del archivo por su cuenta, desde `file_name`:
// en la tarjeta de archivo y en el `alt` de la imagen. Y tiene una guarda para
// no repetirlo debajo (`content !== file_name`).
//
// Pero el que enviaba pegaba el nombre AL TEXTO: `"Prueba\n📎 Captura de
// pantalla 2026-08-30 a la(s) 7.25.27 a.m..png"`. Con eso la guarda ya no podía
// hacer nada —el contenido dejaba de ser igual al nombre— y salían dos
// problemas de una:
//
//   1. Se leía el nombre crudo del archivo debajo de una imagen que ya se ve.
//   2. La burbuja se encoge a su contenido, así que un nombre de sesenta
//      caracteres la estiraba hasta el 70% del ancho. Al lado de una captura
//      vertical —que queda angosta— eso dejaba un vacío enorme.
//
// O sea: el segundo problema, que parecía de diseño, era el mismo bug.

/**
 * El contenido de un mensaje con archivo adjunto.
 *
 * - Con texto: SOLO el texto. El nombre lo pone la burbuja.
 * - Sin texto: el nombre, para que la búsqueda y las vistas previas de la lista
 *   de chats tengan algo que mostrar. La burbuja lo oculta sola, porque ahí sí
 *   vuelve a cumplirse `content === file_name`.
 *
 * ⚠️ Nunca los dos juntos: eso es exactamente lo que rompía la guarda.
 */
export function contenidoDeAdjunto(
  texto: string | null | undefined,
  nombreArchivo: string,
): string {
  const limpio = (texto ?? "").trim();
  return limpio || nombreArchivo;
}

/**
 * ¿La burbuja tiene que dibujar el texto debajo del adjunto?
 *
 * No, cuando el texto ES el nombre del archivo: ahí sería repetirlo, porque el
 * nombre ya se muestra solo.
 */
export function muestraTextoDebajo(
  contenido: string | null | undefined,
  nombreArchivo: string | null | undefined,
): boolean {
  return !!contenido && contenido !== nombreArchivo;
}
