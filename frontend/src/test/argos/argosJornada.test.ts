import { describe, it, expect } from "vitest";
import {
  bandaDelDia, calcularJornada, lunesDe, minutos, promedioDelEquipo, razonesDelDia, semanaDe, ventanaDelTurno,
  type PersonaCruda,
} from "@/lib/argosJornada";

// GUARDA de «Argos minuto a minuto» (Alvaro, 11/11/2026: «desde el clock in
// contabilizamos cada minuto»). El caso base es el día REAL de una persona del
// equipo de Warming el 11/11 (lo crudo, tal como lo devolvió la base):
// horario 9:00 → 19:00, entró 9:01, trabajó hasta 10:12, salió 8 min, volvió
// hasta 10:37 y no regresó (dos latidos sueltos a la 1 p. m.). La pantalla vieja
// decía nota 33, pantalla 16 %, cámara 16 % y «salió 342 min antes».

const LIMITES = { bano: 600, break: 1800, almuerzo: 1800 };
const FIN_DEL_DIA = Date.parse("2026-11-12T02:38:57Z"); // 9:38 p. m. de Bogotá

const isabel: PersonaCruda = {
  id: "85726405-3037-456a-9af2-c167f707237a",
  nombre: "Isabel Tuiran",
  objetivo: true,
  entrada: "09:00:00",
  salida: "19:00:00",
  exento: false,
  segmentos: [
    ["activo", "2026-11-11T14:01:37.502+00:00", "2026-11-11T15:12:52.573+00:00"],
    ["sin_camara", "2026-11-11T15:20:13.213+00:00", "2026-11-11T15:20:43.59+00:00"],
    ["activo", "2026-11-11T15:20:51.254+00:00", "2026-11-11T15:37:44.303+00:00"],
    ["sin_camara", "2026-11-11T18:18:04.31+00:00", "2026-11-11T18:18:34.231+00:00"],
  ],
  pausas: [],
  fuera: [
    ["2026-11-11T15:12:52.573+00:00", "2026-11-11T15:21:00.101996+00:00"],
    ["2026-11-11T15:37:44.303+00:00", "2026-11-11T18:00:00.228589+00:00"],
    ["2026-11-11T18:00:46.773+00:00", "2026-11-11T18:19:00.079831+00:00"],
    ["2026-11-11T18:19:00.079831+00:00", "2026-11-12T00:00:00+00:00"],
  ],
  flojas: [],
  alertas: [],
};

describe("el turno de Isabel el 11/11, minuto a minuto (datos reales)", () => {
  const j = calcularJornada(isabel, "2026-11-11", LIMITES, FIN_DEL_DIA);

  it("la barra va de la hora de entrada a la de salida de su horario", () => {
    expect(j.conHorario).toBe(true);
    expect(new Date(j.inicio).toISOString()).toBe("2026-11-11T14:00:00.000Z");
    expect(new Date(j.fin).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(j.enCurso).toBe(false);
  });

  it("cada minuto del turno cae en un estado (600 en total)", () => {
    const total = Object.values(j.seg).reduce((a, b) => a + b, 0);
    expect(total).toBe(600 * 60);
    expect(j.seg.pendiente).toBe(0);
  });

  it("los minutos: 88 bien, 1 sin cámara, 2 sin entrar, 168 fuera de Cowork y 341 que se fue antes", () => {
    expect(minutos(j.seg.bien)).toBe(88);
    expect(minutos(j.seg.sin_camara)).toBe(1);
    expect(minutos(j.seg.no_entro)).toBe(2);
    expect(minutos(j.seg.fuera_cowork)).toBe(168);
    expect(minutos(j.seg.se_fue)).toBe(341);
    expect(j.seg.sin_pantalla + j.seg.pausa + j.seg.distraido).toBe(0);
  });

  it("cuadra con lo que decía la nota: compartió pantalla 16 % del turno y cámara 16 %", () => {
    // La nota mide sobre la jornada menos la pausa libre (10 h − 40 min).
    const denom = 10 * 3600 - 40 * 60;
    const pantalla = (j.seg.bien + j.seg.sin_camara + j.seg.fuera_de_camara + j.seg.distraido) / denom;
    const camara = (j.seg.bien + j.seg.sin_pantalla + j.seg.distraido) / denom;
    expect(Math.round(pantalla * 100)).toBe(16);
    expect(Math.round(camara * 100)).toBe(16);
  });

  it("el día es flojo y el porqué va en minutos, de lo más grande a lo más chico", () => {
    expect(bandaDelDia(j)).toBe("flojo");
    expect(Math.round((j.pctBien ?? 0) * 100)).toBe(15);
    const r = razonesDelDia(j);
    expect(r[0]).toMatchObject({ estado: "se_fue", min: 341 });
    expect(r[1]).toMatchObject({ estado: "fuera_cowork", min: 168, veces: 2 });
    expect(r.map((x) => x.estado)).toEqual(["se_fue", "fuera_cowork", "no_entro", "sin_camara"]);
  });

  it("entró 9:01 y su última señal fue 1:18 p. m.", () => {
    expect(new Date(j.entro!).toISOString().slice(11, 16)).toBe("14:01");
    expect(new Date(j.salio!).toISOString().slice(11, 16)).toBe("18:18");
  });

  it("fallas: 2 salidas de Cowork (8 min y 160 min); los 30 s sin cámara no son falla", () => {
    expect(j.fallas.map((f) => [f.estado, minutos(f.seg)])).toEqual([["fuera_cowork", 7], ["fuera_cowork", 160]]);
    expect(j.cadaMin).toBe(Math.round((j.salio! - j.entro!) / 60_000 / 2));
  });

  it("hora por hora: la de 9 fue productiva; de 10 en adelante no", () => {
    expect(j.horas).toHaveLength(10);
    expect(j.horas[0].productiva).toBe(true);
    expect(Math.round((j.horas[0].pctBien ?? 0) * 100)).toBe(97); // entró 9:01:37
    expect(j.horas[1].productiva).toBe(false);
    expect(j.horas.slice(1).every((h) => h.productiva === false)).toBe(true);
    expect(j.horasProductivas).toBe(1);
    expect(j.horas[1].fallas).toHaveLength(2);
  });
});

describe("las reglas", () => {
  const base = (extra: Partial<PersonaCruda>): PersonaCruda => ({
    id: "x", nombre: "X", objetivo: true, entrada: "08:00", salida: "10:00", exento: false,
    segmentos: [], pausas: [], fuera: [], flojas: [], alertas: [], ...extra,
  });
  const iso = (hhmm: string) => `2026-11-10T${hhmm}:00-05:00`;
  const AHORA = Date.parse("2026-11-11T12:00:00-05:00");

  it("el almuerzo dentro del tiempo no cuenta en contra; lo que se pasa sí, y es falla", () => {
    const j = calcularJornada(base({
      segmentos: [["activo", iso("08:00"), iso("09:00")], ["activo", iso("09:40"), iso("10:00")]],
      pausas: [["almuerzo", iso("09:00"), iso("09:40")]],
    }), "2026-11-10", LIMITES, AHORA);
    expect(minutos(j.seg.pausa)).toBe(30);
    expect(minutos(j.seg.pausa_de_mas)).toBe(10);
    expect(j.fallas.map((f) => f.estado)).toEqual(["pausa_de_mas"]);
    // 80 min bien de 90 que se le podían pedir (120 − 30 de almuerzo).
    expect(Math.round((j.pctBien ?? 0) * 100)).toBe(89);
  });

  it("el baño es un cupo del día: el segundo baño se come lo que quedó", () => {
    const j = calcularJornada(base({
      segmentos: [["activo", iso("08:00"), iso("10:00")]],
      pausas: [["bano", iso("08:10"), iso("08:18")], ["bano", iso("09:00"), iso("09:05")]],
    }), "2026-11-10", LIMITES, AHORA);
    expect(minutos(j.seg.pausa)).toBe(10);
    expect(minutos(j.seg.pausa_de_mas)).toBe(3);
  });

  it("si Argos lo vio en otra cosa, esos minutos no son «bien»; perdonado ya ni llega", () => {
    const j = calcularJornada(base({
      segmentos: [["activo", iso("08:00"), iso("10:00")]],
      flojas: [[iso("08:30"), iso("08:34")]],
      alertas: [["celular", iso("09:00"), iso("09:02")]],
    }), "2026-11-10", LIMITES, AHORA);
    expect(minutos(j.seg.distraido)).toBe(6);
    expect(j.fallas).toHaveLength(2);
  });

  it("un hueco de latido corto (≤ 90 s) no es salida; uno largo sí", () => {
    const j = calcularJornada(base({
      segmentos: [["activo", iso("08:00"), iso("08:30")], ["activo", "2026-11-10T08:31:00-05:00", iso("09:00")], ["activo", iso("09:05"), iso("10:00")]],
    }), "2026-11-10", LIMITES, AHORA);
    expect(minutos(j.seg.fuera_cowork)).toBe(5);
    expect(j.fallas).toHaveLength(1);
  });

  it("un corte de menos de 1 minuto suma minutos pero no es falla", () => {
    const j = calcularJornada(base({
      segmentos: [["activo", iso("08:00"), iso("09:00")], ["sin_pantalla", iso("09:00"), "2026-11-10T09:00:45-05:00"], ["activo", "2026-11-10T09:00:45-05:00", iso("10:00")]],
    }), "2026-11-10", LIMITES, AHORA);
    expect(j.seg.sin_pantalla).toBe(45);
    expect(j.fallas).toHaveLength(0);
  });

  it("exonerado de cámara y pantalla: esos estados cuentan como trabajo", () => {
    const j = calcularJornada(base({ exento: true, segmentos: [["sin_camara", iso("08:00"), iso("10:00")]] }), "2026-11-10", LIMITES, AHORA);
    expect(minutos(j.seg.bien)).toBe(120);
  });

  it("hoy con el turno en curso: lo que no ha pasado es «pendiente» y después de su última señal es «fuera», no «se fue»", () => {
    const ahora = Date.parse("2026-11-10T09:30:00-05:00");
    const j = calcularJornada(base({ segmentos: [["activo", iso("08:00"), iso("09:00")]] }), "2026-11-10", LIMITES, ahora);
    expect(j.enCurso).toBe(true);
    expect(minutos(j.seg.pendiente)).toBe(30);
    expect(minutos(j.seg.fuera_cowork)).toBe(30);
    expect(j.seg.se_fue).toBe(0);
  });

  it("si no entró en todo el turno, todo es «no había entrado»", () => {
    const j = calcularJornada(base({}), "2026-11-10", LIMITES, AHORA);
    expect(j.sinSenal).toBe(true);
    expect(minutos(j.seg.no_entro)).toBe(120);
  });

  it("los turnos que cruzan la medianoche terminan al día siguiente", () => {
    const v = ventanaDelTurno("2026-11-10", "16:00:00", "00:00:00")!;
    expect(new Date(v.fin).toISOString()).toBe("2026-11-11T05:00:00.000Z");
  });

  it("la semana va de lunes a domingo", () => {
    expect(lunesDe("2026-11-11")).toBe("2026-11-09");
    expect(lunesDe("2026-11-15")).toBe("2026-11-09");
    expect(lunesDe("2026-11-16")).toBe("2026-11-16");
    expect(semanaDe(isabel, "2026-11-09", LIMITES, FIN_DEL_DIA).map((d) => d.fecha)).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
  });

  it("el promedio del equipo es de quienes vinieron", () => {
    const vino = calcularJornada(base({ segmentos: [["activo", iso("08:00"), iso("10:00")]] }), "2026-11-10", LIMITES, AHORA);
    const noVino = calcularJornada(base({}), "2026-11-10", LIMITES, AHORA);
    const p = promedioDelEquipo([vino, noVino])!;
    expect(p.personas).toBe(1);
    expect(p.pctBien).toBe(1);
    expect(promedioDelEquipo([noVino])).toBeNull();
  });
});
