// En la PWA instalada de iPhone 100dvh se queda corto en el alto de la barra de
// estado. La compensación se MIDE (screen.height − innerHeight) y solo aplica en
// iOS standalone con un faltante del tamaño de una barra de estado.
import { describe, it, expect } from "vitest";
import { compensacionDeAlto } from "@/lib/altoDeLaApp";

describe("compensacionDeAlto", () => {
  it("iPhone 14 Pro instalada: faltan 59", () => {
    expect(compensacionDeAlto({ screenHeight: 852, innerHeight: 793, esIos: true, standalone: true })).toBe(59);
  });
  it("si no falta nada, 0", () => {
    expect(compensacionDeAlto({ screenHeight: 852, innerHeight: 852, esIos: true, standalone: true })).toBe(0);
  });
  it("apaisado o faltante enorme: no tocar", () => {
    expect(compensacionDeAlto({ screenHeight: 852, innerHeight: 393, esIos: true, standalone: true })).toBe(0);
  });
  it("fuera de iOS standalone nunca compensa", () => {
    expect(compensacionDeAlto({ screenHeight: 852, innerHeight: 793, esIos: false, standalone: true })).toBe(0);
    expect(compensacionDeAlto({ screenHeight: 852, innerHeight: 793, esIos: true, standalone: false })).toBe(0);
  });
});
