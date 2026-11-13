import { describe, it, expect } from "vitest";
import { repartir } from "@/components/hr/TarjetaArgos";

// GUARDA (Alvaro, 13/11/2026): «lo importante del día» reparte los cambios de
// programa a lo largo del turno; no se juntan todos en la primera hora.
describe("repartir", () => {
  it("toma primero, último y en medio", () => {
    expect(repartir([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
  });
  it("si hay pocos, los deja todos", () => {
    expect(repartir([1, 2], 4)).toEqual([1, 2]);
  });
});
