// Las cuentas del fondo fino, sin WebGL: lo que se puede probar con números.
// Los shaders de pipelineGL.ts repiten estas mismas fórmulas en GLSL; si cambias
// una aquí, cámbiala allá (y al revés).

/** El desenfoque corre a 1/4 de la resolución de la cámara. */
export const REDUCCION_DEL_DESENFOQUE = 4;
/** Alto de referencia de `blurRadius` (ver RADIO_DE_BLUR en fondoDeLlamada.ts). */
export const ALTO_DE_REFERENCIA = 720;
/** Tope de muestras por lado en cada pasada del gaussiano (el bucle del shader). */
export const MUESTRAS_MAX_POR_LADO = 48;

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

/**
 * Cada cuántos texeles se toma una muestra. Con sigmas grandes (el nivel
 * fuerte) se saltea de a 2 o 3: la textura ya está reducida a 1/4 y promediada,
 * así que no aparecen rayas, y el costo queda topado en MUESTRAS_MAX_POR_LADO.
 */
export function pasoDeMuestreo(sigma: number): number {
  return Math.max(1, Math.ceil((sigma * 3) / MUESTRAS_MAX_POR_LADO));
}

/** Muestras por lado: 3 sigmas (más allá el peso es < 1 %), con tope. */
export function muestrasPorLado(sigma: number): number {
  return Math.min(MUESTRAS_MAX_POR_LADO, Math.max(1, Math.ceil((sigma * 3) / pasoDeMuestreo(sigma))));
}

/** Los pesos normalizados del gaussiano, del centro hacia afuera (el shader los calcula igual). */
export function pesosGaussianos(sigma: number): number[] {
  const n = muestrasPorLado(sigma);
  const paso = pasoDeMuestreo(sigma);
  const crudos = Array.from({ length: n + 1 }, (_, i) => Math.exp(-((i * paso) ** 2) / (2 * sigma * sigma)));
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

// ── El borde por color (pelo esponjado, mechones, huecos entre el pelo) ──────
//
// La máscara del detector es de 256×256: aunque el filtro guiado la pegue a los
// bordes, no ve los huecos del pelo esponjado ni los mechones sueltos. En esos
// píxeles quedaba un pedazo de la pared vieja (el «halo gris» del pelo) encima
// del fondo nuevo. Lo que hace Meet: en la franja del borde, mirar el COLOR.
//
// Alrededor de cada píxel del borde se estima el color de la persona (F, el
// promedio de lo que es persona segura cerca) y el del fondo viejo (B, el
// promedio de lo que es fondo seguro cerca). Un píxel del borde es una mezcla
// I = a·F + (1 − a)·B; despejando, la «a» que mejor explica su color es la
// proyección de I − B sobre F − B. Así los huecos del pelo (color de pared)
// pasan a fondo y los mechones (color de pelo) quedan, aunque el detector no
// los haya visto.
//
// Dónde NO se usa (para no repetir lo del multiclase, que se comía la cabeza
// con poca luz):
//   · fuera de la franja del borde (adentro de la persona manda el detector);
//   · cuando F y B se parecen (pelo oscuro contra pared oscura, poca luz): ahí
//     el color no sabe nada y se queda la máscara.

/** Sigma (px a 720p) de los promedios locales de color de persona y fondo. */
export const SIGMA_DEL_MATE_720 = 10;
/** Distancia de color F↔B (0..1 por canal, al cuadrado) desde/hasta la que se confía en el color. */
export const CONFIANZA_COLOR = { desde: 0.012, hasta: 0.045 } as const;
/** Fracción de persona y de fondo alrededor que define la franja del borde. */
export const FRANJA = { desde: 0.06, hasta: 0.22 } as const;
/** Cuánto manda el color dentro de la franja, con confianza plena (el resto, la máscara). */
export const FUERZA_DEL_MATE = 0.85;

type RGB = readonly [number, number, number];
const resta = (a: RGB, b: RGB): RGB => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const punto = (a: RGB, b: RGB) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** La «a» que explica el color I como mezcla de F (persona) y B (fondo), 0..1. */
export function alfaPorColor(i: RGB, f: RGB, b: RGB): number {
  const d = resta(f, b);
  const dd = punto(d, d);
  if (dd < 1e-4) return 0.5;
  return Math.min(1, Math.max(0, punto(resta(i, b), d) / dd));
}

/** Cuánto se puede creer en el color: 0 si F y B se parecen (poca luz), 1 si contrastan. */
export function confianzaDelColor(f: RGB, b: RGB): number {
  const d = resta(f, b);
  return smoothstep(CONFIANZA_COLOR.desde, CONFIANZA_COLOR.hasta, punto(d, d));
}

/**
 * Peso de la franja del borde a partir de la fracción de persona y de fondo
 * que hay alrededor (los pesos de los promedios locales). Adentro de la
 * persona (casi nada de fondo cerca) o lejos de ella vale 0.
 */
export function pesoDeFranja(fraccionPersona: number, fraccionFondo: number): number {
  return smoothstep(FRANJA.desde, FRANJA.hasta, fraccionPersona) * smoothstep(FRANJA.desde, FRANJA.hasta, fraccionFondo);
}

/** La «a» final del borde: la de la máscara, corregida por el color donde se puede. */
/**
 * Cuánto puede SUBIR la «a» el color por encima de la máscara. Bajar, todo lo
 * que haga falta (los huecos del pelo con la pared vieja); subir, poco y solo
 * donde la máscara ya ve algo de persona: si no, una sombra o una cortina
 * oscura junto al pelo se volvían una mancha pegada a la cabeza.
 */
export const SUBIDA_MAX_DEL_COLOR = 0.15;

/**
 * La «a» final del borde: la de la máscara (`alfaMascara`, ya con la curva),
 * corregida por el color donde se puede. `mascara` es la confianza refinada.
 */
export function alfaFinal(alfaMascara: number, mascara: number, i: RGB, f: RGB, b: RGB, franja: number): number {
  const w = franja * confianzaDelColor(f, b) * FUERZA_DEL_MATE;
  const tope = alfaMascara + SUBIDA_MAX_DEL_COLOR * smoothstep(0.02, 0.2, mascara);
  return alfaMascara + w * (Math.min(alfaPorColor(i, f, b), tope) - alfaMascara);
}

/** Por debajo de esta «a» no se divide (amplificaría el ruido de la cámara). */
export const PISO_DEL_DESPEJE = 0.2;

const mezclar = (x: RGB, y: RGB, t: number): RGB => [x[0] + t * (y[0] - x[0]), x[1] + t * (y[1] - x[1]), x[2] + t * (y[2] - x[2])];

/**
 * Color de la PERSONA en un píxel del borde, sin el fondo viejo que se cuela:
 * de I = a·F + (1 − a)·B se despeja F = (I − (1 − a)·B) / a. Con «a» chica la
 * división no es confiable y se usa el promedio local de la persona. Fuera de
 * la franja (franja = 0) es la cámara tal cual. El píxel final es
 * mezclar(fondoNuevo, colorDePersona, a).
 */
export function colorDePersona(i: RGB, f: RGB, b: RGB, a: number, franja: number): RGB {
  const be = mezclar(i, b, franja);
  const div = Math.max(a, PISO_DEL_DESPEJE);
  const despejada = [0, 1, 2].map((c) => Math.min(1, Math.max(0, (i[c] - (1 - a) * be[c]) / div))) as unknown as RGB;
  return mezclar(mezclar(i, f, franja), despejada, smoothstep(0.1, 0.4, a));
}

// ── Los dos detectores juntos ────────────────────────────────────────────────
//
// El multiclase (16 MB) ve mejor el pelo y la ropa con buena luz, pero con poca
// luz o de perfil BORRA pedazos de persona. Juntos, el liviano decide y el
// multiclase solo puede SUMAR persona, y solo cerca del contorno que ve el
// liviano: persona = max(liviano, multiclase · cerca). Si el multiclase se
// equivoca para menos, no pasa nada; si se equivoca para más, a lo sumo
// engorda el borde unos píxeles.

/** Radio (en texeles de la máscara de 256) de «cerca del contorno del liviano». */
export const RADIO_CERCA_TEXELES = 6;

export function personaFusionada(liviano: number, multiclase: number, cerca: number): number {
  return Math.max(liviano, multiclase * Math.min(1, Math.max(0, cerca)));
}

/** Cerca del contorno: lo más alto del liviano alrededor, pasado por una rampa. */
export function cercaDelContorno(maximoLivianoAlrededor: number): number {
  return smoothstep(0.25, 0.6, maximoLivianoAlrededor);
}

/**
 * El multiclase corre uno de cada tantos cuadros (cuesta ~3 veces el liviano).
 * Entre medio se reusa su última máscara: como solo suma cerca del contorno
 * del liviano, que sí corre en todos, el atraso no deja fantasmas lejos.
 */
export const CADA_CUANTOS_MULTICLASE = 3;

/** ¿En este cuadro toca el multiclase? (corrido en uno para no caer en el primero). */
export function tocaMulticlase(cuadro: number, cada = CADA_CUANTOS_MULTICLASE): boolean {
  const n = Math.max(1, Math.floor(cada));
  return cuadro % n === (n > 1 ? 1 : 0);
}

/** El multiclase de ayuda queda apagado por defecto (ver MODELOS en procesador.ts). */
export const FUSION_POR_DEFECTO = false;
