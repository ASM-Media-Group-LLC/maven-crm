import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionState, RoomEvent } from "livekit-client";

// Default mock state
const makeParticipant = (overrides: Record<string, any> = {}) => ({
  sid: "local-sid",
  identity: "user-1",
  name: "Test User",
  isSpeaking: false,
  isMuted: false,
  isCameraOff: true,
  isScreenSharing: false,
  isLocal: true,
  handRaised: false,
  reactions: [] as string[],
  connectionQuality: "excellent" as string,
  hasVideoTrack: false,
  ...overrides,
});

// ── La sala falsa de LiveKit ──────────────────────────────────────────────
//
// La vista no solo dibuja la lista de participantes que le da el hook: pide la
// Room de verdad con `lk.getRoom()` y se le cuelga de los eventos. Hoy la usan
// el silencio del audio entrante (`incomingAudioMuted`: setVolume por
// participante remoto + re-aplicar en ParticipantConnected/TrackSubscribed),
// la red de seguridad de audio (RoomAudioSink) y el punto rojo de grabación
// (RecordingControl, que escucha RecordingStatusChanged).
//
// Por eso el doble tiene que parecerse a una Room: `remoteParticipants` es un
// Map (no un array ni undefined) y `on`/`off` son funciones que devuelven la
// propia sala, como en la librería. Cuando esto era un objeto pelado con solo
// `localParticipant`, los efectos reventaban y se caía el render ENTERO — las
// 11 pruebas del archivo, aunque ninguna hablara de audio.
const crearParticipanteRemoto = (identity: string) => ({
  sid: `sid-${identity}`,
  identity,
  name: identity,
  isLocal: false,
  setVolume: vi.fn(),
  audioTrackPublications: new Map(),
  videoTrackPublications: new Map(),
  trackPublications: new Map(),
});

type SalaFalsa = ReturnType<typeof crearSalaFalsa>;

function crearSalaFalsa(remotos: Array<ReturnType<typeof crearParticipanteRemoto>> = []) {
  const sala = {
    localParticipant: {
      sid: "local-sid",
      identity: "user-1",
      name: "Test User",
      // La vista lo consulta en un tic de 1s (¿comparte pantalla?, ¿qué pista
      // de cámara hay?). Sin publicaciones: nadie comparte nada.
      getTrackPublication: vi.fn().mockReturnValue(undefined),
      audioTrackPublications: new Map(),
      videoTrackPublications: new Map(),
    },
    // Map, igual que en livekit-client (identity -> RemoteParticipant).
    remoteParticipants: new Map(remotos.map((p) => [p.identity, p])),
    activeSpeakers: [] as Array<{ isLocal: boolean }>,
    isRecording: false,
    startAudio: vi.fn().mockResolvedValue(undefined),
    // `on`/`off` devuelven la sala, como los de la librería, y además guardan
    // los oyentes para poder dispararlos a mano en las pruebas.
    oyentes: new Map<string, Set<(...args: unknown[]) => void>>(),
    on: vi.fn((evento: string, fn: (...args: unknown[]) => void) => {
      if (!sala.oyentes.has(evento)) sala.oyentes.set(evento, new Set());
      sala.oyentes.get(evento)!.add(fn);
      return sala;
    }),
    off: vi.fn((evento: string, fn: (...args: unknown[]) => void) => {
      sala.oyentes.get(evento)?.delete(fn);
      return sala;
    }),
    emitir: (evento: string, ...args: unknown[]) => {
      sala.oyentes.get(evento)?.forEach((fn) => fn(...args));
    },
  };
  return sala;
}

let salaFalsa: SalaFalsa = crearSalaFalsa();

const defaultLkState = {
  connectionState: ConnectionState.Connected,
  participants: [makeParticipant()],
  activeSpeaker: null,
  isMicOn: true,
  isCamOn: true,
  isScreenSharing: false,
  isHandRaised: false,
  chatMessages: [],
  error: null,
  isReconnecting: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  toggleMic: vi.fn(),
  toggleCam: vi.fn(),
  toggleScreenShare: vi.fn(),
  toggleHand: vi.fn(),
  sendChatMessage: vi.fn(),
  sendReaction: vi.fn(),
  muteParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  setBackgroundEffect: vi.fn(),
  // Siempre la sala vigente: cada prueba estrena una en el beforeEach.
  getRoom: vi.fn(() => salaFalsa),
};

let lkState = { ...defaultLkState };

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("@/hooks/useLiveKit", () => ({
  useLiveKit: () => lkState,
}));

vi.mock("livekit-client", async () => {
  const actual = await vi.importActual("livekit-client");
  return {
    ...actual,
    ConnectionState: {
      Connecting: "connecting",
      Connected: "connected",
      Disconnected: "disconnected",
      Reconnecting: "reconnecting",
    },
    // ScreenShareAudio existe de verdad y la vista la usa para silenciar el
    // sonido de una pantalla compartida: sin ella el segundo setVolume se
    // hacía con `undefined` y no se podía distinguir de ningún otro.
    Track: { Source: { Camera: "camera", ScreenShare: "screen_share", Microphone: "microphone", ScreenShareAudio: "screen_share_audio" } },
    Room: vi.fn(),
  };
});

vi.mock("@/pages/messenger/videocall/ParticipantTile", () => ({
  default: ({ participant }: any) => (
    <div data-testid={`participant-${participant.identity}`}>
      {participant.isLocal ? "Tú" : participant.name}
    </div>
  ),
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";

describe("LiveKitCallView", () => {
  const defaultProps = {
    roomName: "test-room",
    displayName: "Test User",
    callDisplayName: "My Call",
    isAdmin: false,
    onLeave: vi.fn(),
    initialMicOn: true,
    initialCamOn: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    salaFalsa = crearSalaFalsa();
    lkState = { ...defaultLkState, connect: vi.fn(), disconnect: vi.fn() };
  });

  it("shows loading spinner when connecting", () => {
    lkState = { ...defaultLkState, connectionState: "connecting" as any };
    const { container } = render(<LiveKitCallView {...defaultProps} />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.getByText("Conectando a la sala...")).toBeInTheDocument();
  });

  it("shows error state with message and back button", () => {
    lkState = { ...defaultLkState, error: "Connection failed" };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Error de conexión")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(screen.getByText("Volver")).toBeInTheDocument();
  });

  it("renders call top bar (room name hidden by design)", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    // Room name is hidden; just verify top bar renders with timer
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  // El botón de colgar dejó de decir "Salir": desde el rediseño estilo Google
  // Chat (806f7bea) es una pastilla roja SOLO con el ícono, y el texto vive en
  // el tooltip ("Colgar"). Solo muestra palabras cuando quien monta la vista
  // pasa `leaveLabel` (Cowork: "Regresar a la sala"). Por eso se busca por
  // título y no por texto — y de paso se comprueba que el botón haga algo.
  it("renders call controls with leave button", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    const colgar = screen.getByTitle("Colgar");
    expect(colgar).toBeInTheDocument();
    fireEvent.click(colgar);
    expect(lkState.disconnect).toHaveBeenCalled();
    expect(defaultProps.onLeave).toHaveBeenCalled();
  });

  it("shows waiting message when alone", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Esperando a que otros participantes se unan...")).toBeInTheDocument();
  });

  it("does NOT show waiting message with multiple participants", () => {
    lkState = {
      ...defaultLkState,
      participants: [
        makeParticipant(),
        makeParticipant({ sid: "remote-sid", identity: "user-2", name: "Remote User", isLocal: false, connectionQuality: "good" }),
      ],
    };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.queryByText("Esperando a que otros participantes se unan...")).not.toBeInTheDocument();
  });

  it("shows reconnecting banner", () => {
    lkState = { ...defaultLkState, isReconnecting: true };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Reconectando...")).toBeInTheDocument();
  });

  it("does NOT show reconnecting banner when connected normally", () => {
    lkState = { ...defaultLkState, isReconnecting: false };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.queryByText("Reconectando...")).not.toBeInTheDocument();
  });

  it("renders participant tiles", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    // Local participant should show "Tú" label
    expect(screen.getByText("Tú")).toBeInTheDocument();
  });

  it("calls connect on mount with correct args", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    expect(lkState.connect).toHaveBeenCalledWith(
      "test-room",
      "Test User",
      false,
      expect.objectContaining({ initialMicOn: true, initialCamOn: true })
    );
  });

  it("calls disconnect on unmount", () => {
    lkState = { ...defaultLkState };
    const { unmount } = render(<LiveKitCallView {...defaultProps} />);
    unmount();
    expect(lkState.disconnect).toHaveBeenCalled();
  });

  // Silencio local del audio entrante (el Hub de Cowork mientras el coordinador
  // está metido en una sala): se le baja el volumen a CADA participante remoto
  // —micrófono y audio de pantalla compartida—, y a nadie más. Este efecto era
  // justamente el que tumbaba el archivo entero y nunca tuvo prueba propia.
  it("incomingAudioMuted silencia a cada remoto y lo re-aplica cuando entra otro", () => {
    const remoto = crearParticipanteRemoto("user-2");
    salaFalsa = crearSalaFalsa([remoto]);
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} incomingAudioMuted />);

    expect(remoto.setVolume).toHaveBeenCalledWith(0);
    expect(remoto.setVolume).toHaveBeenCalledWith(0, "screen_share_audio");

    // Quien llega DESPUÉS también tiene que entrar mudo: por eso el efecto se
    // queda escuchando la sala mientras el silencio siga puesto.
    remoto.setVolume.mockClear();
    salaFalsa.emitir(RoomEvent.ParticipantConnected);
    expect(remoto.setVolume).toHaveBeenCalledWith(0);
  });

  it("sin incomingAudioMuted el volumen de los remotos queda en 1", () => {
    const remoto = crearParticipanteRemoto("user-2");
    salaFalsa = crearSalaFalsa([remoto]);
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    expect(remoto.setVolume).toHaveBeenCalledWith(1);
    expect(remoto.setVolume).not.toHaveBeenCalledWith(0);
  });
});
