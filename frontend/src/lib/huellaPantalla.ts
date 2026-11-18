// HUELLA DE UN PANTALLAZO: ¿CAMBIÓ LA PANTALLA? (Alvaro, 17/11/2026: Argos a USD 15).
//
// Antes de pagarle a la IA por mirar un pantallazo, el equipo de la persona se
// pregunta gratis si se ve igual que el anterior. La «huella» es un dHash: la
// foto se achica a 17×16 en grises y cada bit dice si un punto es más claro
// que el de su derecha. Son 256 bits (64 letras hex). Dos pantallazos casi
// iguales tienen huellas con pocos bits distintos; abrir otra cosa cambia casi
// la mitad. No entiende qué hay en la foto: solo compara luces.
//
// Semana de prueba: la huella solo se guarda (monitor_capturas.huella) y el
// informe argos_informe_sombra cuenta qué se habría ahorrado. Nada decide aún.

export const HUELLA_ANCHO = 17;
export const HUELLA_ALTO = 16;

/** Huella de una imagen ya reducida a 17×16 en grises (fila por fila). */
export function huellaDeGrises(grises: ArrayLike<number>): string {
  let hex = "";
  let nibble = 0;
  let n = 0;
  for (let y = 0; y < HUELLA_ALTO; y++) {
    for (let x = 0; x < HUELLA_ANCHO - 1; x++) {
      const i = y * HUELLA_ANCHO + x;
      nibble = (nibble << 1) | (grises[i] > grises[i + 1] ? 1 : 0);
      if (++n === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        n = 0;
      }
    }
  }
  return hex;
}

/** RGBA (de un canvas 17×16) → grises. */
export function grisesDeRGBA(rgba: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) out.push(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  return out;
}

/** Cuántos bits cambian entre dos huellas (0 = idénticas, 256 = opuestas). */
export function distanciaHuellas(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/** Huella de lo que hay dibujado en un canvas (o null si el navegador no deja). */
export function huellaDeCanvas(origen: CanvasImageSource): string | null {
  try {
    const c = document.createElement("canvas");
    c.width = HUELLA_ANCHO;
    c.height = HUELLA_ALTO;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(origen, 0, 0, HUELLA_ANCHO, HUELLA_ALTO);
    return huellaDeGrises(grisesDeRGBA(ctx.getImageData(0, 0, HUELLA_ANCHO, HUELLA_ALTO).data));
  } catch {
    return null;
  }
}
