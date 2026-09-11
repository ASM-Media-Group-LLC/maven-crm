import { describe, it, expect } from "vitest";
import { sumarCoworkDelEquipo, type TiempoCoworkPorPersona } from "@/hooks/useEquipoTiempoCowork";

describe("sumarCoworkDelEquipo", () => {
  const mapa: TiempoCoworkPorPersona = new Map([
    ["a", { horas: 30, horasEnSala: 33, horasMeet: 0, diasConReloj: 5 }],
    ["b", { horas: 0, horasEnSala: 2, horasMeet: 0, diasConReloj: 0 }],   // entró pero el reloj nunca corrió
    ["z", { horas: 99, horasEnSala: 99, horasMeet: 0, diasConReloj: 9 }], // no es del tablero: no cuenta
  ]);
  it("suma solo a la gente del tablero y cuenta quién tuvo reloj", () => {
    const r = sumarCoworkDelEquipo([{ maven_user_id: "a" }, { maven_user_id: "b" }, { maven_user_id: null }], mapa);
    expect(r.horas).toBe(30);
    expect(r.personasConReloj).toBe(1);
  });
  it("sin datos: ceros, sin explotar", () => {
    expect(sumarCoworkDelEquipo([], new Map())).toEqual({ horas: 0, horasMeet: 0, personasConReloj: 0 });
  });
});
