import { describe, it, expect } from "vitest";
import { esAltDelTecladoNumerico } from "@/lib/codigosAlt";

// Alt+64 («@» en Windows) sacaba del Correo (Keila, 02/10): con Bloq Num
// apagado, el 4 del teclado numérico es la flecha izquierda y Alt+← es «Atrás».
const tecla = (code: string, key: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ altKey: true, ctrlKey: false, metaKey: false, code, key, ...extra });

describe("códigos Alt del teclado numérico", () => {
  it("Bloq Num apagado: Alt + 4/6/7/9 del numérico se frenan (Atrás, Adelante, Inicio…)", () => {
    expect(esAltDelTecladoNumerico(tecla("Numpad4", "ArrowLeft"))).toBe(true);
    expect(esAltDelTecladoNumerico(tecla("Numpad6", "ArrowRight"))).toBe(true);
    expect(esAltDelTecladoNumerico(tecla("Numpad7", "Home"))).toBe(true);
    expect(esAltDelTecladoNumerico(tecla("Numpad9", "PageUp"))).toBe(true);
  });
  it("Bloq Num prendido llega el dígito: no se toca", () => {
    expect(esAltDelTecladoNumerico(tecla("Numpad6", "6"))).toBe(false);
    expect(esAltDelTecladoNumerico(tecla("Numpad4", "4"))).toBe(false);
  });
  it("las flechas de verdad siguen navegando, y sin Alt nada cambia", () => {
    expect(esAltDelTecladoNumerico(tecla("ArrowLeft", "ArrowLeft"))).toBe(false);
    expect(esAltDelTecladoNumerico(tecla("Numpad4", "ArrowLeft", { altKey: false }))).toBe(false);
    expect(esAltDelTecladoNumerico(tecla("Numpad4", "ArrowLeft", { ctrlKey: true }))).toBe(false);
  });
  it("está instalado desde el arranque de la app", () => {
    const main = Object.values((import.meta as unknown as {
      glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
    }).glob("/frontend/src/main.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";
    expect(main.length).toBeGreaterThan(0);
    expect(main).toMatch(/import "\.\/lib\/codigosAlt";/);
  });
});
