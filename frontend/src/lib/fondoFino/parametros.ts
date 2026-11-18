// Las cuentas del fondo fino, sin WebGL: lo que se puede probar con números.
// Los shaders de pipelineGL.ts repiten estas mismas fórmulas en GLSL; si cambias
// una aquí, cámbiala allá (y al revés).

/** El desenfoque corre a 1/4 de la resolución de la cámara. */
export const REDUCCION_DEL_DESENFOQUE = 4;
/** Alto de referencia de `blurRadius` (ver RADIO_DE_BLUR en fondoDeLlamada.ts). */
export const ALTO_DE_REFERENCIA = 720;
/** Tope de muestras por lado en cada pasada del gaussiano (el bucle del shader). */
export const MUESTRAS_MAX_POR_LADO = 64;

/** La máscara se suaviza en el tiempo a esta fracción del tamaño de la cámara. */
export const REDUCCION_DE_LA_MASCARA = 2;

/**
 * Sigma del gaussiano en píxeles de la textura reducida, a partir del número del
 * nivel (sigma en px de una imagen de 720 de alto) y el alto real de la cámara.
 */
export function sigmaEnTextura(sigma720: number, altoCamara: number): number {
  const alto = altoCamara > 0 ? altoCamara : ALTO_DE_REFERENCIA;
  return Math.max(0.5, (sigma720 * alto) / ALTO_DE_REFERENCIA / REDUCCION_DEL_DESENFOQUE);
}

/** Muestras por lado: 3 sigmas (más allá el peso es < 1 %), con tope. */
export function muestrasPorLado(sigma: number): number {
  return Math.min(MUESTRAS_MAX_POR_LADO, Math.max(1, Math.ceil(sigma * 3)));
}

/** Los pesos normalizados del gaussiano, del centro hacia afuera (el shader los calcula igual). */
export function pesosGaussianos(sigma: number): number[] {
  const n = muestrasPorLado(sigma);
  const crudos = Array.from({ length: n + 1 }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
  const total = crudos[0] + 2 * crudos.slice(1).reduce((a, b) => a + b, 0);
  return crudos.map((p) => p / total);
}

// ── Suavizado en el tiempo de la máscara (adiós al parpadeo) ─────────────────
//
// Cada píxel de la máscara nueva se mezcla con la anterior:
//   nueva = anterior + factor · (detectada − anterior)
// Con un factor fijo chico desaparece el parpadeo pero la silueta se arrastra
// cuando te mueves; con uno grande, al revés. Por eso el factor depende de
// CUÁNTO cambió ese píxel: un temblor chico (ruido del detector) casi no pasa,
// un cambio grande (te moviste) pasa casi entero en el mismo cuadro.

/** Factor con cambio chico y con cambio grande, cuando se segmenta en cada cuadro. */
export const SUAVIZADO_MIN = 0.35;
export const SUAVIZADO_MAX = 0.95;
/** Entre estos dos cambios (0..1) el factor pasa del mínimo al máximo. */
export const CAMBIO_CHICO = 0.08;
export const CAMBIO_GRANDE = 0.4;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Factor de mezcla de la máscara nueva. `cadaCuantos` es cada cuántos cuadros se
 * segmenta: si se segmenta uno sí y uno no, cada máscara nueva tiene que pesar
 * más (si no, la silueta tardaría el doble en alcanzarte).
 */
export function factorDeSuavizado(cambio: number, cadaCuantos = 1): number {
  const min = 1 - Math.pow(1 - SUAVIZADO_MIN, Math.max(1, cadaCuantos));
  return min + (SUAVIZADO_MAX - min) * smoothstep(CAMBIO_CHICO, CAMBIO_GRANDE, Math.abs(cambio));
}

/** Un paso del suavizado para un píxel (el shader hace exactamente esto). */
export function suavizarPixel(anterior: number, detectada: number, cadaCuantos = 1): number {
  return anterior + factorDeSuavizado(detectada - anterior, cadaCuantos) * (detectada - anterior);
}

// ── El borde ────────────────────────────────────────────────────────────────
//
// Tras el filtro guiado por color, la máscara se «aprieta» con una curva suave
// (y en el shader, además, la transición nunca pasa de ~3 píxeles de pantalla):
// por debajo de `desde` es fondo puro, por encima de `hasta` persona pura. Con
// la imagen virtual la curva es más cerrada: ahí un halo del cuarto real se nota
// mucho más que sobre el mismo cuarto borroso.
export const CURVA_BORDE_BLUR = { desde: 0.38, hasta: 0.62 } as const;
export const CURVA_BORDE_IMAGEN = { desde: 0.45, hasta: 0.68 } as const;

export function alfaDelBorde(valor: number, curva: { desde: number; hasta: number }): number {
  return smoothstep(curva.desde, curva.hasta, valor);
}

// ── Imagen de fondo: «cubrir» sin deformar ───────────────────────────────────

/**
 * Escala y corrimiento de coordenadas (uv · escala + corrimiento) para que la
 * imagen cubra el cuadro entero sin estirarse, centrada (como `object-fit:
 * cover`). Se hace en el shader: ni un canvas extra ni una copia de la imagen.
 */
export function uvParaCubrir(anchoImg: number, altoImg: number, anchoCuadro: number, altoCuadro: number) {
  if (!(anchoImg > 0 && altoImg > 0 && anchoCuadro > 0 && altoCuadro > 0)) {
    return { escalaX: 1, escalaY: 1, corrX: 0, corrY: 0 };
  }
  const aspImg = anchoImg / altoImg;
  const aspCuadro = anchoCuadro / altoCuadro;
  if (aspImg > aspCuadro) {
    // La imagen es más ancha: se recortan los costados.
    const escalaX = aspCuadro / aspImg;
    return { escalaX, escalaY: 1, corrX: (1 - escalaX) / 2, corrY: 0 };
  }
  const escalaY = aspImg / aspCuadro;
  return { escalaX: 1, escalaY, corrX: 0, corrY: (1 - escalaY) / 2 };
}
