import { describe, it, expect } from "vitest";
import { resumirTiempoCowork, pieTiempoCowork } from "@/hooks/useMiTiempoCowork";
import { getTranslation, type TranslationKey } from "@/lib/i18n";

// El pie lo dibuja cada tablero con su propio `t`; acá, uno por idioma.
const es = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "es", p);
const en = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "en", p);

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
    expect(pieTiempoCowork(resumirTiempoCowork(dias), false, es)).toBe("2 días · 14.8 h en sala");
    expect(pieTiempoCowork(resumirTiempoCowork([]), true, es)).toBe("cargando…");
    expect(pieTiempoCowork(resumirTiempoCowork([]), false, es)).toBe("sin tiempo en Cowork en el rango");
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
    expect(pieTiempoCowork(r, false, es)).toBe("2 días · 11.5 h en sala · 1.5 h en meet grupal");
  });
});

describe("el pie del reloj de Cowork en inglés", () => {
  it("dice días, horas en sala y meet grupal en inglés, con singular y plural", () => {
    const dias = [
      { date: "2026-09-10", horas: 6, horasEnSala: 6.5, horasMeet: 0.75 },
      { date: "2026-09-11", horas: 5, horasEnSala: 5, horasMeet: 0.75 },
    ];
    expect(pieTiempoCowork(resumirTiempoCowork(dias), false, en)).toBe("2 days · 11.5 h in the room · 1.5 h in group meets");
    expect(pieTiempoCowork(resumirTiempoCowork([dias[1]]), false, en)).toBe("1 day · 5.0 h in the room · 0.8 h in group meets");
    expect(pieTiempoCowork(resumirTiempoCowork([]), true, en)).toBe("loading…");
    expect(pieTiempoCowork(resumirTiempoCowork([]), false, en)).toBe("no Cowork time in this range");
  });
});
