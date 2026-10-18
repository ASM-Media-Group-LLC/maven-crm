import { describe, it, expect } from "vitest";
import { tituloBonito } from "@/lib/tituloBonito";

describe("tituloBonito — nombres GRITADOS en mayúsculas a Título", () => {
  it("pasa los nombres todo-mayúsculas a Título", () => {
    expect(tituloBonito("CHATTERS KASH 2.0")).toBe("Chatters Kash 2.0");
    expect(tituloBonito("UNIVERSIDAD KASH")).toBe("Universidad Kash");
    expect(tituloBonito("ELITE")).toBe("Elite");
    expect(tituloBonito("COORDINADORES")).toBe("Coordinadores");
  });

  it("deja los conectores en minúscula (salvo al inicio)", () => {
    expect(tituloBonito("BRAYAN Y DANIEL")).toBe("Brayan y Daniel");
    expect(tituloBonito("CIERRES - MARKETING")).toBe("Cierres - Marketing");
  });

  it("respeta lo que ya trae minúsculas (lo escribieron bien)", () => {
    expect(tituloBonito("letshoot")).toBe("letshoot");
    expect(tituloBonito("Sala Cowork")).toBe("Sala Cowork");
    expect(tituloBonito("Prueba")).toBe("Prueba");
  });

  it("deja los acrónimos cortos en mayúsculas", () => {
    expect(tituloBonito("HR")).toBe("HR");
    expect(tituloBonito("QA")).toBe("QA");
    expect(tituloBonito("CS")).toBe("CS");
  });

  it("aguanta vacío y espacios", () => {
    expect(tituloBonito("")).toBe("");
    expect(tituloBonito(null)).toBe("");
    expect(tituloBonito(undefined)).toBe("");
    expect(tituloBonito("  MASSIVE 1  ")).toBe("Massive 1");
  });
});
