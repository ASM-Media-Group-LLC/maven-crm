import { describe, it, expect } from "vitest";
import { resumirTiempoCowork, pieTiempoCowork } from "@/hooks/useMiTiempoCowork";

describe("resumen del reloj de Cowork para los tableros", () => {
  const dias = [
    { date: "2026-09-06", horas: 6.5, horasEnSala: 7.25 },
    { date: "2026-09-07", horas: 0, horasEnSala: 0.5 },   // entró pero el reloj no corrió
    { date: "2026-09-08", horas: 7, horasEnSala: 7 },
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
