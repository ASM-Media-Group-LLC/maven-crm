import { describe, it, expect } from "vitest";
import { tocaPreguntar, estadoConfirmado, IA_CADA_MS, IA_VALE_MS } from "@/lib/caraConfirmada";

// Alvaro, 17/11/2026: «No se te ve la cara» salía aunque la persona estuviera
// ahí. El detector chico solo sospecha; la IA confirma antes de acusar.

const fuentes = import.meta.glob("../../hooks/useFaceWatch.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const detector = Object.values(fuentes)[0];

describe("la IA confirma antes de decir «no se te ve la cara»", () => {
  const ahora = 1_000_000;

  it("sin respuesta de la IA, a favor de la persona", () => {
    expect(estadoConfirmado("no_face", null, ahora)).toBe("ok");
  });

  it("si la IA ve a alguien, no se acusa", () => {
    expect(estadoConfirmado("no_face", { persona: true, en: ahora }, ahora)).toBe("ok");
  });

  it("si la IA no pudo contestar (sin saldo, caída), no se acusa", () => {
    expect(estadoConfirmado("no_face", { persona: null, en: ahora }, ahora)).toBe("ok");
  });

  it("solo con la IA diciendo que no hay nadie, y hace poco, sale «no_face»", () => {
    expect(estadoConfirmado("no_face", { persona: false, en: ahora }, ahora)).toBe("no_face");
    expect(estadoConfirmado("no_face", { persona: false, en: ahora - IA_VALE_MS - 1 }, ahora)).toBe("ok");
  });

  it("los demás estados pasan igual", () => {
    expect(estadoConfirmado("too_dark", null, ahora)).toBe("too_dark");
    expect(estadoConfirmado("ok", { persona: false, en: ahora }, ahora)).toBe("ok");
  });

  it("se le pregunta a la IA solo con sospecha, una a la vez y como mucho una vez por minuto", () => {
    expect(tocaPreguntar(false, null, false, ahora)).toBe(false);
    expect(tocaPreguntar(true, null, true, ahora)).toBe(false);
    expect(tocaPreguntar(true, null, false, ahora)).toBe(true);
    expect(tocaPreguntar(true, { persona: true, en: ahora - 1000 }, false, ahora)).toBe(false);
    expect(tocaPreguntar(true, { persona: true, en: ahora - IA_CADA_MS }, false, ahora)).toBe(true);
  });

  it("el detector usa la confirmación, la confianza más baja y el zoom al centro", () => {
    expect(detector).toMatch(/estadoConfirmado\(/);
    expect(detector).toMatch(/functions\.invoke\("argos-cara"/);
    expect(detector).toMatch(/minDetectionConfidence: 0\.35/);
    expect(detector).toMatch(/Segunda pasada con ZOOM/);
  });
});
