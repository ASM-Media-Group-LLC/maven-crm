// Minutos de gracia (lib/gracia.ts, Alvaro 16/11/2026): 15 sin pantalla y 15 sin
// cámara por turno; lo que pasa de ahí no se paga.
import { describe, it, expect } from "vitest";
import { formatoMinutos, minDeSeg, resumenGracia, tonoGracia, usoGracia, validarDevolucion, type GraciaTurno } from "@/lib/gracia";

const turno = (x: Partial<GraciaTurno> = {}): GraciaTurno => ({
  inicio: "2026-11-16T13:00:00Z",
  fin: "2026-11-16T21:00:00Z",
  conectado_seg: 480 * 60,
  trabajo_seg: 420 * 60,
  pausa_seg: 30 * 60,
  sin_pantalla_seg: 10 * 60,
  sin_camara_seg: 20 * 60,
  gracia_pantalla_min: 15,
  gracia_camara_min: 15,
  extra_pantalla_min: 0,
  extra_camara_min: 0,
  descuento_seg: 5 * 60,
  a_pagar_seg: 445 * 60,
  ensayo: true,
  ...x,
});

describe("minutos de gracia", () => {
  it("cuenta lo que queda y lo que pasa de cada gracia", () => {
    expect(usoGracia(10 * 60, 15)).toEqual({ usados: 10, gracia: 15, queda: 5, exceso: 0, agotada: false });
    expect(usoGracia(20 * 60, 15)).toEqual({ usados: 20, gracia: 15, queda: 0, exceso: 5, agotada: true });
    expect(usoGracia(null, 15)).toEqual({ usados: 0, gracia: 15, queda: 15, exceso: 0, agotada: false });
  });

  it("resume el turno en minutos", () => {
    const r = resumenGracia(turno({ extra_camara_min: 30, gracia_camara_min: 45 }));
    expect(r.conectado).toBe(480);
    expect(r.aPagar).toBe(445);
    expect(r.descuento).toBe(5);
    expect(r.camara.queda).toBe(25);
    expect(r.devueltos).toBe(30);
    expect(r.ensayo).toBe(true);
  });

  it("el tono avisa cuando se acaba y cuando ya descuenta", () => {
    expect(tonoGracia(resumenGracia(turno({ sin_pantalla_seg: 0, sin_camara_seg: 0, descuento_seg: 0 })))).toBe("bien");
    expect(tonoGracia(resumenGracia(turno({ sin_pantalla_seg: 11 * 60, sin_camara_seg: 0, descuento_seg: 0 })))).toBe("poca");
    expect(tonoGracia(resumenGracia(turno()))).toBe("descuento");
  });

  it("formatea minutos y segundos", () => {
    expect(formatoMinutos(45)).toBe("45 min");
    expect(formatoMinutos(425)).toBe("7 h 05 min");
    expect(formatoMinutos(120)).toBe("2 h");
    expect(minDeSeg(89)).toBe(1);
    expect(minDeSeg(-5)).toBe(0);
  });

  it("RR. HH. tiene que poner minutos y motivo", () => {
    expect(validarDevolucion(0, 0, "se dañó la cámara")).toBe("minutos");
    expect(validarDevolucion(500, 0, "se dañó la cámara")).toBe("minutos");
    expect(validarDevolucion(0, 30, "x")).toBe("motivo");
    expect(validarDevolucion(0, 30, "se dañó la cámara")).toBeNull();
  });
});
