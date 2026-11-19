import { describe, expect, it } from "vitest";

// Alvaro, 19/11/2026: «el que habla va cambiando… visualmente te cansa, quita
// eso» → vista fija como Meet en mosaico; tu pantalla como «Estás presentando»
// sin video; y la cámara que se cae sola se repara o dice por qué.
const vista = import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true });
const tile = import.meta.glob("../../pages/messenger/videocall/ParticipantTile.tsx", { query: "?raw", import: "default", eager: true });
const pip = import.meta.glob("../../pages/messenger/videocall/useAutoPiP.ts", { query: "?raw", import: "default", eager: true });
const hook = import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

describe("vista fija, como Meet en mosaico", () => {
  it("el escenario no sigue al que habla", () => {
    const s = fuente(vista);
    expect(s).not.toContain("p.identity === lk.activeSpeaker");
    expect(s).toContain("|| visibleParticipants.find((p) => !p.isLocal && noEsMiPantalla(p))");
  });
  it("tu propia pantalla no cambia la vista ni ocupa un recuadro", () => {
    const s = fuente(vista);
    expect(s).toContain('lk.participants.some((p) => p.isScreenSharing && !p.isLocal) ? "sidebar" : "grid"');
    expect(s).toContain("lk.participants.filter((p) => !(p.isLocal && p.isScreenSharing))");
  });
  it("quien habla: borde verde, sin moverse", () => {
    expect(fuente(tile)).toContain('participant.isSpeaking && "ring-2 ring-emerald-400');
  });
  it("la ventanita flotante tampoco elige por quién habla ni muestra tu pantalla", () => {
    const s = fuente(pip);
    expect(s).not.toContain("activeSpeakers");
    expect(s).not.toContain("trackOf(room.localParticipant, Track.Source.ScreenShare)");
  });
});

describe("la cámara que se cae sola", () => {
  it("hay vigilante, cartel con la causa y botón Reintentar", () => {
    const h = fuente(hook);
    expect(h).toContain("decidirRepararCamara(");
    expect(h).toContain("quiereCamaraRef.current = false;");
    expect(h).toContain("falloDeCamara,");
    expect(h).toContain("reintentarCamara,");
    const s = fuente(vista);
    expect(s).toContain("{lk.falloDeCamara && !estaEnPausa() && (");
    expect(s).toContain("onClick={() => void lk.reintentarCamara()}");
  });
});
