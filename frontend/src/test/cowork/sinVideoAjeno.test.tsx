// EN SU SALA DE COWORK, EL CHATTER NO RECIBE EL VIDEO DE SUS COMPAÑEROS
// (Alvaro, 13/11/2026; lib/videoAjeno.ts).
//
// Cada chatter descargaba la cámara y la pantalla de TODOS los demás de su sala
// sin mirarlas, y con ~1 Mbps eso le quitaba aire a lo que tiene que subir. Ahora
// el participante oye a todos pero no se suscribe al video de sus compañeros;
// quien supervisa (anfitrión, tablero, Hub, Argos) sigue recibiendo todo.
//
// Lo peligroso de esto es doble y silencioso: si el ajuste se pierde, el chatter
// entra con autoSubscribe apagado y NO OYE A NADIE; si se escapa a otra llamada,
// un supervisor deja de ver a su equipo. Las guardas cuidan las dos puntas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("livekit-client", () => ({
  DisconnectReason: {
    UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, SERVER_SHUTDOWN: 3, PARTICIPANT_REMOVED: 4,
    ROOM_DELETED: 5, STATE_MISMATCH: 6, JOIN_FAILURE: 7, MIGRATION: 8, SIGNAL_CLOSE: 9, ROOM_CLOSED: 10,
    USER_UNAVAILABLE: 11, USER_REJECTED: 12, SIP_TRUNK_FAILURE: 13, CONNECTION_TIMEOUT: 14, MEDIA_FAILURE: 15,
  },
  Room: vi.fn(),
  RoomEvent: {
    ConnectionStateChanged: "connectionStateChanged", ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected", TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed", TrackPublished: "trackPublished", TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted", LocalTrackPublished: "localTrackPublished", LocalTrackUnpublished: "localTrackUnpublished",
    ActiveSpeakersChanged: "activeSpeakersChanged", DataReceived: "dataReceived", Disconnected: "disconnected",
    AudioPlaybackStatusChanged: "audioPlaybackStatusChanged", ConnectionQualityChanged: "connectionQualityChanged",
    Reconnecting: "reconnecting", Reconnected: "reconnected",
  },
  Track: {
    Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen_share", ScreenShareAudio: "screen_share_audio" },
    Kind: { Audio: "audio", Video: "video" },
  },
  ConnectionState: { Disconnected: "disconnected", Connecting: "connecting", Connected: "connected" },
  VideoPresets: { h1080: { resolution: { width: 1920, height: 1080 } }, h720: { resolution: { width: 1280, height: 720 } }, h180: {}, h360: {} },
  ScreenSharePresets: { h720fps5: { width: 1280, height: 720, encoding: { maxBitrate: 800000, maxFramerate: 5 } } },
  ConnectionQuality: { Excellent: 3, Good: 2, Poor: 1, Lost: 0, Unknown: -1 },
  createLocalTracks: vi.fn().mockResolvedValue([]),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));

vi.mock("@/lib/fondoFino/procesador", () => ({
  ProcesadorDeFondo: vi.fn(),
  soportaProcesadorDeFondo: vi.fn().mockReturnValue(false),
  precalentarFondo: vi.fn(async () => true),
  fondoPrecalentado: vi.fn(() => true),
  topeParaPonerFondo: vi.fn((ms: number) => ms),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn(() => ({ insert: () => Promise.resolve({ error: null }) })) },
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "pk",
}));

import { Room } from "livekit-client";
import { renderHook, act } from "@testing-library/react";
import { useLiveKit } from "@/hooks/useLiveKit";
import ParticipantTile from "@/pages/messenger/videocall/ParticipantTile";
import {
  ajustarSuscripciones, esSalaDeTrabajoDeCowork, esSupervisorEnLaSala, seRecibe, soloAudioDeLosCompaneros,
} from "@/lib/videoAjeno";

// ── Una sala de LiveKit de mentira, con compañeros que publican ──────────────

interface PubFalsa {
  kind: string; source: string; trackSid: string; isDesired: boolean; isMuted: boolean;
  isSubscribed: boolean; track: unknown; setSubscribed: ReturnType<typeof vi.fn>;
}

/** autoSubscribe apagado → nada deseado de entrada; prendido → todo deseado. */
function pub(kind: "audio" | "video", source: string, deseada: boolean): PubFalsa {
  const p: PubFalsa = {
    kind, source, trackSid: `${source}-sid`, isDesired: deseada, isMuted: false, isSubscribed: deseada,
    track: deseada ? {} : undefined, setSubscribed: vi.fn(),
  };
  p.setSubscribed.mockImplementation((s: boolean) => { p.isDesired = s; p.isSubscribed = s; p.track = s ? {} : undefined; });
  return p;
}

function persona(identity: string, pubs: PubFalsa[], metadata = "{}") {
  const porFuente = (k: string) => new Map(pubs.filter((p) => p.kind === k).map((p) => [p.trackSid, p]));
  return {
    sid: `sid-${identity}`, identity, name: identity, metadata, isSpeaking: false, connectionQuality: 3,
    trackPublications: new Map(pubs.map((p) => [p.trackSid, p])),
    audioTrackPublications: porFuente("audio"),
    videoTrackPublications: porFuente("video"),
  };
}

function salaFalsa(nombre: string, remotos: ReturnType<typeof persona>[]) {
  const oyentes: Record<string, Array<(...a: unknown[]) => void>> = {};
  const sala = {
    name: nombre,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn((ev: string, cb: (...a: unknown[]) => void) => { (oyentes[ev] ??= []).push(cb); return sala; }),
    once: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    localParticipant: {
      identity: "yo", name: "Yo", sid: "sid-yo", isSpeaking: false, isMicrophoneEnabled: false, isCameraEnabled: false,
      audioTrackPublications: new Map(), videoTrackPublications: new Map(), trackPublications: new Map(),
      connectionQuality: 3, permissions: { canPublish: true, canSubscribe: true }, metadata: "{}",
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn(),
      getTrackPublication: vi.fn().mockReturnValue(undefined),
    },
    remoteParticipants: new Map(remotos.map((r) => [r.identity, r])),
    startAudio: vi.fn().mockResolvedValue(undefined),
    canPlaybackAudio: true,
    state: "connected",
    oyentes,
  };
  return sala;
}

async function conectar(sala: ReturnType<typeof salaFalsa>, isAdmin: boolean, sinVideoAjeno: boolean) {
  // `function` y no flecha: connect() hace `new Room(...)`.
  (Room as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function () { return sala; });
  const hook = renderHook(() => useLiveKit());
  await act(async () => {
    await hook.result.current.connect(sala.name, "Yo", isAdmin, {
      initialMicOn: false, initialCamOn: false, sinVideoAjeno,
      tokenProvider: async () => ({ token: "t", url: "wss://lk.test" }),
    }).catch(() => {});
  });
  return hook;
}

const SALA = "cowork_5a000000_3";

beforeEach(() => { vi.clearAllMocks(); });

describe("qué sala y quién", () => {
  it("solo la sala de TRABAJO de Cowork: ni el Hub, ni un meet, ni una 1:1, ni el Messenger", () => {
    expect(esSalaDeTrabajoDeCowork("cowork_5a000000_3")).toBe(true);
    expect(esSalaDeTrabajoDeCowork("cowork_5a000000_1b2c3d4e")).toBe(true);
    expect(esSalaDeTrabajoDeCowork("cowork_hub_5a000000")).toBe(false);
    expect(esSalaDeTrabajoDeCowork("cowork_meet_5a000000_3b000000")).toBe(false);
    expect(esSalaDeTrabajoDeCowork("cowork_1on1_5a000000_4a000000")).toBe(false);
    expect(esSalaDeTrabajoDeCowork("meet_abc")).toBe(false);
    expect(esSalaDeTrabajoDeCowork("dm_a_b")).toBe(false);
    expect(esSalaDeTrabajoDeCowork(null)).toBe(false);
  });

  it("hacen falta las tres: que la vista lo pida, sin admin, en sala de trabajo", () => {
    expect(soloAudioDeLosCompaneros({ sala: SALA, sinVideoAjeno: true, isAdmin: false })).toBe(true);
    expect(soloAudioDeLosCompaneros({ sala: SALA, sinVideoAjeno: false, isAdmin: false })).toBe(false);
    expect(soloAudioDeLosCompaneros({ sala: SALA, sinVideoAjeno: true, isAdmin: true })).toBe(false);
    expect(soloAudioDeLosCompaneros({ sala: "cowork_meet_5a000000_3b000000", sinVideoAjeno: true, isAdmin: false })).toBe(false);
    expect(soloAudioDeLosCompaneros({ sala: "llamada_123", sinVideoAjeno: true, isAdmin: false })).toBe(false);
  });

  it("el video del supervisor SÍ llega: su transmisión desde el tablero o él entrando como anfitrión", () => {
    expect(esSupervisorEnLaSala({ identity: "u1__monitor__ab12", metadata: "{}" })).toBe(true);
    expect(esSupervisorEnLaSala({ identity: "u1", metadata: JSON.stringify({ name: "Sup", isHost: true }) })).toBe(true);
    expect(esSupervisorEnLaSala({ identity: "u2", metadata: JSON.stringify({ name: "Chatter", isHost: false }) })).toBe(false);
    expect(esSupervisorEnLaSala({ identity: "u3", metadata: "no es json" })).toBe(false);
    expect(esSupervisorEnLaSala({ identity: "u4" })).toBe(false);
  });

  it("todo el audio se recibe siempre; el video del compañero, solo fuera de este modo", () => {
    const companero = { identity: "u2", metadata: "{}" };
    expect(seRecibe({ kind: "audio" }, companero, true)).toBe(true);
    expect(seRecibe({ kind: "video" }, companero, true)).toBe(false);
    expect(seRecibe({ kind: "video" }, companero, false)).toBe(true);
  });
});

describe("ajustarSuscripciones", () => {
  it("participante: se suscribe al audio de todos y al video del supervisor, NUNCA al video de un compañero", () => {
    const mic = pub("audio", "microphone", false);
    const pantAudio = pub("audio", "screen_share_audio", false);
    const cam = pub("video", "camera", false);
    const pant = pub("video", "screen_share", false);
    const camSup = pub("video", "camera", false);
    const sala = salaFalsa(SALA, [persona("chatter-2", [mic, pantAudio, cam, pant]), persona("sup__monitor__x", [camSup])]);
    expect(ajustarSuscripciones(sala as never, true)).toBe(3);
    expect(mic.setSubscribed).toHaveBeenCalledWith(true);
    expect(pantAudio.setSubscribed).toHaveBeenCalledWith(true);
    expect(camSup.setSubscribed).toHaveBeenCalledWith(true);
    expect(cam.setSubscribed).not.toHaveBeenCalled();
    expect(pant.setSubscribed).not.toHaveBeenCalled();
    // Corre cada 3 s: la segunda vez no manda nada al servidor.
    expect(ajustarSuscripciones(sala as never, true)).toBe(0);
  });

  it("si el video de un compañero llegó a quedar suscrito, se suelta", () => {
    const cam = pub("video", "camera", true);
    const sala = salaFalsa(SALA, [persona("chatter-2", [cam])]);
    ajustarSuscripciones(sala as never, true);
    expect(cam.setSubscribed).toHaveBeenCalledWith(false);
  });
});

describe("la llamada de verdad (useLiveKit)", () => {
  it("⚠️ PARTICIPANTE en su sala: entra con autoSubscribe apagado, oye al compañero y no recibe su video", async () => {
    const mic = pub("audio", "microphone", false);
    const cam = pub("video", "camera", false);
    const pant = pub("video", "screen_share", false);
    const sala = salaFalsa(SALA, [persona("chatter-2", [mic, cam, pant])]);
    const { result } = await conectar(sala, false, true);

    expect(sala.connect).toHaveBeenCalledWith("wss://lk.test", "t", { autoSubscribe: false });
    expect(mic.setSubscribed).toHaveBeenCalledWith(true); // que PUEDA oír
    expect(cam.setSubscribed).not.toHaveBeenCalledWith(true);
    expect(pant.setSubscribed).not.toHaveBeenCalledWith(true);

    // Un compañero que publica DESPUÉS: su micro sí, su cámara no.
    const mic3 = pub("audio", "microphone", false);
    const cam3 = pub("video", "camera", false);
    sala.remoteParticipants.set("chatter-3", persona("chatter-3", [mic3, cam3]));
    await act(async () => { for (const cb of sala.oyentes["trackPublished"] ?? []) cb(cam3, { identity: "chatter-3" }); });
    expect(mic3.setSubscribed).toHaveBeenCalledWith(true);
    expect(cam3.setSubscribed).not.toHaveBeenCalled();

    // Y se ve como un recuadro de nombre: uno solo, aunque comparta pantalla.
    const deChatter2 = result.current.participants.filter((p) => p.identity === "chatter-2");
    expect(deChatter2).toHaveLength(1);
    expect(deChatter2[0]).toMatchObject({ videoOculto: true, isScreenSharing: false, isCameraOff: true, hasVideoTrack: false });
  });

  it("⚠️ ANFITRIÓN en la misma sala: todo como hoy (autoSubscribe de siempre, nada se suelta)", async () => {
    const mic = pub("audio", "microphone", true);
    const cam = pub("video", "camera", true);
    const pant = pub("video", "screen_share", true);
    const sala = salaFalsa(SALA, [persona("chatter-2", [mic, cam, pant])]);
    // Aunque alguien le pasara la bandera por error, siendo admin no aplica.
    const { result } = await conectar(sala, true, true);

    expect(sala.connect).toHaveBeenCalledWith("wss://lk.test", "t");
    for (const p of [mic, cam, pant]) expect(p.setSubscribed).not.toHaveBeenCalled();
    const deChatter2 = result.current.participants.filter((p) => p.identity === "chatter-2");
    expect(deChatter2.some((p) => p.videoOculto)).toBe(false);
    expect(deChatter2.some((p) => p.esTileDePantalla)).toBe(true); // su pantalla, en su recuadro
  });

  it("una llamada que no es la sala de trabajo (meet de Cowork) no cambia aunque llegue la bandera", async () => {
    const cam = pub("video", "camera", true);
    const sala = salaFalsa("cowork_meet_5a000000_3b000000", [persona("chatter-2", [cam])]);
    await conectar(sala, false, true);
    expect(sala.connect).toHaveBeenCalledWith("wss://lk.test", "t");
    expect(cam.setSubscribed).not.toHaveBeenCalled();
  });
});

describe("el recuadro del compañero", () => {
  it("dice «Solo audio» y muestra el nombre, sin <video> vacío", () => {
    const { container } = render(
      <ParticipantTile
        room={null}
        participant={{
          sid: "s2", identity: "chatter-2", name: "Ana Ruiz", isSpeaking: false, isMuted: false, isCameraOff: true,
          isScreenSharing: false, isLocal: false, handRaised: false, reactions: [], connectionQuality: "good",
          hasVideoTrack: false, videoOculto: true,
        }}
      />,
    );
    expect(screen.getByText("Solo audio")).toBeInTheDocument();
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(container.querySelector("audio")).toBeInTheDocument(); // su voz sigue
  });
});

// ── Quién pide el modo: SOLO la sala del participante ───────────────────────

const vistas = import.meta.glob([
  "/frontend/src/pages/cowork/CoworkParticipantView.tsx",
  "/frontend/src/pages/cowork/CoworkHostDashboard.tsx",
  "/frontend/src/pages/VideoCallPage.tsx",
  "/frontend/src/pages/meet/MeetGuestPage.tsx",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const vista = (final: string): string => {
  const clave = Object.keys(vistas).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return vistas[clave];
};

describe("quién lo pide", () => {
  it("la sala del participante YA NO lo pide: ven a sus compañeros como siempre (14/11/2026, empalmes)", () => {
    const s = vista("CoworkParticipantView.tsx");
    const inicio = s.indexOf("startCall({");
    expect(inicio).toBeGreaterThan(0);
    const config = s.slice(inicio, s.indexOf("});", inicio));
    expect(config).toContain("roomName: connectedLkRoom");
    expect(config).not.toMatch(/sinVideoAjeno:\s*true/);
  });

  it("el tablero del anfitrión, /call/:sala y el invitado de Meet NO lo piden", () => {
    for (const f of ["CoworkHostDashboard.tsx", "VideoCallPage.tsx", "MeetGuestPage.tsx"]) {
      expect(vista(f).length).toBeGreaterThan(500);
      expect(vista(f)).not.toContain("sinVideoAjeno");
    }
  });
});
