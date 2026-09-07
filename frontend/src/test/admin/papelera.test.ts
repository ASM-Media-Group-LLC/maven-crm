// El aviso de "esto se va a borrar solo" tiene que llegar ANTES de que se borre.
// Si el umbral se corre por accidente, alguien pierde una cuenta sin haber visto
// una sola señal en rojo.

import { describe, it, expect } from "vitest";
import { tonoDelPlazo } from "@/pages/admin/PapeleraTabla";

describe("tonoDelPlazo", () => {
  it("los últimos 3 días van en rojo", () => {
    expect(tonoDelPlazo(0)).toBe("destructive");
    expect(tonoDelPlazo(1)).toBe("destructive");
    expect(tonoDelPlazo(3)).toBe("destructive");
  });

  it("la última semana avisa, sin alarmar", () => {
    expect(tonoDelPlazo(4)).toBe("outline");
    expect(tonoDelPlazo(7)).toBe("outline");
  });

  it("el resto del plazo va tranquilo", () => {
    expect(tonoDelPlazo(8)).toBe("secondary");
    expect(tonoDelPlazo(30)).toBe("secondary");
  });
});
