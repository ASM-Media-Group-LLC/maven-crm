// La medición de por qué se cae la llamada (lib/saludDeLlamada.ts, 11/11/2026).
import { describe, it, expect, beforeEach } from "vitest";
import {
  armarMuestra, borrarLlamadaEnCurso, leerReporte, marcarLlamadaEnCurso, navegadorCorto, recargaConLlamada,
} from "@/lib/saludDeLlamada";

describe("leer lo que WebRTC sabe de la pista que se manda", () => {
  it("cpu le gana a bandwidth: si una capa del simulcast la frena el computador, es el computador", () => {
    const l = leerReporte([
      { type: "outbound-rtp", qualityLimitationReason: "bandwidth", framesPerSecond: 12 },
      { type: "outbound-rtp", qualityLimitationReason: "cpu", framesPerSecond: 3 },
      { type: "candidate-pair", nominated: true, state: "succeeded", currentRoundTripTime: 0.182, availableOutgoingBitrate: 640_000 },
      { type: "remote-inbound-rtp", fractionLost: 0.07 },
    ]);
    expect(l).toEqual({ limite: "cpu", fps: 12, rtt_ms: 182, subida_kbps: 640, perdida_pct: 7 });
  });

  it("sin limitación queda «none» y un par de candidatos que no ganó no cuenta", () => {
    const l = leerReporte([
      { type: "outbound-rtp", qualityLimitationReason: "none" },
      { type: "candidate-pair", nominated: false, state: "succeeded", currentRoundTripTime: 9, availableOutgoingBitrate: 1 },
    ]);
    expect(l.limite).toBe("none");
    expect(l.rtt_ms).toBeNull();
    expect(l.subida_kbps).toBeNull();
  });

  it("la muestra junta cámara, pantalla y micrófono: la peor pérdida y el primer rtt", () => {
    const m = armarMuestra({
      vis: "hidden",
      calidad: "poor",
      cam: { limite: "cpu", fps: 10, rtt_ms: null, subida_kbps: null, perdida_pct: 2 },
      pant: { limite: "bandwidth", fps: 4, rtt_ms: 300, subida_kbps: 500, perdida_pct: 9 },
      mic: { limite: null, fps: null, rtt_ms: 290, subida_kbps: 520, perdida_pct: 1 },
      lag_ms: 4200,
    });
    expect(m).toMatchObject({
      vis: "hidden", calidad: "poor", rtt_ms: 290, subida_kbps: 520, perdida_pct: 9,
      limite_cam: "cpu", limite_pant: "bandwidth", fps_pant: 4, lag_ms: 4200, cam: true, pant: true,
    });
  });

  it("el navegador queda corto y legible", () => {
    expect(navegadorCorto("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toBe("Chrome 141 · Windows");
    expect(navegadorCorto("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge 140 · Windows");
  });
});

describe("una llamada que murió con la página", () => {
  beforeEach(() => { sessionStorage.clear(); });

  it("si la pestaña se recargó con la llamada andando, se sabe qué sala era (una sola vez)", () => {
    marcarLlamadaEnCurso("cowork_x");
    const r = recargaConLlamada();
    expect(r?.sala).toBe("cowork_x");
    expect(r?.hace_s).toBeLessThan(5);
    expect(recargaConLlamada()).toBeNull();
  });

  it("colgar a propósito borra la marca: entrar después no cuenta como recarga", () => {
    marcarLlamadaEnCurso("cowork_x");
    borrarLlamadaEnCurso();
    expect(recargaConLlamada()).toBeNull();
  });
});
