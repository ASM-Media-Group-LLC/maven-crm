import { describe, it, expect } from "vitest";
import { elegirPresencia } from "@/hooks/useCoworkMediaPresence";

// EL BUG (02/09/2026): el contador de break/baño no aparecía en el tablero del
// supervisor aunque la persona lo tuviera corriendo en pantalla. El tablero
// tomaba la PRIMERA presencia bajo la clave del usuario — la más VIEJA — y con
// dos conexiones (PWA + navegador, o una reconexión con el socket viejo aún
// vivo) esa era justamente la que no sabía nada de la pausa.

type P = { onBreak?: boolean; tag: string };

describe("elegirPresencia — qué conexión se muestra cuando hay varias", () => {
  it("una sola: esa", () => {
    expect(elegirPresencia<P>([{ tag: "a" }])?.tag).toBe("a");
  });

  it("varias y ninguna en pausa: la más NUEVA (la última), no la vieja", () => {
    expect(elegirPresencia<P>([{ tag: "vieja" }, { tag: "nueva" }])?.tag).toBe("nueva");
  });

  it("si alguna dice 'en pausa', esa manda aunque sea la vieja", () => {
    // La pestaña que marcó la pausa es la que sabe; la otra publica sin pausa.
    expect(elegirPresencia<P>([{ tag: "pausa", onBreak: true }, { tag: "sin" }])?.tag).toBe("pausa");
    expect(elegirPresencia<P>([{ tag: "sin" }, { tag: "pausa", onBreak: true }])?.tag).toBe("pausa");
  });

  it("vacío o undefined: undefined, sin explotar", () => {
    expect(elegirPresencia<P>([])).toBeUndefined();
    expect(elegirPresencia<P>(undefined)).toBeUndefined();
  });
});
