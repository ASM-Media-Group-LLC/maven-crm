// Correo del descuento del día (minutos de gracia, Alvaro 16/11/2026).
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { asuntoGracia, correoGraciaHTML, excesos, fechaCorta, formatoMin, type CierreGracia } from "./correo-gracia.ts";

const base: CierreGracia = {
  user_id: "u1",
  turno: "2026-11-16",
  nombre: "Daniel Duque",
  rol: "closer",
  inicio: "2026-11-16T15:00:00Z",
  fin: "2026-11-17T00:00:00Z",
  conectado_min: 480,
  trabajo_min: 400,
  pausa_min: 30,
  sin_pantalla_min: 20,
  sin_camara_min: 30,
  gracia_pantalla_min: 15,
  gracia_camara_min: 15,
  extra_pantalla_min: 0,
  extra_camara_min: 0,
  descuento_min: 20,
  a_pagar_min: 430,
  ensayo: false,
  es_correccion: false,
  motivos: null,
  destinatarios: [],
};

Deno.test("formatoMin: minutos y horas", () => {
  assertEquals(formatoMin(0), "0 min");
  assertEquals(formatoMin(45), "45 min");
  assertEquals(formatoMin(60), "1 h");
  assertEquals(formatoMin(425), "7 h 05 min");
  assertEquals(formatoMin(-3), "0 min");
});

Deno.test("excesos: lo que pasa de cada gracia, por separado", () => {
  assertEquals(excesos(base), { pantalla: 5, camara: 15 });
  assertEquals(excesos({ ...base, sin_pantalla_min: 10, sin_camara_min: 15 }), { pantalla: 0, camara: 0 });
});

Deno.test("fechaCorta: día de la semana en español", () => {
  assertEquals(fechaCorta("2026-11-16"), "lun 16 nov");
  assertEquals(fechaCorta("2026-11-22"), "dom 22 nov");
});

Deno.test("asunto: normal, ensayo y corrección", () => {
  assertEquals(asuntoGracia(base), "Descuento del día — Daniel Duque (lun 16 nov): 20 min");
  assertEquals(asuntoGracia({ ...base, ensayo: true }), "Ensayo · Descuento del día — Daniel Duque (lun 16 nov): 20 min");
  assertEquals(asuntoGracia({ ...base, es_correccion: true, descuento_min: 0 }), "Corrección del descuento — Daniel Duque (lun 16 nov): sin descuento");
  assertEquals(asuntoGracia({ ...base, es_correccion: true, descuento_min: 5 }), "Corrección del descuento — Daniel Duque (lun 16 nov): ahora 5 min");
});

Deno.test("correo: en ensayo dice que no se descuenta", () => {
  const html = correoGraciaHTML({ ...base, ensayo: true });
  assertStringIncludes(html, "Ensayo · esta semana no se descuenta");
  assertStringIncludes(html, "no se aplica");
  assertStringIncludes(html, "10:00–19:00");
  assertStringIncludes(html, "7 h 10 min"); // a pagar
});

Deno.test("correo: corrección con el motivo de RR. HH. y la gracia extra", () => {
  const html = correoGraciaHTML({ ...base, es_correccion: true, extra_camara_min: 30, gracia_camara_min: 45, descuento_min: 5, motivos: "Se dañó la cámara" });
  assertStringIncludes(html, "Corrección");
  assertStringIncludes(html, "Se dañó la cámara");
  assertStringIncludes(html, "incluye 30 de RR. HH.");
});

Deno.test("correo: escapa el nombre", () => {
  const html = correoGraciaHTML({ ...base, nombre: "<b>X</b>" });
  assertEquals(html.includes("<b>X</b>"), false);
});
