import { describe, it, expect } from "vitest";
import {
  alfaPorColor, confianzaDelColor, pesoDeFranja, alfaFinal, colorDePersona,
  personaFusionada, cercaDelContorno, tocaMulticlase,
  SUBIDA_MAX_DEL_COLOR, FUERZA_DEL_MATE, BAJADA_MAX_DEL_COLOR, PERSONA_SEGURA, CADA_CUANTOS_MULTICLASE, FUSION_POR_DEFECTO,
} from "@/lib/fondoFino/parametros";

// El borde por color del fondo fino (17/11/2026, noche): los huecos del pelo
// esponjado dejaban ver la pared vieja encima del fondo nuevo. Y el multiclase
// como ayuda: nunca puede borrar persona (con poca luz se comía la cabeza).

type RGB = readonly [number, number, number];
const PELO: RGB = [0.1, 0.08, 0.07];
const PARED: RGB = [0.85, 0.82, 0.78];
const OSCURO: RGB = [0.12, 0.1, 0.09];
const mitad = (x: RGB, y: RGB): RGB => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2];

describe("borde por color", () => {
  it("un píxel con color de pared es fondo y uno con color de pelo es persona", () => {
    expect(alfaPorColor(PARED, PELO, PARED)).toBeCloseTo(0, 5);
    expect(alfaPorColor(PELO, PELO, PARED)).toBeCloseTo(1, 5);
    expect(alfaPorColor(mitad(PELO, PARED), PELO, PARED)).toBeCloseTo(0.5, 5);
  });

  it("con poca luz (pelo oscuro contra pared oscura) no se confía en el color", () => {
    expect(confianzaDelColor(PELO, OSCURO)).toBe(0);
    expect(confianzaDelColor(PELO, PARED)).toBe(1);
    // Sin confianza manda la máscara: no puede comerse la cabeza.
    expect(alfaFinal(1, 1, OSCURO, PELO, OSCURO, 1)).toBe(1);
  });

  it("solo actúa en la franja del borde (adentro de la persona o lejos, nada)", () => {
    expect(pesoDeFranja(1, 0)).toBe(0);
    expect(pesoDeFranja(0, 1)).toBe(0);
    expect(pesoDeFranja(0.5, 0.5)).toBe(1);
    expect(alfaFinal(1, 1, PARED, PELO, PARED, 0)).toBe(1);
  });

  it("saca la pared de un hueco del pelo donde la máscara duda, con tope", () => {
    // Máscara insegura (0,3) con «a» 0,8 y color de pared: baja, pero como
    // mucho BAJADA_MAX_DEL_COLOR (antes sin límite: titilaba y se comía caras).
    // 19/11/2026: solo donde el detector DUDA (< MASCARA_SIN_BAJADA); con 0,7
    // ya lo ve como persona y el color no baja (el pelo oscuro se comía).
    const a = alfaFinal(0.8, 0.3, PARED, PELO, PARED, 1);
    expect(a).toBeLessThan(0.8 - 0.3);
    expect(a).toBeGreaterThanOrEqual(0.8 - BAJADA_MAX_DEL_COLOR - 1e-9);
    expect(alfaFinal(0.8, 0.7, PARED, PELO, PARED, 1)).toBeCloseTo(0.8, 5);
  });

  it("donde la máscara está SEGURA de que es persona, el color no borra nada (18/11)", () => {
    // La cara o la mano con un color parecido a la pared: antes quedaba en
    // 1 − FUERZA_DEL_MATE (la cara borrada en el borde). Ahora se queda.
    expect(alfaFinal(1, 1, PARED, PELO, PARED, 1)).toBe(1);
    expect(alfaFinal(1, PERSONA_SEGURA.hasta, PARED, PELO, PARED, 1)).toBe(1);
    expect(FUERZA_DEL_MATE).toBeGreaterThan(0);
  });

  it("sube persona por color poco y solo donde la máscara ya ve algo", () => {
    // Una sombra oscura junto al pelo, donde la máscara dice fondo puro: nada.
    expect(alfaFinal(0, 0, PELO, PELO, PARED, 1)).toBe(0);
    // Donde la máscara ve algo de persona, sube como mucho SUBIDA_MAX_DEL_COLOR.
    expect(alfaFinal(0.3, 0.5, PELO, PELO, PARED, 1)).toBeLessThanOrEqual(0.3 + SUBIDA_MAX_DEL_COLOR + 1e-9);
  });

  it("el color de la persona en el borde sale sin la pared vieja", () => {
    const i = mitad(PELO, PARED);
    // Mitad pelo, mitad pared: despejado da el pelo.
    colorDePersona(i, PELO, PARED, 0.5, 1).forEach((v, k) => expect(v).toBeCloseTo(PELO[k], 5));
    // Fuera de la franja es la cámara tal cual.
    colorDePersona(i, PELO, PARED, 0.5, 0).forEach((v, k) => expect(v).toBeCloseTo(i[k], 5));
    colorDePersona(PELO, PELO, PARED, 1, 1).forEach((v, k) => expect(v).toBeCloseTo(PELO[k], 5));
  });
});

describe("el multiclase como ayuda", () => {
  it("solo SUMA persona: si se equivoca para menos, manda el liviano", () => {
    expect(personaFusionada(0.95, 0, 1)).toBe(0.95);
    expect(personaFusionada(0.4, 0.9, 1)).toBe(0.9);
  });

  it("solo cerca del contorno del liviano: lejos no agrega nada", () => {
    expect(cercaDelContorno(0)).toBe(0);
    expect(cercaDelContorno(1)).toBe(1);
    expect(personaFusionada(0, 0.9, cercaDelContorno(0.1))).toBe(0);
  });

  it("corre uno de cada CADA_CUANTOS_MULTICLASE cuadros", () => {
    const tocan = Array.from({ length: 12 }, (_, c) => tocaMulticlase(c)).filter(Boolean).length;
    expect(tocan).toBe(12 / CADA_CUANTOS_MULTICLASE);
    expect(tocaMulticlase(0)).toBe(false);
    expect(tocaMulticlase(5, 1)).toBe(true);
  });

  it("queda apagado por defecto (no mejoró el borde y cuesta cuadros)", () => {
    expect(FUSION_POR_DEFECTO).toBe(false);
  });
});
