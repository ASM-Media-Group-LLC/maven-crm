import { describe, it, expect, afterEach, vi } from "vitest";
import { puedeCompartirPantalla, motivoDeFalloAlCompartir } from "@/lib/compartirPantalla";

// Compartir pantalla no existe en los teléfonos, y hasta ahora el botón estaba
// igual y el error se tragaba en un console.error: quien lo tocaba desde el
// celular no veía absolutamente nada pasar. Se reportó como "el botón no
// funciona", que es exactamente lo que parecía.

const conGetDisplayMedia = (existe: boolean) => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: existe ? { getDisplayMedia: () => {} } : {},
  });
};

afterEach(() => { vi.restoreAllMocks(); conGetDisplayMedia(true); });

describe("saber si se puede compartir pantalla", () => {
  it("en una computadora, sí", () => {
    conGetDisplayMedia(true);
    expect(puedeCompartirPantalla()).toBe(true);
  });

  it("en un teléfono, no", () => {
    conGetDisplayMedia(false);
    expect(puedeCompartirPantalla()).toBe(false);
  });
});

describe("qué se le dice a la persona", () => {
  it("en un teléfono, el motivo real y qué hacer en su lugar", () => {
    conGetDisplayMedia(false);
    const m = motivoDeFalloAlCompartir(new Error("lo que sea"));
    expect(m).toContain("teléfonos");
    expect(m).toContain("computadora");
  });

  // Cerrar el diálogo del navegador es una decisión, no un error. Avisarla
  // sería regañar a alguien por cambiar de opinión.
  it("si canceló el diálogo, NO se le dice nada", () => {
    conGetDisplayMedia(true);
    const cancelo = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(motivoDeFalloAlCompartir(cancelo)).toBeNull();
    const aborto = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(motivoDeFalloAlCompartir(aborto)).toBeNull();
  });

  it("un error de verdad sí se cuenta", () => {
    conGetDisplayMedia(true);
    const roto = Object.assign(new Error("el codec explotó"), { name: "InvalidStateError" });
    expect(motivoDeFalloAlCompartir(roto)).toBe("el codec explotó");
  });

  it("y si no trae mensaje, algo se dice igual", () => {
    conGetDisplayMedia(true);
    expect(motivoDeFalloAlCompartir(null)).toBeTruthy();
  });
});
