import { describe, it, expect } from "vitest";
import { copiaSirve } from "@/lib/microDelSupervisor";

// El supervisor le habla a varias salas a la vez: se toma el micrófono UNA vez y
// cada sala publica una copia. La regla de abajo decide si la copia que ya está
// publicada en una sala sigue valiendo.
//
// EL BUG QUE ESTO CUIDA (30/08/2026): la condición era "si no hay copia, publica
// una". Con eso, una copia muerta o una copia del micrófono anterior contaban
// como buenas, la sala se quedaba muda y el botón seguía en verde. Como se
// arreglaba al apagar y encender el micro de todas las salas —justo lo que hace
// quien va a probar otra vez— el fallo parecía no existir.

const vivo = { readyState: "live" };
const muerto = { readyState: "ended" };

describe("la copia del micro del supervisor", () => {
  it("sirve si está viva y sale del micrófono de ahora", () => {
    const micro = { id: "micro-1" };
    expect(copiaSirve(vivo, micro, micro)).toBe(true);
  });

  it("NO sirve si está muerta — es el caso del micro que se cayó solo", () => {
    const micro = { id: "micro-1" };
    expect(copiaSirve(muerto, micro, micro)).toBe(false);
  });

  it("NO sirve si sale de un micrófono anterior — el supervisor volvió a tomarlo", () => {
    const viejo = { id: "micro-1" };
    const nuevo = { id: "micro-2" };
    // Viva pero huérfana: esto es lo que se colaba antes y dejaba la sala muda.
    expect(copiaSirve(vivo, viejo, nuevo)).toBe(false);
  });

  it("no hay copia todavía: hay que publicar", () => {
    expect(copiaSirve(null, null, { id: "micro-1" })).toBe(false);
    expect(copiaSirve(undefined, null, { id: "micro-1" })).toBe(false);
  });

  it("sin micrófono capturado, ninguna copia sirve", () => {
    // Si micActual es null y la copia venía de un micro real, no coinciden.
    expect(copiaSirve(vivo, { id: "micro-1" }, null)).toBe(false);
  });
});
