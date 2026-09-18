import { describe, it, expect } from "vitest";
import { HORA_MANANA, HORA_TARDE, opcionesDePosponer, proximoLunes } from "@/lib/posponer";

const en = (iso: string) => new Date(iso);
const op = (ahora: Date, clave: string) =>
  opcionesDePosponer(ahora).find((o) => o.clave === clave)!;

describe("⚠️ «esta tarde» no puede caer en el pasado", () => {
  it("a las 9 de la mañana, se ofrece", () => {
    const o = op(en("2026-09-18T09:00:00"), "tarde");
    expect(o.cuando).not.toBeNull();
    expect(o.cuando!.getHours()).toBe(HORA_TARDE);
  });

  it("a las 16 NO se ofrece", () => {
    // Ofrecerla daría un instante ya pasado y el despertador lo devolvería en
    // su primera corrida: tocás "esta tarde" y vuelve a los cinco minutos.
    expect(op(en("2026-09-18T16:00:00"), "tarde").cuando).toBeNull();
  });

  it("a las 14:50 tampoco: diez minutos no es posponer", () => {
    expect(op(en("2026-09-18T14:50:00"), "tarde").cuando).toBeNull();
  });

  it("a las 14:00 sí: falta una hora justa", () => {
    expect(op(en("2026-09-18T14:00:00"), "tarde").cuando).not.toBeNull();
  });
});

describe("las demás siempre caen adelante", () => {
  const horas = ["2026-09-18T00:30:00", "2026-09-18T09:00:00", "2026-09-18T23:59:00"];
  for (const h of horas) {
    it(`a las ${h.slice(11, 16)}, ninguna opción está en el pasado`, () => {
      const ahora = en(h);
      for (const o of opcionesDePosponer(ahora)) {
        if (!o.cuando) continue;
        expect(o.cuando.getTime(), `«${o.clave}» quedó en el pasado`).toBeGreaterThan(ahora.getTime());
      }
    });
  }

  it("«mañana» es mañana a la hora de la jornada, no a medianoche", () => {
    const o = op(en("2026-09-18T22:00:00"), "manana");
    expect(o.cuando!.getDate()).toBe(19);
    expect(o.cuando!.getHours()).toBe(HORA_MANANA);
  });
});

describe("proximoLunes", () => {
  it("desde un miércoles va al lunes siguiente", () => {
    // 2026-09-16 es miércoles.
    expect(proximoLunes(en("2026-09-16T10:00:00")).getDay()).toBe(1);
    expect(proximoLunes(en("2026-09-16T10:00:00")).getDate()).toBe(21);
  });

  it("⚠️ desde un LUNES va al siguiente, no a hoy", () => {
    // 2026-09-21 es lunes. "El lunes que viene" nunca es hoy.
    const r = proximoLunes(en("2026-09-21T10:00:00"));
    expect(r.getDay()).toBe(1);
    expect(r.getDate()).toBe(28);
  });

  it("desde un domingo va al lunes de mañana", () => {
    // 2026-09-20 es domingo.
    const r = proximoLunes(en("2026-09-20T10:00:00"));
    expect(r.getDate()).toBe(21);
  });

  it("siempre a la hora de la jornada", () => {
    expect(proximoLunes(en("2026-09-16T23:00:00")).getHours()).toBe(HORA_MANANA);
  });
});
