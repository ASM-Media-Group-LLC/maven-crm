import { describe, expect, it } from "vitest";
import {
  avisoMinimo, diasHabiles, diferenciaDias, fueraPorDia, hoyBogota, lunesDe, primerDiaPermitido, primeroDelMes,
  rangoDias, resumirDia, seSolapan, sumarDias, ultimoDelMes, vacacionesAcumuladas, validarSolicitud,
  type FilaAsistencia, type Politica,
} from "@/lib/ausencias";
import { calcularEnTurno } from "@/lib/turnoActivo";

// AUSENCIAS (20/11/2026): la lógica que el formulario usa para avisar antes de
// enviar. Es la MISMA cuenta que la base (ausencias_dias_habiles, ausencias_saldo,
// el aviso de ausencia_solicitar); el banco supabase/tests/ausencias.ts prueba la
// del servidor con los mismos casos.

const L_V = [false, true, true, true, true, true, false];
const POL: Politica = { vacaciones_dias_anio: 15, aviso_vacaciones_dias: 15, aviso_permiso_dias: 2, aviso_dia_libre_dias: 2 };

describe("fechas", () => {
  it("suma, resta y rangos sin zona horaria", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(diferenciaDias("2026-12-07", "2026-12-14")).toBe(7);
    expect(rangoDias("2026-12-07", "2026-12-09")).toEqual(["2026-12-07", "2026-12-08", "2026-12-09"]);
    expect(lunesDe("2026-12-13")).toBe("2026-12-07"); // domingo → su lunes
    expect(lunesDe("2026-12-07")).toBe("2026-12-07");
    expect(primeroDelMes("2026-02-17")).toBe("2026-02-01");
    expect(ultimoDelMes("2026-02-17")).toBe("2026-02-28");
    expect(ultimoDelMes("2028-02-03")).toBe("2028-02-29");
  });

  it("hoy es el día de Bogotá (UTC-5)", () => {
    expect(hoyBogota(Date.parse("2026-11-21T03:00:00Z"))).toBe("2026-11-20");
    expect(hoyBogota(Date.parse("2026-11-21T06:00:00Z"))).toBe("2026-11-21");
  });

  it("solape parcial y en los bordes", () => {
    expect(seSolapan({ desde: "2026-12-07", hasta: "2026-12-10" }, { desde: "2026-12-10", hasta: "2026-12-12" })).toBe(true);
    expect(seSolapan({ desde: "2026-12-07", hasta: "2026-12-09" }, { desde: "2026-12-10", hasta: "2026-12-12" })).toBe(false);
    expect(seSolapan({ desde: "2026-12-01", hasta: "2026-12-31" }, { desde: "2026-12-10", hasta: "2026-12-11" })).toBe(true);
  });
});

describe("días hábiles", () => {
  it("cuenta los días en que trabaja, sin festivos", () => {
    expect(diasHabiles("2026-12-07", "2026-12-13", L_V, new Set())).toBe(5);
    expect(diasHabiles("2026-12-07", "2026-12-13", L_V, new Set(["2026-12-08"]))).toBe(4);
    // Un festivo en sábado no descuenta (ese día no trabaja).
    expect(diasHabiles("2026-12-07", "2026-12-13", L_V, new Set(["2026-12-12"]))).toBe(5);
  });

  it("con horario de lunes a sábado cuenta el sábado", () => {
    expect(diasHabiles("2026-12-07", "2026-12-13", [false, true, true, true, true, true, true], new Set())).toBe(6);
  });

  it("sin horario, de lunes a viernes; parcial = medio día; fechas al revés = 0", () => {
    expect(diasHabiles("2026-12-07", "2026-12-13", [false, false, false, false, false, false, false], new Set())).toBe(5);
    expect(diasHabiles("2026-12-09", "2026-12-09", L_V, new Set(), true)).toBe(0.5);
    expect(diasHabiles("2026-12-09", "2026-12-07", L_V, new Set())).toBe(0);
  });
});

describe("saldo de vacaciones", () => {
  it("se acumula día a día desde el ingreso", () => {
    expect(vacacionesAcumuladas("2024-11-20", "2026-11-20", 15)).toBeCloseTo(30, 1);
    expect(vacacionesAcumuladas("2026-05-20", "2026-11-20", 15)).toBeCloseTo(7.56, 2);
    expect(vacacionesAcumuladas("2026-11-20", "2026-11-20", 15)).toBe(0);
    // Ingreso futuro (mal cargado): nunca negativo.
    expect(vacacionesAcumuladas("2027-01-01", "2026-11-20", 15)).toBe(0);
  });
});

describe("aviso mínimo y validación", () => {
  it("cada tipo con su anticipación; la incapacidad, ninguna", () => {
    expect(avisoMinimo("vacaciones", POL)).toBe(15);
    expect(avisoMinimo("permiso", POL)).toBe(2);
    expect(avisoMinimo("incapacidad", POL)).toBe(0);
    expect(primerDiaPermitido("vacaciones", POL, "2026-11-20")).toBe("2026-12-05");
  });

  const base = {
    tipo: "vacaciones" as const, desde: "2026-12-14", hasta: "2026-12-18", parcial: false, tieneAdjunto: false,
    dias: 5, saldoLibre: 10, politica: POL, hoy: "2026-11-20",
  };
  it("pasa una solicitud buena y frena las malas", () => {
    expect(validarSolicitud(base)).toBeNull();
    expect(validarSolicitud({ ...base, desde: "2026-11-25", hasta: "2026-11-26" })).toBe("aviso");
    expect(validarSolicitud({ ...base, dias: 11 })).toBe("saldo");
    expect(validarSolicitud({ ...base, hasta: "2026-12-10" })).toBe("fechas");
    expect(validarSolicitud({ ...base, tipo: "incapacidad", desde: "2026-11-20", hasta: "2026-11-21" })).toBe("adjunto");
    expect(validarSolicitud({ ...base, tipo: "incapacidad", desde: "2026-11-20", hasta: "2026-11-21", tieneAdjunto: true })).toBeNull();
  });
  it("el día parcial es de un solo día, con horas, y nunca vacaciones", () => {
    const p = { ...base, tipo: "permiso" as const, desde: "2026-11-25", hasta: "2026-11-25", parcial: true, horaDesde: "08:00", horaHasta: "10:00" };
    expect(validarSolicitud(p)).toBeNull();
    expect(validarSolicitud({ ...p, horaHasta: "07:00" })).toBe("fechas");
    expect(validarSolicitud({ ...p, hasta: "2026-11-26" })).toBe("fechas");
    expect(validarSolicitud({ ...p, tipo: "vacaciones" })).toBe("fechas");
  });
});

describe("asistencia", () => {
  const fila = (estado: FilaAsistencia["estado"], dia = "2026-12-14"): FilaAsistencia => ({
    user_id: estado + dia, nombre: estado, avatar_url: null, avatar_seed: null, equipo: null, dia, turno_inicio: null, turno_fin: null,
    estado, entrada_at: null, tarde_min: null, trabajado_min: null, turno_min: null, ausencia_id: null, ausencia_tipo: null,
    ausencia_estado: null, ausencia_pagada: null, ausencia_parcial: null, festivo: null, en_vivo: null,
  });
  it("el resumen del día: tarde también cuenta como presente", () => {
    const r = resumirDia([fila("presente"), fila("tarde"), fila("falto"), fila("sin_entrada"), fila("ausente"), fila("descanso")]);
    expect(r).toEqual({ presentes: 2, tarde: 1, faltaron: 2, fuera: 1, total: 6 });
  });
  it("cobertura del mes: solo los ausentes, por día", () => {
    const m = fueraPorDia([fila("ausente", "2026-12-14"), fila("presente", "2026-12-14"), fila("ausente", "2026-12-15")]);
    expect(m.get("2026-12-14")?.length).toBe(1);
    expect(m.get("2026-12-15")?.length).toBe(1);
  });
});

describe("durante una ausencia nadie mira (cliente)", () => {
  const t = { aplica: true, obligatorio: true, abierta: true, turno_inicio: null, turno_fin: null };
  it("ausente → fuera de turno aunque tenga la entrada marcada", () => {
    expect(calcularEnTurno(t, Date.now())).toBe(true);
    expect(calcularEnTurno({ ...t, ausente: true }, Date.now())).toBe(false);
    expect(calcularEnTurno({ ...t, aplica: false, ausente: true }, Date.now())).toBe(false);
  });
});
