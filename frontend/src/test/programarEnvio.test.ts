import { describe, expect, it } from "vitest";
import {
  fechaYHoraDe, instanteEnBogota, leerFechaYHora, opcionesDeProgramar, partesEnBogota,
} from "@/lib/programarEnvio";

// «Programar envío» (Keila y Jhon, 08/10): todo en hora de Colombia, UTC−5.
const iso = (d: Date) => d.toISOString();

describe("opcionesDeProgramar", () => {
  it("un jueves a media mañana: mañana 8:00, mañana 13:00 y el lunes 8:00 (hora de Bogotá)", () => {
    // Jueves 8 de octubre de 2026, 10:00 en Bogotá.
    const o = opcionesDeProgramar(new Date("2026-10-08T15:00:00Z"));
    expect(o.map((x) => x.clave)).toEqual(["manana", "tarde", "lunes"]);
    expect(iso(o[0].cuando)).toBe("2026-10-09T13:00:00.000Z");
    expect(iso(o[1].cuando)).toBe("2026-10-09T18:00:00.000Z");
    expect(iso(o[2].cuando)).toBe("2026-10-12T13:00:00.000Z");
  });

  it("⚠️ a las 11 de la noche en Bogotá (ya es mañana en UTC), «mañana» sigue siendo el día siguiente de BOGOTÁ", () => {
    // Jueves 8 de octubre, 23:00 en Bogotá = viernes 9, 04:00 UTC.
    const o = opcionesDeProgramar(new Date("2026-10-09T04:00:00Z"));
    expect(iso(o[0].cuando)).toBe("2026-10-09T13:00:00.000Z"); // viernes 9, 8:00
  });

  it("⚠️ el domingo, «el próximo lunes» es mañana a las 8: no se ofrece dos veces", () => {
    // Domingo 11 de octubre, 10:00 en Bogotá.
    const o = opcionesDeProgramar(new Date("2026-10-11T15:00:00Z"));
    expect(o.map((x) => x.clave)).toEqual(["manana", "tarde"]);
    expect(iso(o[0].cuando)).toBe("2026-10-12T13:00:00.000Z");
  });

  it("un lunes, «el próximo lunes» es el de la semana que viene, no hoy", () => {
    // Lunes 12 de octubre, 9:00 en Bogotá.
    const o = opcionesDeProgramar(new Date("2026-10-12T14:00:00Z"));
    expect(iso(o[2].cuando)).toBe("2026-10-19T13:00:00.000Z");
  });

  it("fin de mes: mañana es el 1 del mes siguiente", () => {
    const o = opcionesDeProgramar(new Date("2026-10-31T15:00:00Z"));
    expect(iso(o[0].cuando)).toBe("2026-11-01T13:00:00.000Z");
  });

  it("todas caen en el futuro, a cualquier hora del día", () => {
    for (let h = 0; h < 24; h++) {
      const ahora = new Date(Date.UTC(2026, 9, 8, h, 30));
      for (const op of opcionesDeProgramar(ahora)) expect(op.cuando.getTime()).toBeGreaterThan(ahora.getTime());
    }
  });
});

describe("Bogotá ida y vuelta", () => {
  it("instanteEnBogota y partesEnBogota se entienden", () => {
    const d = instanteEnBogota(2026, 10, 9, 8, 30);
    expect(iso(d)).toBe("2026-10-09T13:30:00.000Z");
    expect(partesEnBogota(d)).toMatchObject({ anio: 2026, mes: 10, dia: 9, hora: 8, minuto: 30, diaSemana: 5 });
    expect(fechaYHoraDe(d)).toEqual({ fecha: "09/10/2026", hora: "08:30" });
  });
});

describe("leerFechaYHora (el diálogo «Elegir fecha y hora»)", () => {
  const AHORA = new Date("2026-10-08T15:00:00Z");

  it("DD/MM/AAAA y HH:mm de Bogotá", () => {
    const r = leerFechaYHora("09/10/2026", "08:00", AHORA);
    expect(r.ok && iso(r.cuando)).toBe("2026-10-09T13:00:00.000Z");
  });

  it("una fecha que no existe no se acomoda: 31/02 no es «3 de marzo»", () => {
    expect(leerFechaYHora("31/02/2027", "08:00", AHORA)).toEqual({ ok: false, motivo: "fecha" });
  });

  it("dice qué está mal: la fecha, la hora, que ya pasó o que está muy lejos", () => {
    expect(leerFechaYHora("9-10-2026", "08:00", AHORA)).toEqual({ ok: false, motivo: "fecha" });
    expect(leerFechaYHora("09/10/2026", "25:00", AHORA)).toEqual({ ok: false, motivo: "hora" });
    expect(leerFechaYHora("08/10/2026", "09:00", AHORA)).toEqual({ ok: false, motivo: "pasado" });
    expect(leerFechaYHora("09/10/2028", "08:00", AHORA)).toEqual({ ok: false, motivo: "lejos" });
  });
});
