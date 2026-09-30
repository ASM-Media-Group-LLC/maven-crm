import { describe, it, expect } from "vitest";
import { agregarPorPersona, totales, horas, porcentaje, type FilaDia } from "@/lib/coworkVsHubstaff";

const fila = (o: Partial<FilaDia>): FilaDia => ({
  dia: "2026-09-07", profile_id: "a", nombre: "Ana", hubstaff_seg: 0, hubstaff_actividad: null,
  cowork_activo_seg: 0, cowork_pausa_seg: 0, cowork_sin_camara_seg: 0, cowork_sin_pantalla_seg: 0,
  cowork_fuera_seg: 0, cowork_en_sala_seg: 0, cowork_sesiones: 0,
  cowork_sin_conexion_seg: 0, cowork_sin_conexion_larga_seg: 0, ...o,
});

describe("agregarPorPersona", () => {
  it("suma los días de cada persona y calcula la cobertura Cowork ÷ Hubstaff", () => {
    const r = agregarPorPersona([
      fila({ dia: "2026-09-06", hubstaff_seg: 3600 * 8, cowork_activo_seg: 3600 * 6, cowork_en_sala_seg: 3600 * 7, cowork_pausa_seg: 3600 }),
      fila({ dia: "2026-09-07", hubstaff_seg: 3600 * 2, cowork_activo_seg: 3600 * 2, cowork_en_sala_seg: 3600 * 2 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].hubstaff_seg).toBe(3600 * 10);
    expect(r[0].cowork_activo_seg).toBe(3600 * 8);
    expect(r[0].cobertura).toBeCloseTo(0.8);
    expect(r[0].diasHubstaff).toBe(2);
    expect(r[0].diasCowork).toBe(2);
    expect(r[0].dias.map((d) => d.dia)).toEqual(["2026-09-07", "2026-09-06"]); // más reciente primero
  });
  it("sin Hubstaff la cobertura es null (no cero), y ordena por horas de Hubstaff", () => {
    const r = agregarPorPersona([
      fila({ profile_id: "b", nombre: "Bea", cowork_activo_seg: 100, cowork_en_sala_seg: 100 }),
      fila({ profile_id: "a", nombre: "Ana", hubstaff_seg: 500 }),
    ]);
    expect(r.map((p) => p.nombre)).toEqual(["Ana", "Bea"]);
    expect(r[1].cobertura).toBeNull();
  });
  it("totales cuenta a quienes tienen Hubstaff y ni un segundo de Cowork", () => {
    const t = totales(agregarPorPersona([
      fila({ profile_id: "a", hubstaff_seg: 1000, cowork_activo_seg: 500, cowork_en_sala_seg: 600 }),
      fila({ profile_id: "b", nombre: "Bea", hubstaff_seg: 1000 }),
    ]));
    expect(t.personas).toBe(2);
    expect(t.cobertura).toBeCloseTo(0.25);
    expect(t.sinCowork).toBe(1);
  });
});

describe("formato", () => {
  it("horas legibles, con el cero como dato", () => {
    expect(horas(0)).toBe("0m");
    expect(horas(45 * 60)).toBe("45m");
    expect(horas(3600 * 7 + 60 * 5)).toBe("7h 05m");
    expect(horas(3600 * 2)).toBe("2h");
  });
  it("porcentaje redondeado y guion sin dato", () => {
    expect(porcentaje(0.8)).toBe("80%");
    expect(porcentaje(null)).toBe("—");
  });
});
