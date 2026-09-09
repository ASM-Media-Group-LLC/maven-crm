import { describe, it, expect } from "vitest";
import { diffDestinatarios } from "@/lib/compartirGrabacion";

describe("diffDestinatarios (compartir una grabación)", () => {
  it("agrega a los nuevos y quita a los que ya no están", () => {
    expect(diffDestinatarios(["a", "b"], ["b", "c"])).toEqual({ agregar: ["c"], quitar: ["a"] });
  });
  it("quien grabó nunca se quita ni se agrega", () => {
    expect(diffDestinatarios(["dueño", "a"], ["a"], ["dueño"])).toEqual({ agregar: [], quitar: [] });
    expect(diffDestinatarios(["dueño"], ["dueño", "b"], ["dueño"])).toEqual({ agregar: ["b"], quitar: [] });
  });
  it("sin cambios devuelve listas vacías", () => {
    expect(diffDestinatarios(["a"], ["a"])).toEqual({ agregar: [], quitar: [] });
  });
});
