import { describe, it, expect } from "vitest";
import { elegirPresencia } from "@/hooks/useCoworkMediaPresence";

// EL BUG (02/09/2026): el contador de break/baño no aparecía en el tablero del
// supervisor aunque la persona lo tuviera corriendo en pantalla. El tablero
// tomaba la PRIMERA presencia bajo la clave del usuario — la más VIEJA — y con
// dos conexiones (PWA + navegador, o una reconexión con el socket viejo aún
// vivo) esa era justamente la que no sabía nada de la pausa.

type P = { onBreak?: boolean; camOn?: boolean; screenShareOn?: boolean; tag: string };

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

  it("con dos pestañas, manda la que está TRABAJANDO (cámara + pantalla), no la más nueva", () => {
    // 07/09: la pestaña de fondo, sin cámara, hacía sonar "cámara apagada"
    // mientras la persona estaba perfecta en la otra.
    expect(elegirPresencia<P>([
      { tag: "trabajando", camOn: true, screenShareOn: true },
      { tag: "fondo", camOn: false, screenShareOn: false },
    ])?.tag).toBe("trabajando");
    // Solo cámara le gana a solo pantalla; a igual puntaje, la más nueva.
    expect(elegirPresencia<P>([{ tag: "cam", camOn: true }, { tag: "pantalla", screenShareOn: true }])?.tag).toBe("cam");
    expect(elegirPresencia<P>([{ tag: "vieja", camOn: true }, { tag: "nueva", camOn: true }])?.tag).toBe("nueva");
  });
});

describe("elegirPresencia — dos equipos: manda el que está EN la sala", () => {
  type Q = { tag: string; camOn?: boolean; screenShareOn?: boolean; conexionSala?: string | null };
  it("⚠️ el teléfono en la sala le gana a la laptop que quedó afuera, aunque tenga la cámara apagada", () => {
    const laptop: Q = { tag: "laptop", camOn: true, screenShareOn: true, conexionSala: "desconectada" };
    const telefono: Q = { tag: "telefono", camOn: false, screenShareOn: false, conexionSala: "conectada" };
    expect(elegirPresencia<Q>([laptop, telefono])?.tag).toBe("telefono");
    expect(elegirPresencia<Q>([telefono, laptop])?.tag).toBe("telefono");
  });

  it("sin el dato (versiones anteriores) sigue mandando cámara y pantalla", () => {
    const a: Q = { tag: "a", camOn: true };
    const b: Q = { tag: "b", camOn: false };
    expect(elegirPresencia<Q>([a, b])?.tag).toBe("a");
  });
});
