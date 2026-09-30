import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConnectionState, DisconnectReason, RoomEvent } from "livekit-client";

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
      SignalReconnecting: "signalReconnecting",
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
import { pedirApagarPorPausa, pedirReanudarTrasPausa, olvidarOrdenesDePausa } from "@/lib/ordenesDePausa";

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
    // La marca "ya estuvo conectada" vive en sessionStorage y pasaría de una
    // prueba a la otra; la orden de pausa vive a nivel de módulo.
    sessionStorage.clear();
    olvidarOrdenesDePausa();
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

  // ── EL RELOJ DE COWORK Y LA CÁMARA CONGELADA ────────────────────────────
  //
  // Maria Villegas, 28/09/2026: su cara visible en la grilla de Maven y el
  // reloj diciendo "cámara apagada" cinco minutos. El reloj de Cowork se mueve
  // SOLO con el `camOn` de este aviso, así que congelarlo mueve tiempo pago:
  // pegado en false le roba horas trabajadas, pegado en true le regala horas
  // con la cámara apagada.
  //
  // La trampa: quien comparte pantalla genera DOS recuadros y el PRIMERO es el
  // de la pantalla, con `isCameraOff: true` escrito a mano
  // (`tilesDeParticipante`). Como acá se hace `find(p => p.isLocal)`, la
  // variable `localCamOn` queda clavada en false mientras dure la pantalla —y
  // era la dependencia que decidía si el aviso se recalculaba—.
  //
  // Estas dos pruebas fallan sobre el código anterior.
  describe("⚠️ el aviso de cámara no se congela al compartir pantalla", () => {
    /** Los dos recuadros de quien comparte: el de la PANTALLA primero. */
    const recuadrosCompartiendo = (camaraEncendida: boolean) => [
      makeParticipant({
        sid: "local-sid-screen", isScreenSharing: true,
        isCameraOff: true,                       // clavado, pase lo que pase
        isCameraOffReal: !camaraEncendida,       // el estado de verdad
      }),
      makeParticipant({
        sid: "local-sid", isScreenSharing: false,
        isCameraOff: !camaraEncendida, isCameraOffReal: !camaraEncendida,
      }),
    ];

    it("apagar la cámara compartiendo pantalla SÍ llega al reloj", () => {
      const avisos = vi.fn();
      lkState = { ...defaultLkState, participants: recuadrosCompartiendo(true) };
      const { rerender } = render(
        <LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />,
      );
      expect(avisos).toHaveBeenLastCalledWith(expect.objectContaining({ camOn: true }));

      // Apaga la cámara: el recuadro de la pantalla NO cambia (su isCameraOff
      // ya era true). Lo único que se mueve es el estado real.
      lkState = { ...lkState, participants: recuadrosCompartiendo(false) };
      rerender(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(avisos).toHaveBeenLastCalledWith(expect.objectContaining({ camOn: false }));
    });

    it("y el repetidor de 10 s tampoco manda el valor viejo", () => {
      vi.useFakeTimers();
      try {
        const avisos = vi.fn();
        lkState = { ...defaultLkState, participants: recuadrosCompartiendo(true) };
        const { rerender } = render(
          <LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />,
        );
        lkState = { ...lkState, participants: recuadrosCompartiendo(false) };
        rerender(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);

        avisos.mockClear();
        vi.advanceTimersByTime(10_000);
        expect(avisos).toHaveBeenCalled();
        for (const [aviso] of avisos.mock.calls) {
          expect(aviso).toEqual(expect.objectContaining({ camOn: false }));
        }
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── LA SALA SE CAYÓ ─────────────────────────────────────────────────────
  //
  // Antes, cuando LiveKit se rendía la persona quedaba con la grilla vacía, sin
  // cartel ni forma de volver, y el reloj de Cowork anotaba "sin cámara".
  // Decisión de Jhon (29/09/2026): se informa la conexión al reloj y hay un
  // cartel con un botón para volver. NO vuelve sola: la revisión mostró que la
  // vuelta automática reabría llamadas horas después con el micrófono abierto.
  describe("⚠️ la sala se cayó", () => {
    const ultimo = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];
    const avisoFinal = (fn: ReturnType<typeof vi.fn>) => ultimo(fn.mock.calls)?.[0];
    const conectadoCon = (extra: Record<string, unknown> = {}) =>
      ({ ...defaultLkState, connect: lkState.connect, disconnect: lkState.disconnect, ...extra });
    const cayo = (extra: Record<string, unknown> = {}) =>
      conectadoCon({ connectionState: ConnectionState.Disconnected, participants: [], razonDeSalida: DisconnectReason.SIGNAL_CLOSE, ...extra });
    const llamadasAConnect = () => (lkState.connect as ReturnType<typeof vi.fn>).mock.calls;
    const CARTEL = "Se perdió la conexión con la sala.";

    it("perder la sala después de estar adentro se informa como 'desconectada', con cartel y botón", () => {
      const avisos = vi.fn();
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: "conectada" });

      lkState = cayo();
      rerender(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      // La cámara "apagada" viaja JUNTO con la caída: el reloj ve las dos.
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: "desconectada", camOn: false });
      expect(screen.getByText(CARTEL)).toBeInTheDocument();
      expect(screen.getByText("Reconectar")).toBeInTheDocument();
    });

    it("⚠️ NO vuelve sola: espera a que la persona toque el botón", () => {
      vi.useFakeTimers();
      try {
        lkState = conectadoCon();
        const { rerender } = render(<LiveKitCallView {...defaultProps} />);
        const alEntrar = llamadasAConnect().length;
        lkState = cayo();
        rerender(<LiveKitCallView {...defaultProps} />);
        act(() => { vi.advanceTimersByTime(10 * 60_000); });
        expect(llamadasAConnect().length).toBe(alEntrar);
        fireEvent.click(screen.getByText("Reconectar"));
        expect(llamadasAConnect().length).toBe(alEntrar + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("⚠️ con un intento en curso el botón NO está (dos intentos a la vez dejaban una sala huérfana)", () => {
      const avisos = vi.fn();
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      lkState = cayo({ connectionState: ConnectionState.Connecting, razonDeSalida: null });
      rerender(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(screen.queryByText("Reconectar")).not.toBeInTheDocument();
      expect(screen.getByText("Volviendo a la sala…")).toBeInTheDocument();
      // Mientras vuelve sigue siendo una caída (no "sin cámara"), y no se tapa la llamada.
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: "desconectada" });
      expect(screen.queryByText("Conectando a la sala...")).not.toBeInTheDocument();
    });

    it("⚠️ un intento de volver que falla NO muestra la pantalla de error (su botón saca de la sala)", () => {
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} />);
      lkState = cayo({ razonDeSalida: null, error: "No se pudo conectar" });
      rerender(<LiveKitCallView {...defaultProps} />);
      expect(screen.queryByText("Error de conexión")).not.toBeInTheDocument();
      expect(screen.getByText(CARTEL)).toBeInTheDocument();
    });

    it("⚠️ recargar la página en plena caída NO la convierte en 'primera entrada'", () => {
      // El F5 (o la recarga sola por un deploy) borraba el "ya estuvo conectada":
      // el intento fallido volvía a anotar "sin cámara" y mostraba el error.
      sessionStorage.setItem("sala-caida:test-room", "1");
      const avisos = vi.fn();
      lkState = cayo({ razonDeSalida: DisconnectReason.JOIN_FAILURE, error: "No se pudo conectar" });
      render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: "desconectada" });
      expect(screen.getByText(CARTEL)).toBeInTheDocument();
      expect(screen.queryByText("Error de conexión")).not.toBeInTheDocument();
    });

    it("entrar por primera vez no es una caída: ni cartel ni 'desconectada'", () => {
      const avisos = vi.fn();
      lkState = conectadoCon({ connectionState: ConnectionState.Disconnected, participants: [] });
      render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: null });
      expect(screen.queryByText(CARTEL)).not.toBeInTheDocument();
    });

    it("⚠️ vuelve con cámara y micrófono APAGADOS, aunque estuvieran prendidos", () => {
      // Restaurarlos "como estaban" terminaba con el micrófono abierto sin que
      // nadie lo pidiera (pausa a mitad del intento, silenciada por otro, F5).
      // Se entra apagado, como se entra a Cowork: la persona acaba de tocar Reconectar.
      lkState = conectadoCon({ isMicOn: true, isCamOn: true });
      const { rerender } = render(<LiveKitCallView {...defaultProps} />);
      expect(ultimo(llamadasAConnect())?.[3]).toMatchObject({ initialMicOn: true, initialCamOn: true }); // la primera entrada, como siempre
      lkState = cayo({ isMicOn: false, isCamOn: false });
      rerender(<LiveKitCallView {...defaultProps} />);
      fireEvent.click(screen.getByText("Reconectar"));
      expect(ultimo(llamadasAConnect())?.[3]).toMatchObject({ initialMicOn: false, initialCamOn: false });
    });

    it("de vuelta, avisa que quedaron apagados; el aviso se va al prender la cámara", () => {
      const cowork = { ...defaultProps, supervisorEncuadre: true };
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...cowork} />);
      lkState = cayo();
      rerender(<LiveKitCallView {...cowork} />);
      fireEvent.click(screen.getByText("Reconectar"));
      lkState = conectadoCon({ isCamOn: false, isMicOn: false });
      rerender(<LiveKitCallView {...cowork} />);
      expect(screen.getByText(/Volviste a la sala\. Tu cámara y tu micrófono quedaron apagados/)).toBeInTheDocument();
      lkState = conectadoCon({ isCamOn: true });
      rerender(<LiveKitCallView {...cowork} />);
      expect(screen.queryByText(/Volviste a la sala/)).not.toBeInTheDocument();
    });

    it("⚠️ con la sala caída, los interruptores NO tocan una sala que ya no existe", () => {
      // Antes el micrófono quedaba tomado 15 s y salía "el micrófono no enciende".
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} />);
      lkState = cayo();
      rerender(<LiveKitCallView {...defaultProps} />);
      for (const b of screen.getAllByTitle("Micrófono")) fireEvent.click(b);
      expect(lkState.toggleMic).not.toHaveBeenCalled();
    });

    it("⚠️ una pausa con la sala caída no prende ni apaga nada, ni al terminar", () => {
      // Tras un F5 isMicOn/isCamOn arrancan en true: la pausa los "apagaba" con
      // toggles sobre una sala muerta, y al terminar los prendía.
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} />);
      lkState = cayo({ isMicOn: true, isCamOn: true });
      rerender(<LiveKitCallView {...defaultProps} />);
      act(() => { pedirApagarPorPausa(); });
      act(() => { pedirReanudarTrasPausa(); });
      expect(lkState.toggleMic).not.toHaveBeenCalled();
      expect(lkState.toggleCam).not.toHaveBeenCalled();
    });

    it("la marca de caída se pone al caerse y se borra al volver", () => {
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} />);
      expect(sessionStorage.getItem("sala-caida:test-room")).toBeNull(); // conectada sana: nada
      lkState = cayo();
      rerender(<LiveKitCallView {...defaultProps} />);
      expect(sessionStorage.getItem("sala-caida:test-room")).toBe("1");
      lkState = conectadoCon({ isCamOn: false, isMicOn: false });
      rerender(<LiveKitCallView {...defaultProps} />);
      expect(sessionStorage.getItem("sala-caida:test-room")).toBeNull();
    });

    it("⚠️ salir de la sala dentro de la app borra la marca (la próxima entrada no parece una caída)", () => {
      lkState = conectadoCon();
      const { rerender, unmount } = render(<LiveKitCallView {...defaultProps} />);
      lkState = cayo();
      rerender(<LiveKitCallView {...defaultProps} />);
      expect(sessionStorage.getItem("sala-caida:test-room")).toBe("1");
      unmount();
      expect(sessionStorage.getItem("sala-caida:test-room")).toBeNull();
    });

    it("⚠️ el F5 de una llamada SANA es una entrada normal: sin cartel, sin 'desconectada'", () => {
      // Con la marca vieja ("ya estuvo conectada") el F5 de una llamada sana se
      // leía como caída: "Volviendo a la sala…", botones bloqueados, y el reloj
      // anotaba "sin conexión" en cada recarga.
      const avisos = vi.fn();
      lkState = conectadoCon({ connectionState: ConnectionState.Connecting });
      render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(screen.getByText("Conectando a la sala...")).toBeInTheDocument();
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: null });
      expect(ultimo(llamadasAConnect())?.[3]).toMatchObject({ initialMicOn: true, initialCamOn: true });
    });

    it("⚠️ el F5 EN PLENA CAÍDA vuelve apagado, como el botón", () => {
      sessionStorage.setItem("sala-caida:test-room", "1");
      lkState = conectadoCon({ connectionState: ConnectionState.Connecting });
      render(<LiveKitCallView {...defaultProps} />);
      expect(ultimo(llamadasAConnect())?.[3]).toMatchObject({ initialMicOn: false, initialCamOn: false });
    });

    it("fuera de Cowork el aviso de vuelta no habla de compartir pantalla", () => {
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} />);
      lkState = cayo();
      rerender(<LiveKitCallView {...defaultProps} />);
      fireEvent.click(screen.getByText("Reconectar"));
      lkState = conectadoCon({ isCamOn: false, isMicOn: false });
      rerender(<LiveKitCallView {...defaultProps} />);
      expect(screen.getByText("Volviste a la llamada. Tu cámara y tu micrófono quedaron apagados.")).toBeInTheDocument();
    });

    it("⚠️ si la sacó el supervisor no es una caída: ni cartel ni botón", () => {
      const avisos = vi.fn();
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      lkState = cayo({ razonDeSalida: DisconnectReason.PARTICIPANT_REMOVED });
      rerender(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(screen.queryByText("Reconectar")).not.toBeInTheDocument();
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: null });
    });

    it("con otra pestaña adentro es 'reemplazada' y el cartel es el de siempre ('Usar aquí')", () => {
      const avisos = vi.fn();
      lkState = conectadoCon();
      const { rerender } = render(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      lkState = cayo({ razonDeSalida: DisconnectReason.DUPLICATE_IDENTITY, otraPestanaTomoLaSesion: true });
      rerender(<LiveKitCallView {...defaultProps} onMediaStateChange={avisos} />);
      expect(avisoFinal(avisos)).toMatchObject({ conexionSala: "reemplazada" });
      expect(screen.queryByText(CARTEL)).not.toBeInTheDocument();
    });
  });

  // ── LA PAUSA Y EL MICRÓFONO DE QUIEN SILENCIARON ───────────────────────
  // Una supervisora silencia a una chatter por ruido de fondo; la chatter marca
  // Baño. `isMicOn` seguía en "prendido" (no se enteraba del silencio ajeno), la
  // pausa llamaba a toggleMic para apagarlo, y toggleMic —que mira el estado
  // real— lo PRENDÍA: la sala escuchaba su casa toda la pausa.
  describe("⚠️ la pausa y el micrófono de quien silenciaron", () => {
    const conMicReal = (encendido: boolean) => {
      (salaFalsa.localParticipant as Record<string, unknown>).isMicrophoneEnabled = encendido;
    };

    it("silenciada por otro: la pausa NO le prende el micrófono, ni al entrar ni al salir", () => {
      lkState = { ...defaultLkState, connect: lkState.connect, disconnect: lkState.disconnect, isMicOn: true, isCamOn: false };
      conMicReal(false); // lo silenció la supervisora; `isMicOn` todavía dice true
      render(<LiveKitCallView {...defaultProps} />);
      act(() => { pedirApagarPorPausa(); });
      expect(lkState.toggleMic).not.toHaveBeenCalled();
      act(() => { pedirReanudarTrasPausa(); });
      expect(lkState.toggleMic).not.toHaveBeenCalled();
    });

    it("con el micrófono prendido de verdad, la pausa lo apaga y al volver lo devuelve", () => {
      lkState = { ...defaultLkState, connect: lkState.connect, disconnect: lkState.disconnect, isMicOn: true, isCamOn: false };
      conMicReal(true);
      render(<LiveKitCallView {...defaultProps} />);
      act(() => { pedirApagarPorPausa(); });
      expect(lkState.toggleMic).toHaveBeenCalledTimes(1);
      conMicReal(false); // la pausa lo apagó
      act(() => { pedirReanudarTrasPausa(); });
      expect(lkState.toggleMic).toHaveBeenCalledTimes(2);
    });
  });
});
