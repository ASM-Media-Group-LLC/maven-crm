import { describe, it, expect } from "vitest";
import { agenciaDe, type LineaDeAgencia, negocioDeLaOpcion, opcionesDelFiltro } from "@/lib/creadoras/agencia";

// LA AGENCIA DE UNA CREADORA: una sola regla para la tabla, las tarjetas, el
// dashboard, el filtro, la ficha y el alta. Los casos son los de prod (06/10):
// cómo están guardadas hoy las fichas de Kash.

const KASH = "d2dc8593-35b5-4a97-bead-471277a9d6c0";
const ATOMICK = "61321c00-066c-4b5c-9dec-3a12d108effe";
const UNLOK = "455af7dc-34fe-4306-b864-1ee101950d05";
const LINEAS: LineaDeAgencia[] = [
  { id: "1", nombre: "Kash Plus", orden: 1, company_id: KASH, kash_type: "Plus", alias: [] },
  { id: "2", nombre: "Kash Massive", orden: 2, company_id: KASH, kash_type: "Massive", alias: [] },
  { id: "3", nombre: "Atomick", orden: 3, company_id: ATOMICK, kash_type: null, alias: ["Atomic Agency", "Unlok", "Unlok Platform"] },
];
const empresa = (id: string, name: string) => ({ id, name });

describe("agenciaDe: lo que se muestra", () => {
  it("el tier que pone BLU manda (Kash Plus / Kash Massive)", () => {
    expect(agenciaDe({ assigned_agency: "Kash Agency", company_id: KASH, kash_type: "Massive", company: empresa(KASH, "Kash") }, LINEAS)).toBe("Kash Massive");
    expect(agenciaDe({ assigned_agency: null, company_id: null, kash_type: "Plus" }, LINEAS)).toBe("Kash Plus");
  });

  it("Atomick, también con los nombres viejos (Unlok, «Atomic Agency»)", () => {
    expect(agenciaDe({ assigned_agency: "Atomic Agency", company_id: ATOMICK, company: empresa(ATOMICK, "Atomick") }, LINEAS)).toBe("Atomick");
    expect(agenciaDe({ assigned_agency: "Unlok Platform", company_id: UNLOK, company: empresa(UNLOK, "Unlok") }, LINEAS)).toBe("Atomick");
  });

  it("Kash sin tier todavía: «Kash» (no se inventa Plus ni Massive)", () => {
    expect(agenciaDe({ assigned_agency: "Kash Agency", company_id: KASH, company: empresa(KASH, "Kash") }, LINEAS)).toBe("Kash");
  });

  it("lo que no es de ninguna línea se muestra tal cual; sin nada, vacío", () => {
    expect(agenciaDe({ assigned_agency: "Elite Models" }, LINEAS)).toBe("Elite Models");
    expect(agenciaDe({}, LINEAS)).toBe("");
    expect(agenciaDe(null, LINEAS)).toBe("");
  });

  it("una agencia sin líneas: lo guardado, o su propio nombre", () => {
    expect(agenciaDe({ assigned_agency: "Glow Agency" }, [], "Glow Agency")).toBe("Glow Agency");
    expect(agenciaDe({}, [], "Glow Agency")).toBe("Glow Agency");
  });
});

describe("negocioDeLaOpcion: lo que se guarda al elegir", () => {
  it("Kash Plus: el texto, la compañía Kash y el tier", () => {
    expect(negocioDeLaOpcion("Kash Plus", LINEAS, "Kash")).toEqual({ assigned_agency: "Kash Plus", company_id: KASH, kash_type: "Plus" });
  });
  it("Atomick: no le borra a nadie el tier que haya puesto BLU", () => {
    expect(negocioDeLaOpcion("Atomick", LINEAS, "Kash")).toEqual({ assigned_agency: "Atomick", company_id: ATOMICK });
  });
  it("una agencia sin líneas guarda su propio nombre, sin compañía", () => {
    expect(negocioDeLaOpcion("", [], "Glow Agency")).toEqual({ assigned_agency: "Glow Agency", company_id: null });
  });
});

describe("opcionesDelFiltro", () => {
  it("primero las líneas en su orden, después lo viejo que haya en las fichas, sin repetir", () => {
    expect(opcionesDelFiltro(["Kash", "Atomick", "Kash Plus", "Ora", "Kash"], LINEAS)).toEqual(["Kash Plus", "Kash Massive", "Atomick", "Kash", "Ora"]);
  });
});
