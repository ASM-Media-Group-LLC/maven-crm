import { describe, it, expect } from "vitest";
import { resumirTiempoCowork, pieTiempoCowork } from "@/hooks/useMiTiempoCowork";

describe("resumen del reloj de Cowork para los tableros", () => {
  const dias = [
    { date: "2026-09-06", horas: 6.5, horasEnSala: 7.25, horasMeet: 0 },
    { date: "2026-09-07", horas: 0, horasEnSala: 0.5, horasMeet: 0 },   // entró pero el reloj no corrió
    { date: "2026-09-08", horas: 7, horasEnSala: 7, horasMeet: 0 },
  ];
  it("suma horas y cuenta solo los días en que el reloj corrió", () => {
    const r = resumirTiempoCowork(dias);
    expect(r.horas).toBeCloseTo(13.5);
    expect(r.horasEnSala).toBeCloseTo(14.75);
    expect(r.diasConReloj).toBe(2);
  });
  it("el pie dice días y horas en sala; vacío distingue cargando de sin datos", () => {
    expect(pieTiempoCowork(resumirTiempoCowork(dias), false)).toBe("2 días · 14.8 h en sala");
    expect(pieTiempoCowork(resumirTiempoCowork([]), true)).toBe("cargando…");
    expect(pieTiempoCowork(resumirTiempoCowork([]), false)).toBe("sin tiempo en Cowork en el rango");
  });
});

describe("resumirTiempoCowork — el meet grupal se ve aparte", () => {
  it("suma las horas de meet y el pie las dice", () => {
    const dias = [
      { date: "2026-09-10", horas: 6, horasEnSala: 6.5, horasMeet: 0.75 },
      { date: "2026-09-11", horas: 5, horasEnSala: 5, horasMeet: 0.75 },
    ];
    const r = resumirTiempoCowork(dias);
    expect(r.horasMeet).toBeCloseTo(1.5);
    expect(pieTiempoCowork(r, false)).toBe("2 días · 11.5 h en sala · 1.5 h en meet grupal");
  });
});
