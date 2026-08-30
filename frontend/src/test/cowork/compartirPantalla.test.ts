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

/** El puntero del dispositivo: grueso = se maneja con un dedo. */
const conPuntero = (grueso: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: (q: string) => ({ matches: q.includes("coarse") ? grueso : false, media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }),
  });
};

afterEach(() => { vi.restoreAllMocks(); conGetDisplayMedia(true); conPuntero(false); });

describe("saber si se puede compartir pantalla", () => {
  it("en una computadora, sí", () => {
    conGetDisplayMedia(true); conPuntero(false);
    expect(puedeCompartirPantalla()).toBe(true);
  });

  it("en un iPhone, no: la función ni existe", () => {
    conGetDisplayMedia(false); conPuntero(true);
    expect(puedeCompartirPantalla()).toBe(false);
  });

  // LA TRAMPA. Android SÍ expone getDisplayMedia, pero nunca la implementó:
  // siempre rechaza. Mirar solo si la función existe daba "sí puede" y el
  // teléfono se quedaba otra vez sin explicación.
  it("en un Android tampoco, aunque la función exista", () => {
    conGetDisplayMedia(true); conPuntero(true);
    expect(puedeCompartirPantalla()).toBe(false);
  });
});

describe("qué se le dice a la persona", () => {
  it("en un teléfono, el motivo real y qué hacer en su lugar", () => {
    conGetDisplayMedia(false); conPuntero(true);
    const m = motivoDeFalloAlCompartir(new Error("lo que sea"));
    expect(m).toContain("teléfonos");
    expect(m).toContain("computadora");
    expect(m).toContain("Hazlo");   // neutro, sin voseo
  });

  // Cerrar el diálogo del navegador es una decisión, no un error. Avisarla
  // sería regañar a alguien por cambiar de opinión.
  // Android rechaza con NotAllowedError, el MISMO error que "cerré el diálogo".
  // Sin mirar el puntero, este caso caía en el silencio de abajo y el botón
  // volvía a no hacer nada.
  it("en Android, el NotAllowedError NO se toma como una cancelación", () => {
    conGetDisplayMedia(true); conPuntero(true);
    const androide = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(motivoDeFalloAlCompartir(androide)).toContain("teléfonos");
  });

  it("si canceló el diálogo, NO se le dice nada", () => {
    conGetDisplayMedia(true); conPuntero(false);
    const cancelo = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(motivoDeFalloAlCompartir(cancelo)).toBeNull();
    const aborto = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(motivoDeFalloAlCompartir(aborto)).toBeNull();
  });

  it("un error de verdad sí se cuenta", () => {
    conGetDisplayMedia(true); conPuntero(false);
    const roto = Object.assign(new Error("el codec explotó"), { name: "InvalidStateError" });
    expect(motivoDeFalloAlCompartir(roto)).toBe("el codec explotó");
  });

  it("y si no trae mensaje, algo se dice igual", () => {
    conGetDisplayMedia(true); conPuntero(false);
    expect(motivoDeFalloAlCompartir(null)).toBeTruthy();
  });
});
