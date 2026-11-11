// Cuándo se le pregunta a la IA por la cámara (lib/ojoDeIA.ts, 11/11/2026).
import { describe, it, expect } from "vitest";
import { debePreguntarIA, IA_DE_RUTINA_MS, CAMBIO_RECIENTE_MS } from "@/lib/ojoDeIA";

const AHORA = 1_000_000_000;

describe("la IA de la cámara solo cuando algo se ve raro", () => {
  it("todo quieto y le preguntó hace 1 minuto: NO pregunta", () => {
    expect(debePreguntarIA({ apretado: false, caraCambio: AHORA - 30 * 60_000, ultimaIA: AHORA - 60_000, ahora: AHORA })).toBe(false);
  });
  it("la cara cambió hace un momento (se fue y volvió): pregunta", () => {
    expect(debePreguntarIA({ apretado: false, caraCambio: AHORA - 20_000, ultimaIA: AHORA - 60_000, ahora: AHORA })).toBe(true);
  });
  it("ya hubo una falta (escalera apretada): pregunta a su ritmo", () => {
    expect(debePreguntarIA({ apretado: true, caraCambio: AHORA - 30 * 60_000, ultimaIA: AHORA - 10_000, ahora: AHORA })).toBe(true);
  });
  it("todo quieto pero pasaron 10 minutos: revisión de rutina", () => {
    expect(debePreguntarIA({ apretado: false, caraCambio: AHORA - 30 * 60_000, ultimaIA: AHORA - IA_DE_RUTINA_MS, ahora: AHORA })).toBe(true);
  });
  it("la primera vez (nunca preguntó) sí pregunta", () => {
    expect(debePreguntarIA({ apretado: false, caraCambio: AHORA - CAMBIO_RECIENTE_MS - 1, ultimaIA: 0, ahora: AHORA })).toBe(true);
  });
  it("una hora quieta son 6 preguntas, no 60", () => {
    let ultima = 0, preguntas = 0;
    for (let t = AHORA; t < AHORA + 60 * 60_000; t += 60_000) {
      if (debePreguntarIA({ apretado: false, caraCambio: AHORA - 60 * 60_000, ultimaIA: ultima, ahora: t })) { preguntas++; ultima = t; }
    }
    expect(preguntas).toBe(6);
  });
});
