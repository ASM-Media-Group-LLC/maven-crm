import { describe, expect, it } from "vitest";
import { anotarTransporte, esRedBloqueada, leerTransporte, porRedBloqueada } from "@/lib/redBloqueada";
import { CAMARA_LIVIANA, topesLivianos } from "@/lib/perfilDeCamara";

// 19/11/2026: con UDP bloqueado (wifi corporativo/público) la llamada se pasa a
// TCP y el video se congela 71 a 110 veces en 5 minutos. Por TCP, la cámara se
// manda topada a 360p y las ajenas se piden en la capa media.

const fuentes = import.meta.glob(["../../hooks/useLiveKit.ts", "../../pages/messenger/videocall/LiveKitCallView.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const livekit = fuentes["../../hooks/useLiveKit.ts"];
const vista = fuentes["../../pages/messenger/videocall/LiveKitCallView.tsx"];

/** Un getStats como el de Chrome: transport → par elegido → candidato local. */
function reporte(local: Record<string, unknown>, conTransport = true) {
  return [
    ...(conTransport ? [{ type: "transport", id: "T1", selectedCandidatePairId: "CP1" }] : []),
    { type: "candidate-pair", id: "CP0", localCandidateId: "L0", state: "failed", nominated: false },
    { type: "candidate-pair", id: "CP1", localCandidateId: "L1", state: "succeeded", nominated: true },
    { type: "local-candidate", id: "L0", candidateType: "host", protocol: "udp" },
    { type: "local-candidate", id: "L1", ...local },
  ];
}

describe("de qué transporte va la llamada", () => {
  it("UDP directo: no está bloqueada", () => {
    const t = leerTransporte(reporte({ candidateType: "srflx", protocol: "udp" }));
    expect(t).toBe("udp");
    expect(esRedBloqueada(t)).toBe(false);
  });

  it("ICE por TCP al 7881 (lo medido en el wifi que bloquea UDP): bloqueada", () => {
    const t = leerTransporte(reporte({ candidateType: "host", protocol: "tcp" }));
    expect(t).toBe("tcp");
    expect(esRedBloqueada(t)).toBe(true);
  });

  it("relé TURN: por UDP no cuenta, por TCP o TLS sí", () => {
    expect(leerTransporte(reporte({ candidateType: "relay", protocol: "udp", relayProtocol: "udp" }))).toBe("relay-udp");
    expect(esRedBloqueada("relay-udp")).toBe(false);
    expect(leerTransporte(reporte({ candidateType: "relay", protocol: "udp", relayProtocol: "tls" }))).toBe("relay-tls");
    expect(esRedBloqueada("relay-tls")).toBe(true);
    expect(esRedBloqueada("relay-tcp")).toBe(true);
  });

  it("sin fila transport (Firefox) usa el par nominado y exitoso", () => {
    expect(leerTransporte(reporte({ candidateType: "host", protocol: "tcp" }, false))).toBe("tcp");
  });

  it("sin par todavía: no se sabe (null), no se topa nada", () => {
    expect(leerTransporte([{ type: "outbound-rtp", id: "O1" }])).toBeNull();
    expect(esRedBloqueada(null)).toBe(false);
  });

  it("el estado avisa solo cuando cambia bloqueada sí/no", () => {
    anotarTransporte(null);
    expect(anotarTransporte("udp")).toBe(false);
    expect(anotarTransporte("tcp")).toBe(true);
    expect(porRedBloqueada()).toBe(true);
    expect(anotarTransporte("relay-tls")).toBe(false);
    expect(anotarTransporte("udp")).toBe(true);
    expect(porRedBloqueada()).toBe(false);
    anotarTransporte(null);
  });
});

describe("por TCP el video va chico (guardas del código)", () => {
  it("la cámara HD (1080p, 3 Mbps) queda a 360p y ≤350 kbps arriba", () => {
    const hd = [{ scaleResolutionDownBy: 3, maxBitrate: 450_000 }, { scaleResolutionDownBy: 1.5, maxBitrate: 1_700_000 }, { scaleResolutionDownBy: 1, maxBitrate: 3_000_000, maxFramerate: 30 }];
    const topes = topesLivianos(hd, 1080, false);
    const arriba = topes[topes.length - 1];
    expect(1080 / (arriba.scaleResolutionDownBy ?? 1)).toBeLessThanOrEqual(360);
    expect(arriba.maxBitrate).toBeLessThanOrEqual(CAMARA_LIVIANA.alta.maxBitrate);
  });

  it("aplicarCamara topa con porRedBloqueada aunque la sala sea HD", () => {
    expect(livekit).toMatch(/const camaraLiviana[^;]+\|\| porRedBloqueada\(\);/);
  });

  it("el transporte se mira al conectar y seguido, y al cambiar se reaplica la cámara", () => {
    expect(livekit).toMatch(/setTimeout\(\(\) => \{ void mirarTransporte\(\); \}, PRIMERA_MIRADA_MS\)/);
    expect(livekit).toMatch(/setInterval\(\(\) => \{ void mirarTransporte\(\); \}, MIRAR_TRANSPORTE_CADA_MS\)/);
    expect(livekit).toMatch(/if \(anotarTransporte\(t\)\) \{\s*console\.info\([^\n]*\);\s*void aplicarCamara\(\);/);
    expect(livekit).toMatch(/clearInterval\(vigiaTransporte\)/);
  });

  it("la muestra de salud anota el transporte (para medir antes/después)", () => {
    expect(livekit).toMatch(/transporte: transporteDeLaLlamada\(\)/);
  });

  it("las cámaras ajenas se piden como mucho en la capa media por TCP", () => {
    expect(vista).toContain("modoLivianoActivo() && calidad === VideoQuality.HIGH ? VideoQuality.MEDIUM : calidad");
    expect(vista).toContain("pub.setVideoQuality(porRedBloqueada() && conTope === VideoQuality.HIGH ? VideoQuality.MEDIUM : conTope)");
  });
});
