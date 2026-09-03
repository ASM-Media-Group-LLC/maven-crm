import { describe, expect, it } from "vitest";
import { diasDelRango, resumirHoras, type DiaDeHubstaff } from "@/hooks/useMisHoras";
import { rangeForPreset } from "@/lib/range-presets";

// Los números de un tablero tienen que ser los del rango que muestra su
// calendario. Este test fija las dos piezas donde eso se rompía:
//  · el gráfico día por día, que solo dibujaba los días CON registro;
//  · los presets, que ya se corrigieron para dar la semana/mes en curso.

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dia = (date: string, horas: number, actividad: number | null = null): DiaDeHubstaff =>
  ({ date, horas, actividad });

describe("diasDelRango", () => {
  it("cubre todos los días del rango, con 0 en los que no hay registro", () => {
    const salida = diasDelRango([dia("2026-08-31", 3.3), dia("2026-09-02", 3.2)], "2026-08-31", "2026-09-06");
    expect(salida).toHaveLength(7);
    expect(salida.map((d) => d.date)).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
    expect(salida.map((d) => d.horas)).toEqual([3.3, 0, 3.2, 0, 0, 0, 0]);
  });

  it("un día suelto es un día", () => {
    expect(diasDelRango([dia("2026-09-02", 5)], "2026-09-02", "2026-09-02")).toHaveLength(1);
  });

  it("no infla los totales: diasTrabajados cuenta los días CON registro", () => {
    const crudos = [dia("2026-08-31", 3.3, 31), dia("2026-09-02", 3.2, 40)];
    expect(resumirHoras(crudos).diasTrabajados).toBe(2);
    // Si alguien pasara el arreglo rellenado, la actividad quedaría igual
    // (los días en 0 no pesan) pero los días trabajados mentirían: por eso
    // el relleno es solo para dibujar.
    expect(resumirHoras(diasDelRango(crudos, "2026-08-31", "2026-09-06")).diasTrabajados).toBe(7);
  });

  it("un rango enorme no revienta el gráfico: devuelve solo los días con dato", () => {
    const salida = diasDelRango([dia("2026-01-15", 4)], "2026-01-01", "2026-12-31");
    expect(salida).toHaveLength(1);
  });
});

describe("presets del calendario", () => {
  it("«esta semana» es la semana EN CURSO desde el lunes, no los últimos 7 días", () => {
    // Jueves 3 de septiembre de 2026.
    const r = rangeForPreset("this_week", new Date(2026, 8, 3, 15, 0, 0));
    expect(iso(r.from)).toBe("2026-08-31"); // lunes
    expect(iso(r.to)).toBe("2026-09-06");   // domingo
  });

  it("«este mes» arranca el 1", () => {
    const r = rangeForPreset("this_month", new Date(2026, 8, 3, 15, 0, 0));
    expect(iso(r.from)).toBe("2026-09-01");
  });

  it("«ayer» es ayer, no hoy", () => {
    const r = rangeForPreset("yesterday", new Date(2026, 8, 3, 15, 0, 0));
    expect(iso(r.from)).toBe("2026-09-02");
    expect(iso(r.to)).toBe("2026-09-02");
  });
});
