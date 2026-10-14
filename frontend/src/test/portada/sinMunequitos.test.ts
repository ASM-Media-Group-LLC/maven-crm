import { describe, expect, it } from "vitest";
import { siluetaUri } from "@/pages/portada/gente";

// GUARDA: la portada pública dejó los muñequitos (caras de dicebear) y pasó a
// siluetas neutras (pedido explícito, 2026-10-14). Si alguien vuelve a meter
// el generador de caras en la portada, este test lo frena.
const fuentes = import.meta.glob("../../pages/portada/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("portada sin muñequitos", () => {
  it("ninguna pieza de la portada usa dicebear", () => {
    const rutas = Object.keys(fuentes);
    expect(rutas.length).toBeGreaterThan(5); // la portada de verdad está en el glob
    for (const ruta of rutas) {
      expect(fuentes[ruta], ruta).not.toMatch(/dicebear/i);
    }
  });

  it("la silueta es un SVG embebido y estable por seed", () => {
    expect(siluetaUri("camilo").startsWith("data:image/svg+xml,")).toBe(true);
    expect(siluetaUri("camilo")).toBe(siluetaUri("camilo"));
    expect(siluetaUri("camilo")).not.toBe(siluetaUri("sofia"));
  });
});
