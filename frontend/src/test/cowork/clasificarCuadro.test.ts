import { describe, it, expect } from "vitest";
import { clasificarCuadro } from "@/hooks/useFaceWatch";

// Poca luz ≠ no se ve a nadie (Jhon, 07/09). Con la imagen oscura la cara se
// busca igual: si está, es "poca luz" (alerta y el reloj sigue); si no está, es
// "no hay nadie" (el reloj se detiene, como con la cámara tapada).
describe("clasificarCuadro", () => {
  it("oscuro sin cara: no hay nadie → no_face (detiene el reloj)", () => {
    expect(clasificarCuadro({ oscuro: true, hayCara: false, ratio: 0 })).toBe("no_face");
  });
  it("oscuro con cara: está, con mala luz → too_dark (solo alerta)", () => {
    expect(clasificarCuadro({ oscuro: true, hayCara: true, ratio: 0.2 })).toBe("too_dark");
  });
  it("con luz: sin cara, lejos, o bien", () => {
    expect(clasificarCuadro({ oscuro: false, hayCara: false, ratio: 0 })).toBe("no_face");
    expect(clasificarCuadro({ oscuro: false, hayCara: true, ratio: 0.001 })).toBe("too_small");
    expect(clasificarCuadro({ oscuro: false, hayCara: true, ratio: 0.2 })).toBe("ok");
  });
});
