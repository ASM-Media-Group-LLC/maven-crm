import { describe, it, expect, vi } from "vitest";

vi.mock("livekit-client", () => ({
  Room: vi.fn(), RoomEvent: {}, ConnectionState: {}, ConnectionQuality: {}, DisconnectReason: {},
  Track: { Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen_share" } },
  ParticipantEvent: {}, createLocalTracks: vi.fn(), LocalTrack: class {}, LocalVideoTrack: class {}, RemoteTrack: class {},
  VideoPresets: { h1080: { resolution: { width: 1920, height: 1080 } }, h720: { resolution: { width: 1280, height: 720 } }, h180: {}, h360: {} },
}));

import { tilesDeParticipante, type LKParticipant } from "@/hooks/useLiveKit";

const persona = (o: Partial<LKParticipant>): LKParticipant => ({
  identity: "alvaro", sid: "PA_1", name: "Alvaro", isLocal: false, isSpeaking: false, isMuted: true,
  isCameraOff: true, isScreenSharing: false, hasVideoTrack: false, connectionQuality: "excellent",
  ...o,
} as LKParticipant);

describe("tilesDeParticipante — quien comparte pantalla no desaparece de la lista", () => {
  it("sin compartir: un solo tile", () => {
    expect(tilesDeParticipante(persona({}), false, false)).toHaveLength(1);
  });
  it("comparte CON cámara: pantalla + persona con video", () => {
    const t = tilesDeParticipante(persona({ isScreenSharing: true, isCameraOff: false }), true, true);
    expect(t.map((x) => x.sid)).toEqual(["PA_1-screen", "PA_1"]);
    expect(t[0].esTileDePantalla).toBe(true);
    expect(t[1].isScreenSharing).toBe(false);
    expect(t[1].hasVideoTrack).toBe(true);
  });
  it("comparte SIN cámara (el caso de Álvaro): igual dos tiles, la persona con avatar", () => {
    const t = tilesDeParticipante(persona({ isScreenSharing: true, isCameraOff: true }), true, false);
    expect(t).toHaveLength(2);
    expect(t[1]).toMatchObject({ sid: "PA_1", isScreenSharing: false, isCameraOff: true, hasVideoTrack: false });
    expect(t[1].esTileDePantalla).toBeFalsy();
  });
});
