import { describe, expect, it } from "vitest";
import {
  aaLightnessForHue,
  contrastOnWhite,
  contrastRatio,
  relativeLuminance,
  hslToRgb,
  CUSTOM_SKIN_SATURATION,
} from "@/lib/wcag";

// Skin "Personalizado" (Settings → Apariencia): la bisección AA debe devolver,
// para CUALQUIER hue, una luminosidad que deje el texto blanco legible sobre
// el primary generado — mismo criterio que los presets fijos de index.css.

describe("wcag — relative luminance y contraste", () => {
  it("blanco = luminancia 1, negro = 0", () => {
    expect(relativeLuminance(hslToRgb(0, 0, 100))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hslToRgb(0, 0, 0))).toBeCloseTo(0, 5);
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 2);
  });

  it("reproduce el azul maven (211 100% 50% ≈ 3.97:1) — el motivo del ajuste de L en unlok", () => {
    expect(contrastOnWhite(211, 100, 50)).toBeCloseTo(3.97, 2);
  });

  it("valida los primary de los skins de línea contra blanco (≥ 4.5:1)", () => {
    // Deben quedar sincronizados con los bloques [data-skin] de index.css.
    expect(contrastOnWhite(150, 56, 33)).toBeGreaterThanOrEqual(4.5); // unlimited
    expect(contrastOnWhite(211, 100, 45)).toBeGreaterThanOrEqual(4.5); // unlok
  });
});

describe("aaLightnessForHue — bisección AA del skin Personalizado", () => {
  const hues = [0, 43, 120, 200, 300];

  it.each(hues)("hue %i: L ≤ 55 y contraste ≥ 4.5:1 sobre blanco a S=85%%", (hue) => {
    const l = aaLightnessForHue(hue);
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThanOrEqual(55);
    expect(contrastOnWhite(hue, CUSTOM_SKIN_SATURATION, l)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(hues)("hue %i: la L devuelta es la MÁXIMA (subir 1 punto ya baja de 4.6:1 o pasa el tope)", (hue) => {
    const l = aaLightnessForHue(hue);
    if (l < 55) {
      expect(contrastOnWhite(hue, CUSTOM_SKIN_SATURATION, l + 1)).toBeLessThan(4.6);
    }
  });

  it("el accent (hue+30°) también sale AA con su propia bisección", () => {
    for (const hue of hues) {
      const accentHue = (hue + 30) % 360;
      const l = aaLightnessForHue(accentHue);
      expect(contrastOnWhite(accentHue, CUSTOM_SKIN_SATURATION, l)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
