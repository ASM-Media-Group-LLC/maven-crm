import { describe, it, expect } from "vitest";
import { firmaDeLasReglas } from "@/pages/cowork/CoworkReglasDialog";

describe("firmaDeLasReglas — quién dejó así las reglas de la sesión", () => {
  it("con nombre y fecha, dice los dos", () => {
    const f = firmaDeLasReglas({ quien: "Yoselin Castillo", cuando: "2026-09-08T22:04:00Z" });
    expect(f).toContain("por Yoselin Castillo");
    expect(f).toContain("·");
  });

  it("sin nada que decir, no dice nada", () => {
    // Las cuatro sesiones que ya estaban personalizadas antes de este cambio no
    // tienen autor: mostrar "Personalizadas por" a secas sería peor que callar.
    expect(firmaDeLasReglas(undefined)).toBeNull();
    expect(firmaDeLasReglas({ quien: null, cuando: null })).toBeNull();
  });

  it("con fecha pero sin nombre —la persona ya no está— igual dice cuándo", () => {
    const f = firmaDeLasReglas({ quien: null, cuando: "2026-09-08T22:04:00Z" });
    expect(f).toMatch(/^el /);
    expect(f).not.toContain("por ");
  });

  it("con nombre pero sin fecha, dice solo quién", () => {
    expect(firmaDeLasReglas({ quien: "Luis Carlos Ortega Roman", cuando: null }))
      .toBe("por Luis Carlos Ortega Roman");
  });
});
