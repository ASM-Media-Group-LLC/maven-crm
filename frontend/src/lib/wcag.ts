// Utilidades de contraste WCAG 2.x para los tokens HSL del design system.
// Se usan en el skin "Personalizado" (Settings → Apariencia): dado un HUE
// libre elegido por el usuario, acá se calcula la LUMINOSIDAD máxima que
// mantiene el texto blanco legible (AA) sobre ese color como primary.
//
// Referencia: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
// Mismo criterio que los presets fijos de index.css (bloques [data-skin]),
// donde la L de cada primary se bajó a mano hasta cumplir ≥ 4.5:1.

/** HSL (h 0-360, s/l 0-100) → RGB lineal 0-1. */
export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

/** Luminancia relativa WCAG de un color RGB (canales 0-1). */
export const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** Ratio de contraste WCAG (1:1 … 21:1) entre dos luminancias relativas. */
export const contrastRatio = (l1: number, l2: number): number => {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

/** Contraste de un color HSL contra BLANCO (el foreground de primary/accent). */
export const contrastOnWhite = (h: number, s: number, l: number): number =>
  contrastRatio(1, relativeLuminance(hslToRgb(h, s, l)));

export const CUSTOM_SKIN_SATURATION = 85;
const AA_TARGET = 4.6; // margen sobre el 4.5 mínimo AA (redondeos de render)
const MAX_LIGHTNESS = 55;

/**
 * Luminosidad (%) para usar un hue libre como primary con S=85%: la L MÁXIMA
 * ≤ 55 cuyo contraste contra blanco es ≥ 4.6:1 (AA con margen). Para S y hue
 * fijos la luminancia crece monótonamente con L, así que el contraste contra
 * blanco DECRECE con L → bisección válida: subir L "aclara", bajar L "oscurece".
 * Hues muy luminosos (amarillos/verdes) devuelven L bajas (~29-32); azules y
 * rojos permiten L más altas (~46-49). Redondeada a 2 decimales para que el
 * valor inline en el CSS quede estable.
 */
export const aaLightnessForHue = (
  hue: number,
  saturation: number = CUSTOM_SKIN_SATURATION,
): number => {
  let lo = 0;
  let hi = MAX_LIGHTNESS;
  // 24 iteraciones ⇒ precisión de 55/2^24 ≈ 3e-6 puntos de L, de sobra.
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastOnWhite(hue, saturation, mid) >= AA_TARGET) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 100) / 100;
};
