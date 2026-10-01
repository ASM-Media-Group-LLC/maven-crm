// UNA LLAMADA QUE ESTÁ ENTRANDO TAMBIÉN SE PROTEGE DE LAS RECARGAS.
//
// `marcarLlamadaActiva` recién llega cuando room.connect termina. Mientras se pide
// el token y se conecta (segundos), una recarga —un deploy en main.tsx, o el
// mínimo de versión de pwa.ts— cortaba la entrada sin que nada lo frenara: para
// hayLlamadaActiva() no había llamada. Camino real: tocar el aviso de un llamado de
// Cowork enfoca una pestaña vieja, el foco despierta al vigía de versión y la
// persona entra a la llamada justo en esos segundos.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const conexion = vi.hoisted(() => {
  const c = { promesa: Promise.resolve() as Promise<void>, resolver: () => {}, rechazar: (_e: unknown) => {} };
  return c;
});
function nuevaConexion() {
  conexion.promesa = new Promise<void>((ok, mal) => { conexion.resolver = () => ok(); conexion.rechazar = mal; });
  // Que un rechazo que el test provoca no quede «sin atender».
  conexion.promesa.catch(() => {});
}

// Mock livekit-client
vi.mock("livekit-client", () => ({
  // El hook lo usa como VALOR (disconnect() deja la razón CLIENT_INITIATED).
  DisconnectReason: {
    UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, SERVER_SHUTDOWN: 3, PARTICIPANT_REMOVED: 4,
    ROOM_DELETED: 5, STATE_MISMATCH: 6, JOIN_FAILURE: 7, MIGRATION: 8, SIGNAL_CLOSE: 9, ROOM_CLOSED: 10,
    USER_UNAVAILABLE: 11, USER_REJECTED: 12, SIP_TRUNK_FAILURE: 13, CONNECTION_TIMEOUT: 14, MEDIA_FAILURE: 15,
  },
  // Con `function` y no flecha: el hook hace `new Room(...)`.
  Room: vi.fn(function Room() { return ({
    connect: vi.fn(() => conexion.promesa),
    disconnect: vi.fn(),
    on: vi.fn().mockReturnThis(),
    once: vi.fn(),
    localParticipant: {
      identity: "user-1",
      name: "Test User",
      sid: "sid-local",
      isSpeaking: false,
      isMicrophoneEnabled: true,
      isCameraEnabled: true,
      audioTrackPublications: new Map(),
      videoTrackPublications: new Map(),
      connectionQuality: 3,
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn(),
      permissions: { canPublish: true, canSubscribe: true },
      metadata: '{"isAdmin":false}',
    },
    remoteParticipants: new Map(),
    startAudio: vi.fn().mockResolvedValue(undefined),
    canPlaybackAudio: true,
  }); }),
  RoomEvent: {
    ConnectionStateChanged: "connectionStateChanged",
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackPublished: "trackPublished",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    DataReceived: "dataReceived",
    Disconnected: "disconnected",
    AudioPlaybackStatusChanged: "audioPlaybackStatusChanged",
    ConnectionQualityChanged: "connectionQualityChanged",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
  },
  Track: { Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen_share" } },
  ConnectionState: { Disconnected: "disconnected", Connecting: "connecting", Connected: "connected" },
  VideoPresets: { h1080: { resolution: { width: 1920, height: 1080 } }, h720: { resolution: { width: 1280, height: 720 } }, h180: {}, h360: {} },
  // useLiveKit lo lee al importar, para el perfil de la pantalla compartida.
  ScreenSharePresets: { h360fps3: { width: 640, height: 360, encoding: { maxBitrate: 200000, maxFramerate: 3 } } },
  ConnectionQuality: { Excellent: 3, Good: 2, Poor: 1, Lost: 0, Unknown: -1 },
  createLocalTracks: vi.fn().mockResolvedValue([]),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));

vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: vi.fn().mockReturnValue({
    switchTo: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
  supportsBackgroundProcessors: vi.fn().mockReturnValue(true),
}));

const token = vi.hoisted(() => ({ falla: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(() => Promise.resolve(token.falla
        ? { data: null, error: { message: "sin token" } }
        : { data: { token: "mock-token", url: "wss://mock.livekit.cloud" }, error: null })),
    },
  },
}));

vi.mock("@/pages/messenger/videocall/BackgroundSelector", () => ({
  BACKGROUND_TEMPLATES: [{ id: "tpl-office", label: "Oficina", src: "/backgrounds/bg-office.jpg" }],
}));

import { useLiveKit } from "@/hooks/useLiveKit";
import { hayLlamadaActiva, olvidarLlamadasActivas } from "@/lib/llamadaActiva";

const esperar = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

beforeEach(() => {
  olvidarLlamadasActivas();
  token.falla = false;
  nuevaConexion();
});

describe("useLiveKit: la llamada cuenta desde que empieza a entrar", () => {
  it("mientras room.connect no termina, hay llamada (y sigue habiéndola al conectar)", async () => {
    const { result } = renderHook(() => useLiveKit());
    let entrar: Promise<void> | undefined;
    act(() => { entrar = result.current.connect("cowork-plus-1", "Yo", false, { initialMicOn: false, initialCamOn: false }); });
    await esperar();
    // MUTANTE: sin marcarConexionEnCurso al empezar connect() → false (la sonda de la
    // revisión: la recarga caía en medio de la entrada).
    expect(hayLlamadaActiva()).toBe(true);
    await act(async () => { conexion.resolver(); await entrar; });
    // Conectó: queda la sala marcada (marcarLlamadaActiva), sin hueco entre las dos.
    expect(hayLlamadaActiva()).toBe(true);
  });

  it("si la conexión falla, deja de contar", async () => {
    const { result } = renderHook(() => useLiveKit());
    let entrar: Promise<void> | undefined;
    act(() => { entrar = result.current.connect("cowork-plus-1", "Yo", false, { initialMicOn: false, initialCamOn: false }); });
    await esperar();
    expect(hayLlamadaActiva()).toBe(true);
    await act(async () => {
      conexion.rechazar(new Error("no conecta"));
      await entrar?.catch(() => {});
    });
    // MUTANTE: sin soltar la marca en el finally, la pestaña quedaría «en llamada»
    // para siempre y no se actualizaría nunca.
    expect(hayLlamadaActiva()).toBe(false);
  });

  it("si ni siquiera hay token, deja de contar", async () => {
    token.falla = true;
    const { result } = renderHook(() => useLiveKit());
    await act(async () => {
      await result.current.connect("cowork-plus-1", "Yo", false, { initialMicOn: false, initialCamOn: false }).catch(() => {});
    });
    expect(hayLlamadaActiva()).toBe(false);
  });

  it("si sale (disconnect) mientras todavía entraba, deja de contar al terminar ese intento", async () => {
    const { result } = renderHook(() => useLiveKit());
    let entrar: Promise<void> | undefined;
    act(() => { entrar = result.current.connect("cowork-plus-1", "Yo", false, { initialMicOn: false, initialCamOn: false }); });
    await esperar();
    act(() => { result.current.disconnect(); });
    await act(async () => { conexion.resolver(); await entrar; });
    expect(hayLlamadaActiva()).toBe(false);
  });
});
