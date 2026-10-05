import { describe, it, expect } from "vitest";
import { edadDesde } from "@/lib/creadoras/edad";

// LA EDAD SALE DE LA FECHA DE NACIMIENTO (Jhon, 06/10: «que aquí la edad sea
// automática en base a fecha de nacimiento»). En el alta se escribían las dos
// a mano y podían no coincidir.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/creadores/NuevoCreadorForm.tsx", "/frontend/src/pages/creadores/InfoTabContent.tsx"], { query: "?raw", import: "default", eager: true });
const fuente = (n: string) => Object.entries(fuentes).find(([k]) => k.endsWith(n))?.[1] ?? "";

const el = (iso: string) => new Date(`${iso}T12:00:00`);

describe("edadDesde", () => {
  it("cuenta los años cumplidos: el cumpleaños suma ese mismo día, no antes", () => {
    expect(edadDesde("1991-09-21", el("2026-10-06"))).toBe(35);
    expect(edadDesde("1991-10-06", el("2026-10-06"))).toBe(35);
    expect(edadDesde("1991-10-07", el("2026-10-06"))).toBe(34);
    expect(edadDesde("2008-10-07", el("2026-10-06"))).toBe(17);
    expect(edadDesde("2008-10-06", el("2026-10-06"))).toBe(18);
  });

  it("nacida un 29 de febrero: cumple el 1 de marzo en los años que no son bisiestos", () => {
    expect(edadDesde("2000-02-29", el("2026-02-28"))).toBe(25);
    expect(edadDesde("2000-02-29", el("2026-03-01"))).toBe(26);
  });

  it("sin una fecha real, o futura, no hay edad (null), no se inventa", () => {
    expect(edadDesde("", el("2026-10-06"))).toBeNull();
    expect(edadDesde(null)).toBeNull();
    expect(edadDesde("21/09/1991")).toBeNull();
    expect(edadDesde("1991-02-31")).toBeNull();
    expect(edadDesde("2030-01-01", el("2026-10-06"))).toBeNull();
  });
});

describe("los formularios", () => {
  it("el alta ya no deja escribir la edad: la muestra calculada y guarda la de la fecha", () => {
    const alta = fuente("NuevoCreadorForm.tsx");
    expect(alta.length).toBeGreaterThan(1000);
    expect(alta).not.toMatch(/set\("age"/);
    expect(alta).toMatch(/readOnly[\s\S]{0,80}value=\{edadDesde\(form\.birth_date\)/);
    expect(alta).toMatch(/age: edadDesde\(form\.birth_date\)/);
  });
  it("la ficha, al cambiar la fecha, actualiza la edad guardada", () => {
    expect(fuente("InfoTabContent.tsx")).toMatch(/age: edadDesde\(editData\.birth_date\)/);
  });
});
