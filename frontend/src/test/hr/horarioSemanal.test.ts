// El horario por semana que manda la plataforma de la agencia (13/11/2026): el turno de
// cada día manda sobre el horario de siempre, y en el día de descanso no hay entrada.
// Lo mismo que hace la base (horario_de / turno_del_dia en 20261114000000).
import { describe, it, expect } from "vitest";
import { diaDeLaSemana, turnosDelDia, type FilaSemanal } from "@/lib/horarioEmpleado";

const migracion = import.meta.glob("../../../../supabase/migrations/20261114000000_equipo_horario_semana_y_argos.sql", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;

describe("el día de la semana, como extract(dow) de la base", () => {
  it("0 = domingo … 6 = sábado, de una fecha AAAA-MM-DD", () => {
    expect(diaDeLaSemana("2026-11-08")).toBe(0); // domingo
    expect(diaDeLaSemana("2026-11-09")).toBe(1); // lunes
    expect(diaDeLaSemana("2026-11-14")).toBe(6); // sábado
  });

  it("sin fecha, el de hoy en Bogotá (a las 22:00 de Bogotá todavía es el mismo día)", () => {
    // Sábado 14/11 a las 22:00 de Bogotá = domingo 15/11 03:00 UTC.
    expect(diaDeLaSemana(undefined, Date.UTC(2026, 10, 15, 3, 0))).toBe(6);
    expect(diaDeLaSemana(undefined, Date.UTC(2026, 10, 15, 6, 0))).toBe(0);
  });
});

describe("el turno de ese día", () => {
  const ANA = "a", BETO = "b";
  const filas: FilaSemanal[] = [
    ...[1, 2, 3, 4, 5].map((dia) => ({ user_id: ANA, dia, entrada: "08:00:00", salida: "16:00:00" })),
    { user_id: ANA, dia: 6, entrada: null, salida: null },
    { user_id: ANA, dia: 0, entrada: "22:00:00", salida: "06:00:00" },
  ];

  it("con horario por semana: el de ese día; en su descanso, sin entrada", () => {
    expect(turnosDelDia(filas, 1).get(ANA)).toEqual({ entrada: "08:00:00", salida: "16:00:00" });
    expect(turnosDelDia(filas, 0).get(ANA)).toEqual({ entrada: "22:00:00", salida: "06:00:00" });
    expect(turnosDelDia(filas, 6).get(ANA)).toEqual({ entrada: null, salida: null });
  });

  it("un día que no tiene fila también es descanso", () => {
    const sinDomingo = filas.filter((f) => f.dia !== 0);
    expect(turnosDelDia(sinDomingo, 0).get(ANA)).toEqual({ entrada: null, salida: null });
  });

  it("quien no tiene horario por semana no aparece: vale su horario de siempre", () => {
    expect(turnosDelDia(filas, 1).has(BETO)).toBe(false);
    expect(turnosDelDia([], 1).size).toBe(0);
  });

  it("la base guarda los mismos 7 días (0 = domingo) que se leen aquí", () => {
    const sql = Object.values(migracion)[0] ?? "";
    expect(sql.length).toBeGreaterThan(1000);
    expect(sql).toMatch(/dia\s+smallint not null check \(dia between 0 and 6\)/);
    expect(sql).toContain("(1, 'lun'), (2, 'mar'), (3, 'mie'), (4, 'jue'), (5, 'vie'), (6, 'sab'), (0, 'dom')");
    expect(sql).toContain("extract(dow from _dia)");
  });
});
