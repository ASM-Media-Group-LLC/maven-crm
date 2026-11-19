import { describe, it, expect } from "vitest";
import { armarAudio, audioMalo, leerAudioRecibido, leerMicrofono } from "@/lib/audioDeLlamada";

// GUARDA del audio de cada minuto (Alvaro, 18/11/2026): si la escuchan y si
// escucha bien. La regla audioMalo es la misma del servidor (llamada_audio_malo).

describe("lectura de getStats", () => {
  it("del micrófono: energía del sonido y pérdida de su voz", () => {
    const r = leerMicrofono([
      { type: "media-source", kind: "audio", totalAudioEnergy: 1.25 },
      { type: "media-source", kind: "video", totalAudioEnergy: 99 },
      { type: "remote-inbound-rtp", kind: "audio", fractionLost: 0.064 },
    ]);
    expect(r).toEqual({ energia: 1.25, perdida_pct: 6.4 });
  });

  it("de lo que recibe: lo rellenado sin contar los silencios", () => {
    expect(leerAudioRecibido([{ type: "inbound-rtp", kind: "audio", concealedSamples: 5000, silentConcealedSamples: 1000, totalSamplesReceived: 96000 }]))
      .toEqual({ ocultas: 4000, recibidas: 96000 });
    expect(leerAudioRecibido([{ type: "inbound-rtp", kind: "video" }])).toBeNull();
  });
});

describe("el minuto", () => {
  const sano = { energia: 10, perdida_pct: 0 };

  it("la primera muestra no puede decir «mudo» por energía (no hay con qué comparar)", () => {
    const { audio } = armarAudio({ abierto: true, crudoMudo: false, mic: sano, recibido: {}, antes: null });
    expect(audio).toEqual({ abierto: true, mudo: false, perdida_pct: 0, oculto_pct: null });
  });

  it("prendido todo el minuto y la energía no subió: mudo", () => {
    const a = armarAudio({ abierto: true, crudoMudo: false, mic: sano, recibido: {}, antes: null });
    const b = armarAudio({ abierto: true, crudoMudo: false, mic: sano, recibido: {}, antes: a.contadores });
    expect(b.audio.mudo).toBe(true);
    expect(audioMalo(b.audio)).toBe(true);
    const c = armarAudio({ abierto: true, crudoMudo: false, mic: { ...sano, energia: 10.2 }, recibido: {}, antes: b.contadores });
    expect(c.audio.mudo).toBe(false);
  });

  it("recién prendido (el minuto anterior estaba apagado) no es mudo; el sistema silenciándolo sí", () => {
    const apagado = armarAudio({ abierto: false, crudoMudo: false, mic: sano, recibido: {}, antes: null });
    expect(armarAudio({ abierto: true, crudoMudo: false, mic: sano, recibido: {}, antes: apagado.contadores }).audio.mudo).toBe(false);
    expect(armarAudio({ abierto: true, crudoMudo: true, mic: sano, recibido: {}, antes: null }).audio.mudo).toBe(true);
    expect(armarAudio({ abierto: false, crudoMudo: true, mic: sano, recibido: {}, antes: null }).audio.mudo).toBe(false);
  });

  it("lo que escucha: solo lo de ESTE minuto y por pista; una pista nueva no cuenta", () => {
    const a = armarAudio({ abierto: false, crudoMudo: false, mic: null, recibido: { x: { ocultas: 100, recibidas: 1000 } }, antes: null });
    const b = armarAudio({
      abierto: false, crudoMudo: false, mic: null,
      recibido: { x: { ocultas: 100 + 9600, recibidas: 1000 + 96000 }, nueva: { ocultas: 50_000, recibidas: 60_000 } },
      antes: a.contadores,
    });
    expect(b.audio.oculto_pct).toBe(10);
    expect(audioMalo(b.audio)).toBe(true);
    // Menos de 1 s de audio: no dice nada.
    const c = armarAudio({ abierto: false, crudoMudo: false, mic: null, recibido: { x: { ocultas: 9700 + 500, recibidas: 97000 + 1000 } }, antes: b.contadores });
    expect(c.audio.oculto_pct).toBeNull();
  });

  it("la regla: su voz perdida cuenta solo con el micro prendido", () => {
    expect(audioMalo({ abierto: true, mudo: false, perdida_pct: 5, oculto_pct: null })).toBe(true);
    expect(audioMalo({ abierto: false, mudo: false, perdida_pct: 30, oculto_pct: null })).toBe(false);
    expect(audioMalo({ abierto: true, mudo: false, perdida_pct: 1, oculto_pct: 7.9 })).toBe(false);
  });
});

describe("la muestra de la llamada lleva el audio", () => {
  const fuente = (import.meta as unknown as { glob: (p: string, o: Record<string, unknown>) => Record<string, string> })
    .glob("/frontend/src/hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true })["/frontend/src/hooks/useLiveKit.ts"];
  it("useLiveKit arma el audio y lo manda en llamada_salud", () => {
    expect(fuente).toContain("armarAudio({");
    expect(fuente).toContain("...(audio ? { audio } : {})");
  });
});
