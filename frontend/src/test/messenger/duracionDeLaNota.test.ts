// De dónde sale la duración de una nota de voz.
//
// No sale del archivo: el .webm de MediaRecorder NO trae el elemento Duration
// (verificado sobre archivos reales de producción), así que el reproductor
// nativo no puede dibujar el progreso. La sacamos del nombre para las notas
// nuevas y del texto del mensaje para las viejas.
//
// Estos casos existen porque si el parseo devuelve 0, la barra vuelve a quedarse
// clavada — que es exactamente el bug que se reportó.

import { describe, it, expect } from "vitest";
import { duracionDeLaNota } from "@/pages/messenger/components/NotaDeVoz";

describe("duracionDeLaNota", () => {
  it("la lee del nombre de las notas nuevas", () => {
    expect(duracionDeLaNota("voice-note-1788672654120-62s.webm", null)).toBe(62);
    expect(duracionDeLaNota("voice-note-1-9s.ogg", null)).toBe(9);
  });

  it("el nombre gana sobre el texto", () => {
    expect(duracionDeLaNota("voice-note-1-62s.webm", "🎤 Nota de voz (0:18)")).toBe(62);
  });

  it("cae al texto en las notas viejas, que no traen los segundos en el nombre", () => {
    expect(duracionDeLaNota("voice-note-1788290487535.webm", "🎤 Nota de voz (0:21)")).toBe(21);
    expect(duracionDeLaNota("voice-note-1.webm", "🎤 Nota de voz (1:02)")).toBe(62);
    expect(duracionDeLaNota("voice-note-1.webm", "🎤 Nota de voz (10:05)")).toBe(605);
  });

  it("devuelve 0 cuando no hay forma de saberlo", () => {
    expect(duracionDeLaNota("audio.webm", "un audio cualquiera")).toBe(0);
    expect(duracionDeLaNota(null, null)).toBe(0);
    expect(duracionDeLaNota(undefined, undefined)).toBe(0);
  });

  it("no confunde el timestamp del nombre con la duración", () => {
    // "1788672654120" NO termina en `<n>s`, así que no debe leerse como segundos.
    expect(duracionDeLaNota("voice-note-1788672654120.webm", null)).toBe(0);
  });

  it("no toma cualquier paréntesis con números como duración", () => {
    // Los segundos van de 00 a 59: "(1:75)" no es una hora válida.
    expect(duracionDeLaNota(null, "algo (1:75) raro")).toBe(0);
  });
});
