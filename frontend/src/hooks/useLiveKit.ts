import { useState, useCallback, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
  ConnectionState,
  DisconnectReason,
  Participant,
  VideoPresets,
  ScreenSharePresets,
  ConnectionQuality,
  RoomOptions,
  TrackEvent,
} from "livekit-client";
import type { ScreenShareCaptureOptions, TrackPublishOptions } from "livekit-client";
import { esOtraPestana } from "@/lib/sesionDuplicada";
import { fueUnaCaida } from "@/lib/conexionSala";
import {
  reproducirAudiosPausados, reanudarAudioConGesto, dejarDeEsperarGesto, registrarDesbloqueo,
  decidirSiRepararElMicro, MEMORIA_VIGILANTE_VACIA, type MemoriaDelVigilante,
} from "@/lib/audioDeLaLlamada";
import { BackgroundProcessor, supportsBackgroundProcessors } from "@livekit/track-processors";
import { toast } from "sonner";
// Los avisos de la llamada van por traducir(): se arman en eventos de LiveKit y
// callbacks, no en el JSX, y los lee la persona en su propio idioma.
import { traducir } from "@/lib/i18n";
import { esPantallaCompleta, puedeCompartirPantalla, motivoDeFalloAlCompartir } from "@/lib/compartirPantalla";
import { supabase } from "@/integrations/supabase/client";
import { avisarSalidaDeLlamada, mostrarAvisoDeSala, ID_AVISO_ME_SILENCIARON } from "@/lib/avisosDeLlamada";
import type { BackgroundEffect } from "@/lib/fondoDeLlamada";
import {
  esBlur, radioDeBlur, isTemplateBackground, isCustomBackground,
  resolverImagenDeFondo, leerFondoGuardado, guardarFondo,
} from "@/lib/fondoDeLlamada";
import type { ImagenDeFondo } from "@/lib/fondoDeLlamada";
import { NoiseSuppresionTrackProcessor, supportsNoiseSuppression, loadNCPreference, saveNCPreference } from "@/lib/noise-suppression-processor";
import { marcarConexionEnCurso, marcarLlamadaActiva, quitarLlamadaActiva } from "@/lib/llamadaActiva";
import {
  armarMuestra, borrarLlamadaEnCurso, leerReporte, marcarLlamadaEnCurso, medirRetraso, recargaConLlamada,
  type LecturaDePista, type MuestraDeLlamada,
} from "@/lib/saludDeLlamada";

// La recarga a mitad de llamada se revisa UNA vez por página (al primer connect,
// cuando ya hay sesión para anotarla). Ver saludDeLlamada.ts.
let recargaRevisada = false;
// Una muestra por minuto mientras dura la llamada (saludDeLlamada.ts).
const MUESTRA_CADA_MS = 60_000;

export type ConnectionQualityLevel = "excellent" | "good" | "poor" | "lost" | "unknown";

export interface LKParticipant {
  sid: string;
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  /** El estado REAL de la cámara, sin el freno de dibujado del efecto de fondo.
   *  `isCameraOff` gobierna qué se dibuja; esto es lo que se puede REPORTAR.
   *  Un detalle de render no puede hacerle creer al supervisor que alguien
   *  apagó la cámara. */
  isCameraOffReal?: boolean;
  isScreenSharing: boolean;
  /** Este tile muestra la PANTALLA compartida, no a la persona.
   *
   *  Cuando alguien comparte con la cámara prendida se emiten DOS tiles de la
   *  misma persona. Sin distinguirlos, lo que es de la PERSONA —la calidad de
   *  conexión— se dibuja dos veces. */
  esTileDePantalla?: boolean;
  isLocal: boolean;
  handRaised: boolean;
  reactions: string[];
  connectionQuality: ConnectionQualityLevel;
  hasVideoTrack: boolean;
}

export interface LKChatMessage {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface DataMessage {
  type: "chat" | "hand" | "reaction" | "moderation" | "chat-history" | "aviso";
  payload: any;
}

export interface ConnectOptions {
  initialMicOn?: boolean;
  initialCamOn?: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
  audioOutputDeviceId?: string;
  backgroundEffect?: BackgroundEffect;
  /** If provided, used instead of calling the generic livekit-token edge function */
  tokenProvider?: () => Promise<{ token: string; url: string }>;
}

function getDeviceConstraint(deviceId?: string) {
  return deviceId ? ({ deviceId: { ideal: deviceId } } as any) : undefined;
}

// Perfil de cámara cuando hay fondo borroso/virtual activo. El blur corre
// segmentación con ML por CADA cuadro + compositing a la resolución de captura,
// así que es de lo más pesado de CPU y hace congelar el video. Antes era
// 720p@24 (poco "seguro"). Lo bajamos a 540p@15: ~la mitad de píxeles y 37%
// menos cuadros que segmentar (~60-65% menos trabajo), y para una videollamada
// con fondo se ve perfecto. Sin fondo, la cámara usa el perfil normal (720p).
const BACKGROUND_SAFE_VIDEO_CONSTRAINTS = {
  width: { ideal: 960, max: 960 },
  height: { ideal: 540, max: 540 },
  frameRate: { ideal: 15, max: 15 },
} as const;

function getVideoConstraint(deviceId?: string, backgroundSafeProfile = false) {
  const constraint: Record<string, any> = {};
  if (deviceId) constraint.deviceId = { ideal: deviceId };
  if (backgroundSafeProfile) {
    constraint.width = BACKGROUND_SAFE_VIDEO_CONSTRAINTS.width;
    constraint.height = BACKGROUND_SAFE_VIDEO_CONSTRAINTS.height;
    constraint.frameRate = BACKGROUND_SAFE_VIDEO_CONSTRAINTS.frameRate;
  }
  return Object.keys(constraint).length ? (constraint as any) : undefined;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatLiveKitConnectionError(err: any, livekitUrl?: string) {
  const rawMessage = String(err?.message || err || "Connection failed");
  const host = livekitUrl ? livekitUrl.replace(/^wss?:\/\//, "").replace(/\/$/, "") : "LiveKit";

  if (/Abort handler called|serverUnreachable|websocket.*closed|ERR_CONNECTION_TIMED_OUT|timeout|timed out/i.test(rawMessage)) {
    return traducir("shared.call.connectFailed", { host });
  }

  return rawMessage;
}

// ── Audio feedback helper (shared AudioContext to avoid exhaustion) ──
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioContext();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playTone(frequency: number, duration: number, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext not available — fail silently
  }
}

function playJoinSound() {
  playTone(880, 0.15, 0.12);
  setTimeout(() => playTone(1100, 0.12, 0.1), 160);
}

function playLeaveSound() {
  playTone(600, 0.15, 0.1);
  setTimeout(() => playTone(440, 0.18, 0.08), 170);
}

// En qué salas avisamos que entró o salió alguien. Decisión de Jhon (27/08):
// SÍ en las reuniones de Meet, donde saber que llegó la otra persona es útil;
// NO en Cowork ni en las llamadas del chat, donde el coordinador entra y sale de
// las salas todo el día y la campanita era ruido constante para los chatters.
function avisaEntradasYSalidas(roomName: string | undefined): boolean {
  return !!roomName && roomName.startsWith("meet_");
}

function playHandRaisedSound() {
  playTone(880, 0.2, 0.25);
  setTimeout(() => playTone(1174.66, 0.18, 0.2), 200);
}

function playChatMessageSound() {
  playTone(660, 0.12, 0.2);
  setTimeout(() => playTone(880, 0.1, 0.15), 80);
}

// ── Map livekit ConnectionQuality to our level ───────────────────
function mapConnectionQuality(q: ConnectionQuality): ConnectionQualityLevel {
  switch (q) {
    case ConnectionQuality.Excellent:
      return "excellent";
    case ConnectionQuality.Good:
      return "good";
    case ConnectionQuality.Poor:
      return "poor";
    case ConnectionQuality.Lost:
      return "lost";
    default:
      return "unknown";
  }
}

// ── Chat message cap to prevent unbounded memory growth ──────────
const MAX_CHAT_MESSAGES = 500;

// El id del aviso permanente "Dejaron de escucharte" (el que lleva el botón
// «Reparar»). Uno solo para crearlo, cerrarlo y reemplazarlo al repararlo.
const ID_AVISO_MIC_SIN_SALIDA = "mic-sin-salida";

// ── Background processor timeouts (reduced for responsiveness) ───
const BACKGROUND_ATTACH_TIMEOUT_MS = 6000;
const BACKGROUND_SWITCH_TIMEOUT_MS = 8000;
const BACKGROUND_FAILURE_COOLDOWN_MS = 10000;

// ── Sync interval — Google Meet polls ~3-5s for participant state ─
const PARTICIPANT_SYNC_INTERVAL_MS = 3000;
// Prevent burst camera-refresh operations from stacking expensive media reconfigurations.
const VIDEO_SWITCH_MIN_INTERVAL_MS = 420;

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Schedules a callback to run when the browser is idle.
 * Falls back to setTimeout(cb, delay) if requestIdleCallback is unavailable.
 */
function scheduleWhenIdle(cb: () => void, delay = 100) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(cb, { timeout: delay + 500 });
  } else {
    setTimeout(cb, delay);
  }
}

// ── Production Room configuration (Google Meet-inspired) ─────────
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // Keep local tracks alive when unpublished — avoids getUserMedia re-calls
  // during quick toggling which causes visible camera flashes
  stopLocalTrackOnUnpublish: false,
  videoCaptureDefaults: {
    // 720p (antes 1080p): capturar la cámara a 1080p + simulcast recargaba la
    // CPU y hacía congelar el video en llamadas normales (reportado con Grace y
    // Jackeline). 720p es estándar para videollamadas y no toca la nitidez del
    // screen share (usa sus propios presets, no videoCaptureDefaults).
    resolution: VideoPresets.h720.resolution,
    facingMode: "user",
  },
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: 1,
    sampleRate: 48000,
  },
  publishDefaults: {
    dtx: true,          // Discontinuous transmission — saves bandwidth on silence
    red: true,          // Redundant encoding — better packet loss resilience
    simulcast: true,    // SFU-style adaptive quality layers
    videoSimulcastLayers: [
      VideoPresets.h180,
      VideoPresets.h360,
      VideoPresets.h720,
    ],
    // VP8 (antes VP9): VP9 con simulcast es mucho más pesado de codificar y en
    // navegadores es históricamente inestable → cuadros congelados. VP8 es el
    // códec más confiable para simulcast y bastante más liviano de CPU; la capa
    // adaptativa (adaptiveStream + dynacast) compensa el bitrate un poco mayor.
    videoCodec: "vp8",
  },
  // NO desconectar al pasar la pestaña a segundo plano / congelarse (cambiar de ventana o app):
  // esto tiraba a los participantes cuando se iban a hacer otra cosa. El cierre REAL de la
  // pestaña ya lo maneja el beforeunload de LiveKitCallView y el pagehide de CoworkParticipantView;
  // ante un corte de red, la reconnectPolicy de abajo reconecta de forma transparente.
  disconnectOnPageLeave: false,
  // Reconnection resilience — Google Meet reconnects transparently
  reconnectPolicy: {
    nextRetryDelayInMs: (context) => {
      // Exponential backoff: 300ms, 600ms, 1.2s, 2.4s, capped at 5s
      // Attempt up to 7 times (~20s total before giving up)
      if (context.retryCount >= 7) return null; // give up
      return Math.min(300 * Math.pow(2, context.retryCount), 5000);
    },
  },
};

// ── Cómo se publica la PANTALLA COMPARTIDA ────────────────────────
//
// MEDIDO en una llamada real (18/09/2026, Jhon ↔ Juan Pachas, getStats sobre la
// llamada viva): la pantalla llegaba a 2,5 CUADROS POR SEGUNDO gastando 20 kbps
// de un presupuesto de 2.500, con CERO paquetes perdidos y 79 ms de ping. O sea:
// la red estaba limpia y el que no daba abasto era quien comparte. En la misma
// llamada, el 26% del audio tuvo que ser inventado por el corrector de pérdidas
// — la voz se cortaba a ráfagas, cada vez que su máquina se saturaba.
//
// Hasta ahora esto se publicaba SIN opciones, así que heredaba el
// `simulcast: true` de publishDefaults, que se escribió pensando en CÁMARAS.
// Para una pantalla, LiveKit arma con eso DOS codificaciones en paralelo —
// 1080p@15 y 540p@15— las dos a resolución alta y a 15 fps, sobre contenido en
// movimiento. Sumadas a las TRES capas de la cámara, son cinco codificaciones
// de video al mismo tiempo en un portátil.
//
// Ninguno de los dos cambios toca la nitidez de la capa principal:
//
//  1. La capa chica pasa de 540p@15 a 360p@3. Sirve para lo mismo —las
//     miniaturas del tablero de Cowork, donde un supervisor mira varias
//     pantallas a la vez— pero cuesta del orden de cinco veces menos: un cuarto
//     de los píxeles y un quinto de los cuadros.
//     ⚠️ NO se apaga el simulcast del todo, que es lo que uno haría de primera:
//     sin capa chica cada miniatura de Cowork se traería el 1080p entero y el
//     que sufriría sería el supervisor. Se abarata la capa, no se elimina.
//
//  2. `maintain-framerate` le dice al codificador que cuando no dé abasto
//     ACHIQUE la imagen en vez de congelarla. Es exactamente el fallo medido:
//     se aferró a los 540p y se desplomó a 2,5 fps. Una pantalla que se achica
//     se sigue leyendo; una que se congela, no.
//
// Lo que NO se toca a propósito: la resolución de la capa principal sigue en
// 1080p. Bajarla arreglaría el caso de un portátil lento a costa de que a TODOS
// se les vuelva ilegible una hoja de cálculo o un código, que es lo que el
// equipo comparte casi siempre. Si hiciera falta, ese es otro cambio y con su
// propia medición.
//
// publishDefaults se COMBINA con esto (LocalParticipant hace
// `Object.assign({}, publishDefaults, options)`), así que dtx, red y el códec
// vp8 se heredan igual; acá solo va lo que cambia.
const PUBLICACION_DE_PANTALLA: TrackPublishOptions = {
  screenShareSimulcastLayers: [ScreenSharePresets.h360fps3],
  degradationPreference: "maintain-framerate",
};

/**
 * Los tiles que dibuja una persona. Quien comparte pantalla SIEMPRE tiene dos:
 * su pantalla y su persona. Antes solo si tenía la cámara encendida: con la
 * cámara apagada quedaba un solo tile (la pantalla), ese se iba al escenario y
 * la persona desaparecía de la lista lateral —Jhon (08/09): "habemos 4
 * participantes pero no sale uno… parece como si no estuviera". Con la cámara
 * apagada el tile de persona muestra su avatar, igual que a cualquier otro.
 */
export function tilesDeParticipante(base: LKParticipant, pantallaViva: boolean, camaraViva: boolean): LKParticipant[] {
  if (!base.isScreenSharing) return [base];
  return [
    { ...base, sid: `${base.sid}-screen`, isCameraOff: true, esTileDePantalla: true, hasVideoTrack: pantallaViva },
    { ...base, isScreenSharing: false, hasVideoTrack: camaraViva },
  ];
}

export function useLiveKit() {
  const roomRef = useRef<Room | null>(null);
  const bgProcessorRef = useRef<any>(null);
  const bgAttachedTrackRef = useRef<any>(null);
  const preloadedBackgroundsRef = useRef<Set<string>>(new Set());
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<LKParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<LKChatMessage[]>([]);
  // Espejo en ref: el listener de LiveKit se registra una sola vez y capturaria
  // el arreglo vacio del primer render. Sin esto, al entrar alguien se le
  // mandaria un historial siempre vacio.
  const chatMessagesRef = useRef<LKChatMessage[]>([]);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  // Quién apaga la cancelación de ruido si el filtro deja de funcionar andando
  // (se fija más abajo, cuando existe `apagarNCPorFallo`; acá va por ref para
  // que los tres lugares que crean el procesador no dependan del orden).
  const alFallarNCRef = useRef<(motivo: string) => void>(() => {});
  // El micrófono CRUDO: si el sistema lo silencia (otro programa lo tomó, cambió
  // el dispositivo, empezó una captura de audio del sistema al compartir
  // pantalla) el track queda `muted` y nadie te oye, con la publicación en
  // verde. Antes no se avisaba; ahora sí, para que la persona apague y prenda.
  const micVigiladoRef = useRef<MediaStreamTrack | null>(null);
  // Volver a pedir el micrófono al sistema. Se guarda en un ref porque el
  // vigilante se declara antes que `reapplyNC` y que las preferencias.
  const repararMicroRef = useRef<(automatica?: boolean) => Promise<void>>(async () => {});
  // Cuándo quedó callado este micrófono (Date.now()); 0 = está hablando. Lo
  // sella tanto silenciarse uno mismo como que lo silencie un supervisor.
  const meSilencieYoRef = useRef(0);
  // El vigilante del saliente. Se declara acá arriba —con los demás refs— para
  // que el intervalo de `connect` lo pueda llamar sin usarlo antes de definirlo.
  const vigilarSalidaDelMicroRef = useRef<() => void>(() => {});
  const vigilarMicro = useCallback((room: Room) => {
    const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
      (p) => p.source === Track.Source.Microphone,
    );
    // ⚠️ LA PISTA CRUDA, NO LA PROCESADA. Con la cancelación de ruido puesta
    // —que viene PRENDIDA por defecto— `mediaStreamTrack` devuelve la salida del
    // filtro, y esa la fabricamos nosotros: nunca emite `mute` ni `ended`. O sea
    // que este vigilante, tal como se escribió el 11/09, estaba sordo en la
    // configuración normal. Los eventos del sistema llegan a la pista de entrada.
    const conProcesador = micPub?.track as unknown as { _mediaStreamTrack?: MediaStreamTrack } | undefined;
    const t = conProcesador?._mediaStreamTrack ?? micPub?.track?.mediaStreamTrack;
    if (!t || micVigiladoRef.current === t) return;
    micVigiladoRef.current = t;
    t.addEventListener("mute", () => {
      toast.warning(traducir("shared.call.micStopped"), {
        id: "mic-mudo",
        description: traducir("shared.call.micStoppedDesc"),
        duration: 12000,
      });
    });
    t.addEventListener("unmute", () => toast.dismiss("mic-mudo"));
    t.addEventListener("ended", () => {
      toast.error(traducir("shared.call.micDisconnected"), {
        id: "mic-mudo",
        description: traducir("shared.call.micDisconnectedDesc"),
        duration: 15000,
      });
    });
    // ── Y EL AVISO QUE DE VERDAD IMPORTA ────────────────────────────────────
    //
    // Cuando la pista cruda queda silenciada por el sistema, LiveKit espera 5 s
    // y PAUSA EL ENVÍO: le pone `null` al emisor, así que deja de mandar un solo
    // paquete. Pero no toca `isMuted`, y el botón del micrófono se dibuja con
    // eso: queda VERDE mientras nadie la oye. Es exactamente lo que describió
    // Andrea. Y apagar y prender el micro NO lo cura (con la publicación viva,
    // LiveKit solo hace `unmute()` y deja el emisor vacío); lo único que lo cura
    // es volver a pedir el dispositivo, que es lo que hace el botón de acá.
    const pista = micPub?.track as LocalAudioTrack | undefined;
    if (pista) {
      pista.on(TrackEvent.UpstreamPaused, () => {
        toast.error(traducir("shared.call.notHeard"), {
          id: ID_AVISO_MIC_SIN_SALIDA,
          description: traducir("shared.call.notHeardDesc"),
          duration: Infinity,
          action: {
            label: traducir("shared.call.repair"),
            onClick: () => { void repararMicroRef.current(); },
          },
        });
      });
      pista.on(TrackEvent.UpstreamResumed, () => toast.dismiss(ID_AVISO_MIC_SIN_SALIDA));
    }
  }, []);
  // El fondo al que el hook tuvo que caerse por su cuenta (hoy solo "none",
  // cuando la imagen ya no existe). La UI dibuja su propio estado, así que sin
  // esto el botón se quedaba encendido sobre una cámara sin fondo.
  const [fondoCorregido, setFondoCorregido] = useState<BackgroundEffect | null>(null);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // ── Re-entrada automática tras una caída (ver conexionSala.ts) ───────────
  // La decisión del 29/09 dejó, tras la caída, un cartel con un botón manual
  // para volver. La queja del equipo (14/10: «estás hablando y se cae») es que
  // ese botón lo aprieta un humano. Ahora, si fueUnaCaida(razón) —ni salir a
  // propósito, ni otra pestaña, ni expulsión—, se vuelve a entrar solo con
  // token nuevo: hasta 4 intentos (2 s, 4 s, 8 s, 8 s). El cartel sigue
  // existiendo: se ve durante el intento y se queda, con su botón, solo si
  // los cuatro fallan.
  const ultimaConexionRef = useRef<{ roomName: string; participantName: string; isAdmin: boolean; options: ConnectOptions } | null>(null);
  const reentradasRef = useRef(0);
  const reentradaTimerRef = useRef<number | null>(null);
  const programarReentradaRef = useRef<(razon?: DisconnectReason | null) => void>(() => {});

  // Telemetría de cortes (tabla llamada_cortes): cada parpadeo y cada caída
  // queda con su motivo, para saber si el cuello es el servidor, la red o la
  // app. Fuego y olvido, con catch: la telemetría jamás rompe una llamada.
  // El tipo angosto es porque la tabla es más nueva que los tipos generados
  // de Supabase (mismo idioma que ClienteQueEscribe en admin-user-actions).
  type InsertaCorte = (tabla: "llamada_cortes") => {
    insert: (fila: { sala: string | null; fase: string; motivo: string | null; contexto: Record<string, unknown> | null }) =>
      PromiseLike<{ error: { message: string } | null }>;
  };
  // La última muestra de salud (saludDeLlamada.ts) viaja con cada corte: así el
  // corte dice si en ese momento el computador no daba, el internet no subía o
  // la pestaña estaba dormida.
  const ultimaMuestraRef = useRef<MuestraDeLlamada | null>(null);
  const pararMuestreoRef = useRef<(() => void) | null>(null);
  const anotarCorte = useCallback((fase: string, sala?: string | null, razon?: DisconnectReason | number | null, extra?: Record<string, unknown>) => {
    try {
      const motivo = razon == null
        ? null
        : ((DisconnectReason as unknown as Record<number, string>)[razon as number] ?? String(razon));
      const contexto = { ...(ultimaMuestraRef.current ?? {}), vis_ahora: document.visibilityState, en_linea: navigator.onLine, ...(extra ?? {}) };
      void (supabase.from as unknown as InsertaCorte)("llamada_cortes")
        .insert({ sala: sala ?? null, fase, motivo, contexto })
        .then(({ error }) => { if (error) console.warn("[llamada_cortes]", error.message); });
    } catch { /* sin telemetría, pero con llamada */ }
  }, []);

  type InsertaSalud = (tabla: "llamada_salud") => {
    insert: (fila: { sala: string; datos: MuestraDeLlamada }) => PromiseLike<{ error: { message: string } | null }>;
  };
  // Si el componente se desmonta sin colgar, el reloj de muestras no queda vivo.
  useEffect(() => () => { pararMuestreoRef.current?.(); }, []);

  /** Mide la llamada una vez por minuto (y una a los 15 s de entrar). */
  const iniciarMuestreo = useCallback((room: Room) => {
    pararMuestreoRef.current?.();
    const retraso = medirRetraso();
    const leer = async (fuente: Track.Source): Promise<LecturaDePista | null> => {
      const pista = room.localParticipant.getTrackPublication(fuente)?.track;
      if (!pista) return null;
      const reporte = await pista.getRTCStatsReport().catch(() => undefined);
      return reporte ? leerReporte(reporte.values() as Iterable<Record<string, unknown>>) : null;
    };
    const tomar = async () => {
      try {
        if (roomRef.current !== room || room.state !== ConnectionState.Connected) return;
        const [cam, pant, mic] = await Promise.all([
          leer(Track.Source.Camera), leer(Track.Source.ScreenShare), leer(Track.Source.Microphone),
        ]);
        const muestra = armarMuestra({
          vis: document.visibilityState,
          calidad: mapConnectionQuality(room.localParticipant.connectionQuality),
          cam, pant, mic, lag_ms: retraso.leer(),
        });
        ultimaMuestraRef.current = muestra;
        marcarLlamadaEnCurso(room.name); // la marca de «sigue viva» se renueva
        void (supabase.from as unknown as InsertaSalud)("llamada_salud")
          .insert({ sala: room.name, datos: muestra })
          .then(({ error }) => { if (error) console.warn("[llamada_salud]", error.message); });
      } catch { /* medir jamás rompe la llamada */ }
    };
    const primera = window.setTimeout(() => { void tomar(); }, 15_000);
    const cada = window.setInterval(() => { void tomar(); }, MUESTRA_CADA_MS);
    pararMuestreoRef.current = () => {
      window.clearTimeout(primera);
      window.clearInterval(cada);
      retraso.parar();
      pararMuestreoRef.current = null;
    };
  }, []);
  // Nos sacaron porque esta misma cuenta entró desde otra pestaña o equipo.
  // Va aparte de `error` a propósito: no se rompió nada, y sobre todo NO se
  // reintenta — reintentar es lo que arma la pelea infinita entre las dos.
  const [otraPestanaTomoLaSesion, setOtraPestanaTomoLaSesion] = useState(false);
  // POR QUÉ nos soltó la sala la última vez. Sin esto no se distingue una caída
  // (red, servidor: hay que volver solos) de una salida a propósito (salió,
  // cambió de sala, la sacó el supervisor: NO se vuelve). Ver lib/conexionSala.
  const [razonDeSalida, setRazonDeSalida] = useState<DisconnectReason | null>(null);
  // Número del intento de conexión VIGENTE. `disconnect()` lo invalida. Sin esto,
  // un intento que todavía esperaba el token cuando se pidió otro creaba igual su
  // sala: quedaban DOS conexiones, y la huérfana publicaba el micrófono sin que
  // nadie pudiera silenciarla (el botón actuaba sobre la otra).
  const intentoRef = useRef(0);
  const handRaisedMap = useRef<Record<string, boolean>>({});
  const preferredDevicesRef = useRef<{
    audioDeviceId?: string;
    videoDeviceId?: string;
    audioOutputDeviceId?: string;
  }>({});
  const backgroundEffectRef = useRef<BackgroundEffect>("none");
  const bgLastAppliedEffectRef = useRef<BackgroundEffect>("none");
  const bgRequestedEffectRef = useRef<BackgroundEffect>("none");
  const bgApplyOpRef = useRef(0);
  const bgApplyQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const bgQueueInFlightRef = useRef(false);
  const bgFailureCooldownUntilRef = useRef(0);
  const bgReapplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);
  const audioResumeCleanupRef = useRef<(() => void) | null>(null);
  /** Da de baja el desbloqueo de audio de esta Room (ver lib/audioDeLaLlamada). */
  const bajaDesbloqueoAudioRef = useRef<(() => void) | null>(null);
  // Track whether the initial background has been applied for this session
  const bgInitialApplyDoneRef = useRef(false);
  // Prevent automatic background restoration after reload/failure (user can re-enable manually)
  const skipAutoBackgroundRestoreRef = useRef(false);
  // Hide local camera tile while a background effect is being prepared for the current track.
  const holdLocalVideoUntilBackgroundRef = useRef(false);
  // Vigilante del freno de dibujado. Se pone en true desde una docena de
  // lugares y se apaga desde otros tantos; alcanza con que UN camino no lo
  // apague para que la vista local se quede en negro para siempre. En vez de
  // auditar los doce, se le pone vencimiento: si lleva mas de 6 s frenado, el
  // fondo ya no va a llegar y es mejor mostrar el video sin efecto que no
  // mostrar nada.
  const holdDesdeRef = useRef<number | null>(null);
  // Se rellena mas abajo, cuando `refreshParticipants` ya existe. Con una ref y
  // no con la funcion directa para no depender del orden de declaracion — eso
  // ya nos tumbo la pagina dos veces.
  const refreshParticipantsRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!holdLocalVideoUntilBackgroundRef.current) { holdDesdeRef.current = null; return; }
      if (holdDesdeRef.current === null) { holdDesdeRef.current = Date.now(); return; }
      if (Date.now() - holdDesdeRef.current > 6000) {
        holdLocalVideoUntilBackgroundRef.current = false;
        holdDesdeRef.current = null;
        refreshParticipantsRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  // ── Noise cancellation ──────────────────────────────────────────
  const [isNoiseCancellationOn, setIsNoiseCancellationOn] = useState(false);
  const ncProcessorRef = useRef<NoiseSuppresionTrackProcessor | null>(null);
  const ncEnabledRef = useRef(false);

  const buildParticipant = useCallback((p: Participant, isLocal: boolean): LKParticipant => {
    const audioTrack = Array.from(p.audioTrackPublications.values()).find(
      (t) => t.source === Track.Source.Microphone
    );
    const videoTrack = Array.from(p.videoTrackPublications.values()).find(
      (t) => t.source === Track.Source.Camera
    );
    const screenTrack = Array.from(p.videoTrackPublications.values()).find(
      (t) => t.source === Track.Source.ScreenShare
    );

    const localParticipant = p as any;
    const micMuted = isLocal
      ? (typeof localParticipant.isMicrophoneEnabled === "boolean" ? !localParticipant.isMicrophoneEnabled : (audioTrack ? audioTrack.isMuted : true))
      : (audioTrack ? audioTrack.isMuted || !audioTrack.isSubscribed : true);

    const shouldHoldLocalVideo =
      isLocal && holdLocalVideoUntilBackgroundRef.current && backgroundEffectRef.current !== "none";

    // El estado REAL de la camara, sin el freno de dibujado.
    const camOffReal = isLocal
      ? (typeof localParticipant.isCameraEnabled === "boolean" ? !localParticipant.isCameraEnabled : (videoTrack ? videoTrack.isMuted : true))
      : (videoTrack ? videoTrack.isMuted || !videoTrack.isSubscribed : true);

    // `shouldHoldLocalVideo` es un freno de DIBUJADO: no mostrar el video crudo
    // antes de aplicar el fondo. Se propaga a `camOff` para que la vista local
    // no parpadee... y ahi estaba el problema: ese mismo `camOff` es el que
    // viaja al supervisor. Si el freno queda pegado —el fondo no termina de
    // aplicarse, la camara se reinicia, lo que sea— el supervisor ve "camara
    // apagada" y el supervisor de encuadre le reclama a alguien que se esta
    // viendo perfectamente. Le paso a Jhon probando, con su cara en pantalla.
    //
    // Se separan: `camOff` sigue gobernando el dibujado, `camOffReal` es lo que
    // se reporta. Un detalle de render no puede acusar a nadie.
    const camOff = shouldHoldLocalVideo ? true : camOffReal;

    const isScreenSharing = !!screenTrack && !screenTrack.isMuted;
    const hasCameraTrack = !!videoTrack?.track && !videoTrack.isMuted;
    const hasScreenTrack = !!screenTrack?.track && !screenTrack.isMuted;

    return {
      isCameraOffReal: camOffReal,
      sid: p.sid,
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: p.isSpeaking,
      isMuted: micMuted,
      isCameraOff: camOff,
      isScreenSharing,
      isLocal,
      handRaised: handRaisedMap.current[p.identity] || false,
      reactions: [],
      connectionQuality: mapConnectionQuality(p.connectionQuality),
      hasVideoTrack: isScreenSharing ? hasScreenTrack : hasCameraTrack,
    };
  }, []);

  // ── Debounced participant refresh ──────────────────────────────
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSyncInterval = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  const clearBackgroundReapplyTimer = useCallback(() => {
    if (bgReapplyTimerRef.current) {
      clearTimeout(bgReapplyTimerRef.current);
      bgReapplyTimerRef.current = null;
    }
  }, []);

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const result: LKParticipant[] = [];
    const local = buildParticipant(room.localParticipant, true);

    const tilesDe = (p: Participant, base: LKParticipant) => {
      const pubs = Array.from(p.videoTrackPublications.values());
      const screenPub = pubs.find((t) => t.source === Track.Source.ScreenShare);
      const camPub = pubs.find((t) => t.source === Track.Source.Camera);
      return tilesDeParticipante(base, !!screenPub?.track && !screenPub.isMuted, !!camPub?.track && !camPub.isMuted);
    };
    result.push(...tilesDe(room.localParticipant, local));
    room.remoteParticipants.forEach((p) => { result.push(...tilesDe(p, buildParticipant(p, false))); });

    setParticipants(result);
  }, [buildParticipant]);
  refreshParticipantsRef.current = refreshParticipants;

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refreshParticipants(), 50);
  }, [refreshParticipants]);

  const camToggleInFlightRef = useRef(false);
  const videoSwitchInFlightRef = useRef(false);
  const pendingVideoSwitchDeviceIdRef = useRef<string | null>(null);
  const lastVideoSwitchAtRef = useRef(0);

  const getLocalCameraPublication = useCallback((room: Room) => {
    return Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (publication) => publication.source === Track.Source.Camera,
    );
  }, []);

  const hasActiveCameraPublication = useCallback((room: Room) => {
    const cameraPublication = getLocalCameraPublication(room);
    return !!cameraPublication?.track && !cameraPublication.isMuted;
  }, [getLocalCameraPublication]);

  const getLocalCameraTrack = useCallback((room: Room) => {
    return (getLocalCameraPublication(room)?.track as any) || null;
  }, [getLocalCameraPublication]);

  const waitForCameraPublication = useCallback(
    async (room: Room, delays: number[]) => {
      let isCameraReady = hasActiveCameraPublication(room);

      for (const delayMs of delays) {
        if (isCameraReady) break;
        await wait(delayMs);
        isCameraReady = hasActiveCameraPublication(room);
        refreshParticipants();
      }

      return isCameraReady;
    },
    [hasActiveCameraPublication, refreshParticipants],
  );

  const disposeBackgroundProcessor = useCallback(async () => {
    bgApplyOpRef.current += 1;
    const processor = bgProcessorRef.current;
    bgProcessorRef.current = null;
    bgAttachedTrackRef.current = null;
    bgLastAppliedEffectRef.current = "none";

    if (!processor) return; // Fast path: nothing to dispose

    if (processor.destroy) {
      try {
        await withTimeout(Promise.resolve(processor.destroy()), 1500, "bg-destroy");
      } catch {
        // no-op
      }
    }
  }, []);

  const enableCameraWithRecovery = useCallback(
    async (room: Room, preferredVideoDeviceId?: string) => {
      const useBackgroundSafeProfile = backgroundEffectRef.current !== "none";
      const videoConstraint = getVideoConstraint(preferredVideoDeviceId, useBackgroundSafeProfile);

      // Attempt 1: preferred device + profile-aware constraints
      try {
        await room.localParticipant.setCameraEnabled(true, videoConstraint);
        const isReady = await waitForCameraPublication(room, [80, 150, 300]);
        if (isReady) {
          refreshParticipants();
          return true;
        }
      } catch (err) {
        console.warn("[LiveKit] Camera enable attempt 1 failed:", err);
      }

      // Attempt 2: hard reset camera + processor, then enable using fallback constraints
      try {
        await disposeBackgroundProcessor();
        await room.localParticipant.setCameraEnabled(false);
        await wait(80);
        await room.localParticipant.setCameraEnabled(true, getVideoConstraint(undefined, useBackgroundSafeProfile));
        const isReady = await waitForCameraPublication(room, [100, 200, 400]);
        if (isReady) {
          refreshParticipants();
          return true;
        }
      } catch (err) {
        console.warn("[LiveKit] Camera enable attempt 2 failed:", err);
      }

      // All attempts failed
      try { await room.localParticipant.setCameraEnabled(false); } catch {}
      setIsCamOn(false);
      refreshParticipants();
      return false;
    },
    [refreshParticipants, waitForCameraPublication, disposeBackgroundProcessor],
  );

  const applyBackgroundEffectToCurrentCamera = useCallback(async (effect: BackgroundEffect) => {
    const room = roomRef.current;
    if (!room) return false;

    if (effect !== "none" && !supportsBackgroundProcessors()) {
      console.warn("[LiveKit] Background processors are not supported in this browser.");
      return false;
    }

    if (effect !== "none" && Date.now() < bgFailureCooldownUntilRef.current) {
      return false;
    }

    const opId = ++bgApplyOpRef.current;
    const cameraPublication = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (publication) => publication.source === Track.Source.Camera,
    );
    const camTrack = cameraPublication?.track as any;

    if (!camTrack) {
      if (effect === "none") {
        bgLastAppliedEffectRef.current = "none";
        await disposeBackgroundProcessor();
        return true;
      }
      return false;
    }

    const effectAlreadyApplied = effect === bgLastAppliedEffectRef.current;
    const needsProcessorAttach = effect !== "none" && bgAttachedTrackRef.current !== camTrack;

    if (effectAlreadyApplied && !needsProcessorAttach) {
      return true;
    }

    try {
      if (effect === "none") {
        const existingProcessor = bgProcessorRef.current;
        if (existingProcessor?.switchTo) {
          await withTimeout(
            Promise.resolve(existingProcessor.switchTo({ mode: "disabled" })),
            BACKGROUND_SWITCH_TIMEOUT_MS,
            "bg-disable",
          );
        }

        bgLastAppliedEffectRef.current = "none";
        refreshParticipants();
        return true;
      }

      // Lazy-create the processor — the constructor loads the ML model
      let processor = bgProcessorRef.current;
      if (!processor) {
        processor = BackgroundProcessor({ mode: "disabled" });
        bgProcessorRef.current = processor;
      }

      if (bgAttachedTrackRef.current !== camTrack) {
        await withTimeout(
          Promise.resolve(camTrack.setProcessor(processor, true)),
          BACKGROUND_ATTACH_TIMEOUT_MS,
          "bg-attach",
        );
        bgAttachedTrackRef.current = camTrack;
      }

      if (opId !== bgApplyOpRef.current) return false;

      if (esBlur(effect)) {
        // Dos niveles (09/09/2026): el radio sale de `radioDeBlur`, un solo
        // lugar compartido con la vista previa del lobby. Antes estaba
        // hardcodeado acá Y allá, así que cualquier cambio hacía que el lobby
        // mintiera respecto a la llamada.
        await withTimeout(
          Promise.resolve(processor.switchTo({ mode: "background-blur", blurRadius: radioDeBlur(effect) })),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-blur",
        );
      } else if (isTemplateBackground(effect) || isCustomBackground(effect)) {
        // Un solo resolvedor para plantillas y para las imágenes propias: las
        // propias viven en IndexedDB y su URL se recrea por documento.
        // ⚠️ CON TIMEOUT: es el único await de este camino que sale del
        // navegador, y este camino corre DENTRO de connect(). Un pedido de
        // IndexedDB que no dispara ni onsuccess ni onerror (pasa en WebKit)
        // dejaría connect() sin terminar: sin desbloqueo de audio, sin sync de
        // participantes y con `connectingRef` trabado en true para siempre.
        const imagen = await withTimeout(
          resolverImagenDeFondo(effect, window.location.origin),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-resolver",
        ).catch((): ImagenDeFondo => ({ falta: false }));

        // ⚠️ Re-chequeo OBLIGATORIO tras el await: si mientras se resolvía la
        // persona eligió otro fondo, seguir acá pisaría su elección nueva (y la
        // rama de abajo hasta le borraría la preferencia).
        if (opId !== bgApplyOpRef.current) return false;

        const processorUrl = "url" in imagen ? imagen.url : null;

        if (!processorUrl) {
          // Dos casos MUY distintos:
          //  · `falta` → la imagen ya no existe (plantilla renombrada, fondo
          //    propio borrado en otra pestaña). Se cae a "sin efecto" y se
          //    limpia lo guardado.
          //  · si no → no se pudo averiguar (almacenamiento con un hipo). NO se
          //    toca la preferencia: borrarla por un fallo pasajero es
          //    exactamente el problema que este cambio vino a resolver.
          // En los dos casos hay que AVISAR: sin aviso la persona cree que
          // tiene fondo y está publicando su habitación real.
          const desaparecio = "falta" in imagen && imagen.falta === true;
          console.warn("[LiveKit] No se pudo poner el fondo:", effect, desaparecio ? "(ya no existe)" : "(no se pudo leer)");
          // La UI se corrige en LOS DOS casos: lo que la persona necesita saber
          // es que AHORA no tiene fondo, y el interruptor encendido sobre una
          // cámara sin fondo es el error que más caro sale acá.
          // Lo que se decide distinto es la PREFERENCIA GUARDADA: solo se borra
          // si la imagen de verdad no está.
          setFondoCorregido("none");
          if (desaparecio) {
            guardarFondo("none");
            backgroundEffectRef.current = "none";
            bgRequestedEffectRef.current = "none";
            toast.error(traducir("shared.call.bgGone"), {
              description: traducir("shared.call.bgGoneDesc"),
              id: "fondo-perdido",
            });
          } else {
            toast.error(traducir("shared.call.bgFailed"), {
              description: traducir("shared.call.bgFailedDesc"),
              id: "fondo-perdido",
            });
          }
          bgLastAppliedEffectRef.current = "none";
          if (processor.switchTo) {
            await withTimeout(
              Promise.resolve(processor.switchTo({ mode: "disabled" })),
              BACKGROUND_SWITCH_TIMEOUT_MS,
              "bg-disable",
            ).catch(() => { /* ya está en disabled o murió; da igual */ });
          }
          refreshParticipants();
          return true;
        }

        if (!preloadedBackgroundsRef.current.has(processorUrl)) {
          // Con tope: esto corre dentro de connect(), y una foto que no termina
          // de bajar (ni carga ni error) trababa la entrada entera a la llamada.
          await withTimeout(new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = processorUrl;
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("bg-image-load-failed"));
          }), BACKGROUND_SWITCH_TIMEOUT_MS, "bg-precarga");
          preloadedBackgroundsRef.current.add(processorUrl);
        }

        if (opId !== bgApplyOpRef.current) return false;

        await withTimeout(
          Promise.resolve(
            processor.switchTo({
              mode: "virtual-background",
              imagePath: processorUrl,
            }),
          ),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-imagen",
        );
      } else {
        return false;
      }

      if (opId !== bgApplyOpRef.current) return false;

      bgFailureCooldownUntilRef.current = 0;
      bgLastAppliedEffectRef.current = effect;
      refreshParticipants();
      setTimeout(() => refreshParticipants(), 140);
      return true;
    } catch (err) {
      console.error("Background processor error:", err);

      if (opId !== bgApplyOpRef.current) return false;

      bgFailureCooldownUntilRef.current = Date.now() + BACKGROUND_FAILURE_COOLDOWN_MS;

      // Clean up processor from the track
      try {
        await withTimeout(Promise.resolve(camTrack.stopProcessor?.()), 1200, "bg-stop");
      } catch {
        // no-op
      }

      bgAttachedTrackRef.current = null;
      bgLastAppliedEffectRef.current = "none";
      await disposeBackgroundProcessor();

      // Critical stability guard: never force camera restart when background ML fails.
      // Keep camera stream alive and disable only automatic background re-apply.
      skipAutoBackgroundRestoreRef.current = effect !== "none";

      // Y AVISAR. Este camino apaga los reintentos automáticos, así que la
      // cámara se queda publicando sin fondo hasta que la persona toque algo.
      // Sin esto el botón quedaba encendido sobre la habitación real: mismo
      // problema que el fondo que ya no existe, distinta causa. La preferencia
      // NO se borra —el fondo sigue siendo válido, falló el procesador—, solo
      // se corrige lo que la interfaz muestra.
      if (effect !== "none") {
        setFondoCorregido("none");
        toast.error(traducir("shared.call.bgApplyFailed"), {
          description: traducir("shared.call.bgFailedDesc"),
          id: "fondo-fallo",
        });
      }
      refreshParticipants();

      return false;
    }
  }, [disposeBackgroundProcessor, refreshParticipants]);

  const queueBackgroundEffectApply = useCallback((effect: BackgroundEffect) => {
    bgRequestedEffectRef.current = effect;

    if (bgQueueInFlightRef.current) {
      return bgApplyQueueRef.current;
    }

    bgQueueInFlightRef.current = true;
    bgApplyQueueRef.current = (async () => {
      try {
        // Coalesced loop: process only the latest requested effect.
        // This avoids an ever-growing promise chain under rapid camera refreshes.
        let iterations = 0;
        while (iterations++ < 6) {
          const room = roomRef.current;
          if (!room) return false;

          const nextEffect = bgRequestedEffectRef.current;
          const cameraPublication = Array.from(room.localParticipant.videoTrackPublications.values()).find(
            (publication) => publication.source === Track.Source.Camera,
          );
          const camTrack = cameraPublication?.track as any;
          const camReady = !!camTrack || room.localParticipant.isCameraEnabled;

          if (!camReady) {
            bgLastAppliedEffectRef.current = "none";
            return nextEffect === "none";
          }

          const processorAttached = !!camTrack && bgAttachedTrackRef.current === camTrack;
          if (nextEffect === bgLastAppliedEffectRef.current && (nextEffect === "none" || processorAttached)) {
            return true;
          }

          const applied = await applyBackgroundEffectToCurrentCamera(nextEffect);
          if (bgRequestedEffectRef.current === nextEffect) {
            return applied;
          }
        }

        return false;
      } finally {
        bgQueueInFlightRef.current = false;
      }
    })();

    return bgApplyQueueRef.current;
  }, [applyBackgroundEffectToCurrentCamera]);

  /**
   * Non-blocking background apply: schedules via requestIdleCallback
   * so the ML model initialization doesn't freeze the main thread on page load.
   * This is the key fix for the "page not responding" freeze on reload.
   */
  const scheduleBackgroundApply = useCallback((room: Room) => {
    if (backgroundEffectRef.current === "none") return;
    if (skipAutoBackgroundRestoreRef.current) return;
    if (bgInitialApplyDoneRef.current) return;
    bgInitialApplyDoneRef.current = true;

    scheduleWhenIdle(() => {
      // Double-check room is still valid after idle delay
      if (roomRef.current !== room) return;
      if (backgroundEffectRef.current === "none") return;
      if (skipAutoBackgroundRestoreRef.current) return;

      const hasTrack = Array.from(room.localParticipant.videoTrackPublications.values()).some(
        (p) => p.source === Track.Source.Camera && p.track,
      );

      if (hasTrack) {
        queueBackgroundEffectApply(backgroundEffectRef.current);
      } else {
        // Camera track not ready yet — wait and retry once
        wait(400).then(() => {
          if (roomRef.current !== room || backgroundEffectRef.current === "none") return;
          if (skipAutoBackgroundRestoreRef.current) return;
          queueBackgroundEffectApply(backgroundEffectRef.current);
        });
      }
    }, 800); // Give the page 800ms to render before starting ML
  }, [queueBackgroundEffectApply]);

  const scheduleDeferredBackgroundReapply = useCallback((room: Room, delayMs = 320) => {
    if (backgroundEffectRef.current === "none") return;
    if (skipAutoBackgroundRestoreRef.current) return;

    clearBackgroundReapplyTimer();
    const expectedEffect = backgroundEffectRef.current;

    bgReapplyTimerRef.current = setTimeout(() => {
      bgReapplyTimerRef.current = null;
      scheduleWhenIdle(() => {
        if (roomRef.current !== room) return;
        if (skipAutoBackgroundRestoreRef.current) return;
        if (backgroundEffectRef.current !== expectedEffect) return;
        void queueBackgroundEffectApply(expectedEffect);
      }, 250);
    }, delayMs);
  }, [clearBackgroundReapplyTimer, queueBackgroundEffectApply]);

  const applyConfiguredBackgroundIfNeeded = useCallback(async (room: Room) => {
    if (backgroundEffectRef.current === "none") {
      bgLastAppliedEffectRef.current = "none";
      return true;
    }

    if (skipAutoBackgroundRestoreRef.current) {
      return false;
    }

    // Fast-check: if track is already available, skip polling entirely
    const hasTrack = Array.from(room.localParticipant.videoTrackPublications.values()).some(
      (p) => p.source === Track.Source.Camera && p.track,
    );
    if (!hasTrack) {
      const cameraReady = await waitForCameraPublication(room, [40, 80, 150]);
      if (!cameraReady) return false;
    }

    return queueBackgroundEffectApply(backgroundEffectRef.current);
  }, [queueBackgroundEffectApply, waitForCameraPublication]);

  const applyBackgroundBeforeLocalVideoVisible = useCallback(async (room: Room) => {
    if (backgroundEffectRef.current === "none") {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
      return true;
    }

    if (skipAutoBackgroundRestoreRef.current) {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
      return false;
    }

    holdLocalVideoUntilBackgroundRef.current = true;
    refreshParticipants();

    try {
      return await applyConfiguredBackgroundIfNeeded(room);
    } finally {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
    }
  }, [applyConfiguredBackgroundIfNeeded, refreshParticipants]);

  // ── Cleanup audio resume listeners ─────────────────────────────
  const cleanupAudioResumeListeners = useCallback(() => {
    if (audioResumeCleanupRef.current) {
      audioResumeCleanupRef.current();
      audioResumeCleanupRef.current = null;
    }
    // La espera de gesto vive en la libreria (cubre TODOS los documentos, no
    // solo el principal), asi que se corta desde aca tambien.
    dejarDeEsperarGesto();
    bajaDesbloqueoAudioRef.current?.();
    bajaDesbloqueoAudioRef.current = null;
  }, []);

  // ── Kick all audio elements (used after connect and reconnect) ─
  const kickAudioPlayback = useCallback((room: Room) => {
    room.startAudio().then(() => {
      console.info("[LiveKit] Audio context started successfully");
      // Antes: `document.querySelectorAll("audio[data-lk-audio]")`. Dos huecos.
      // (a) La llamada se muda a la ventana flotante del sistema, que es OTRO
      //     documento: los elementos quedaban fuera de alcance justo cuando la
      //     persona trabaja en otra cosa. (b) El sink los marcaba con otro
      //     atributo, asi que ni en el documento principal los encontraba.
      reproducirAudiosPausados();
    }).catch(() => {});
  }, []);

  // ── Connect ────────────────────────────────────────────────────
  const connect = useCallback(async (
    roomName: string,
    participantName: string,
    isAdmin = false,
    options: ConnectOptions = {},
  ) => {
    // Empieza un intento nuevo: la marca de "me la tomaron" ya no aplica.
    setOtraPestanaTomoLaSesion(false);
    setRazonDeSalida(null);
    // Guard against concurrent connect calls
    if (connectingRef.current) {
      console.warn("[LiveKit] Connect already in progress, ignoring duplicate call");
      return;
    }
    connectingRef.current = true;
    // La re-entrada automática recuerda estos argumentos, y un connect nuevo
    // (manual o automático) cancela cualquier reintento que esté esperando.
    if (reentradaTimerRef.current != null) {
      clearTimeout(reentradaTimerRef.current);
      reentradaTimerRef.current = null;
    }
    ultimaConexionRef.current = { roomName, participantName, isAdmin, options };
    const intento = ++intentoRef.current;
    const vigente = () => intento === intentoRef.current;
    // Mientras ENTRA también es una llamada: una recarga ahora (un deploy, o el
    // mínimo de versión de pwa.ts) la cortaría igual. Se suelta en el finally; si
    // conectó, la sala ya quedó marcada con marcarLlamadaActiva.
    const soltarConexionEnCurso = marcarConexionEnCurso(roomName);
    // ¿La llamada anterior murió con la página (recarga o pestaña descartada)?
    if (!recargaRevisada) {
      recargaRevisada = true;
      const previa = recargaConLlamada();
      if (previa && previa.hace_s <= 180) {
        anotarCorte("recarga", previa.sala, null, { nav: previa.nav, descartada: previa.descartada, hace_s: previa.hace_s });
      }
    }

    let livekitUrlForError: string | undefined;

    try {
      if (roomRef.current) {
        quitarLlamadaActiva(roomRef.current.name);
        roomRef.current.disconnect(true);
        roomRef.current = null;
      }
      clearSyncInterval();
      clearBackgroundReapplyTimer();
      cleanupAudioResumeListeners();
      bgQueueInFlightRef.current = false;
      bgApplyQueueRef.current = Promise.resolve(true);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      preferredDevicesRef.current = {
        audioDeviceId: options.audioDeviceId,
        videoDeviceId: options.videoDeviceId,
        audioOutputDeviceId: options.audioOutputDeviceId,
      };
      // Si quien llama no dice nada (Cowork en sus cuatro caminos, el invitado
      // de Meet), vale lo último que la persona eligió. Antes caía a "none" y de
      // ahí el reporte "el fondo que escoge no se guarda": en Cowork no había
      // NINGUNA forma de que volviera.
      backgroundEffectRef.current = options.backgroundEffect || leerFondoGuardado();
      bgInitialApplyDoneRef.current = false;
      // ⚠️ Acá antes se apagaba el fondo PARA SIEMPRE cuando la navegación era
      // una recarga (se miraba `performance` para saber si el documento venía
      // de un F5).
      // Con el fondo ahora guardado eso dejaba el interruptor mintiendo — la UI
      // decía "difuminado" y el video salía limpio, el mismo bug que ya tuvo el
      // botón de cancelación de ruido.
      //
      // Se saca, y esto es POR QUÉ es seguro (no por el requestIdleCallback:
      // `scheduleBackgroundApply` solo se llama en la rama donde el efecto ya es
      // "none", así que ahí retorna en su primera línea): el modelo ML se carga
      // ÚNICAMENTE dentro del bloque `if (shouldEnableCam)` de más abajo, y las
      // superficies que se conectan encima del arranque de la página —los cuatro
      // montajes de Cowork y el invitado de Meet— pasan TODAS
      // `initialCamOn: false`. La única que entra con cámara es la videollamada,
      // y ahí el connect sale de un clic en "Unirse", mucho después del load.
      // Si algún día alguna de esas superficies arranca con la cámara prendida,
      // hay que volver a diferir el fondo acá.
      skipAutoBackgroundRestoreRef.current = false;

      setError(null);
      setConnectionState(ConnectionState.Connecting);
      setParticipants([]);
      setChatMessages([]);
      setIsScreenSharing(false);
      setIsHandRaised(false);
      setActiveSpeaker(null);
      handRaisedMap.current = {};

      // El token viaja por la red ANTES de que exista sala, así que
      // reintentarlo no pelea con ninguna otra pestaña (eso solo pasa al
      // reconectar una sala viva). Sin esto, un parpadeo de red al montar
      // pintaba "Error de conexión" sin más salida que colgar — así quedó el
      // Hub del supervisor una mañana entera.
      const pedirToken = async (): Promise<{ token: string; url: string }> => {
        if (options.tokenProvider) return options.tokenProvider();
        const { data, error: fnErr } = await supabase.functions.invoke("livekit-token", {
          body: { roomName, participantName, isAdmin },
        });
        if (fnErr || !data?.token) {
          throw new Error(fnErr?.message || data?.error || "Failed to get token");
        }
        return { token: data.token, url: data.url };
      };
      const esperasToken = [700, 2000];
      let tokenData: { token: string; url: string } | null = null;
      for (let ronda = 0; tokenData === null; ronda++) {
        try {
          tokenData = await pedirToken();
        } catch (e) {
          if (ronda >= esperasToken.length || !vigente()) throw e;
          await new Promise((r) => setTimeout(r, esperasToken[ronda]));
          if (!vigente()) return;
        }
      }

      const livekitUrl = tokenData.url;
      livekitUrlForError = livekitUrl;
      if (!livekitUrl || typeof livekitUrl !== "string" || (!livekitUrl.startsWith("wss://") && !livekitUrl.startsWith("ws://"))) {
        throw new Error(`Invalid LiveKit URL: "${livekitUrl}". Ensure LIVEKIT_URL is configured.`);
      }

      // Mientras se esperaba el token se pidió otro intento (o salir): este ya no
      // es el vigente y NO crea sala.
      if (!vigente()) return;
      const room = new Room(ROOM_OPTIONS);
      roomRef.current = room;

      // ── Wire events ──────────────────────────────────────────
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        // Una sala que ya no es la vigente (se reemplazó por un reintento) no
        // escribe el estado de la nueva.
        if (roomRef.current !== room) return;
        setConnectionState(state);
      });

      room.on(RoomEvent.Reconnecting, () => {
        setIsReconnecting(true);
        anotarCorte("parpadeo", room.name);
        console.info("[LiveKit] Reconnecting...");
      });

      room.on(RoomEvent.Reconnected, () => {
        setIsReconnecting(false);
        anotarCorte("parpadeo_ok", room.name);
        console.info("[LiveKit] Reconnected successfully");
        refreshParticipants();

        // Force audio re-kick after reconnection
        kickAudioPlayback(room);

        // Re-apply background if needed (non-blocking)
        if (backgroundEffectRef.current !== "none" && !skipAutoBackgroundRestoreRef.current) {
          scheduleWhenIdle(() => {
            if (roomRef.current !== room) return;
            applyConfiguredBackgroundIfNeeded(room);
          }, 300);
        }
      });

      // Participant & track events
      room.on(RoomEvent.ParticipantConnected, (p) => {
        console.info("[LiveKit] Participant connected:", p.identity, p.name);
        if (avisaEntradasYSalidas(room.name)) playJoinSound();
        refreshParticipants();

        // El chat de LiveKit es EFIMERO: solo llega a quien esta conectado en
        // ese momento, asi que el que entra despues ve la conversacion vacia
        // aunque haya diez mensajes. Quien ya estaba se los pasa.
        //
        // Responde UNO SOLO —el de identity mas baja entre los que ya
        // estabamos— para no mandar N copias del mismo historial. Es una regla
        // deterministica: todos calculan el mismo ganador sin coordinarse.
        const yo = room.localParticipant.identity;
        const presentes = [yo, ...Array.from(room.remoteParticipants.values())
          .map((rp) => rp.identity).filter((id) => id !== p.identity)];
        if (presentes.sort()[0] !== yo) return;

        const historia = chatMessagesRef.current;
        if (!historia.length) return;
        // Un respiro para que el que entra termine de suscribirse: si se manda
        // en el mismo instante, puede no tener el handler listo todavia.
        window.setTimeout(() => {
          try {
            room.localParticipant.publishData(
              new TextEncoder().encode(JSON.stringify({
                type: "chat-history",
                payload: { messages: historia.slice(-MAX_CHAT_MESSAGES) },
              })),
              { reliable: true, destinationIdentities: [p.identity] },
            );
          } catch { /* si falla, el que entro simplemente ve el chat vacio */ }
        }, 800);
      });
      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        console.info("[LiveKit] Participant disconnected:", p.identity, p.name);
        if (avisaEntradasYSalidas(room.name)) {
          playLeaveSound();
          // Y un aviso con la cara de quien se fue (pedido de Jhon, 05/09):
          // el sonido solo dice "alguien"; el popup dice quién.
          void avisarSalidaDeLlamada(p, room);
        }
        refreshParticipants();
      });
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        console.info("[LiveKit] Track subscribed from:", participant.identity, "kind:", track.kind);
        debouncedRefresh();

        // Force audio playback for newly subscribed audio tracks
        if (track.kind === "audio") {
          room.startAudio().catch(() => {});
          // Si a los 200 ms sigue pausado, se espera el gesto que lo desbloquee
          // en vez de dejarlo mudo. Este es EL camino de la voz del supervisor:
          // entra sin camara, la grilla lo filtra y su audio vive solo en el
          // sink, que ningun recuperador encontraba.
          setTimeout(() => {
            reanudarAudioConGesto(`se suscribio audio de ${participant.identity}`);
          }, 200);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, debouncedRefresh);
      room.on(RoomEvent.TrackPublished, (_pub, participant) => {
        console.info("[LiveKit] Track published by:", participant.identity);
        debouncedRefresh();
      });
      room.on(RoomEvent.TrackMuted, debouncedRefresh);
      // ⚠️ `isMicOn` / `isCamOn` tienen que decir la VERDAD aunque el silencio lo
      // haya puesto OTRO (el supervisor desde el tablero). Antes solo se
      // actualizaban al tocar el botón propio, así que quedaban en "prendido"
      // con el micrófono silenciado. La pausa decidía con eso y, como toggleMic
      // mira el estado real, en vez de apagarlo lo PRENDÍA: la sala escuchaba la
      // casa de la persona durante toda la pausa.
      const sincronizarPropio = (pub: { source?: Track.Source } | undefined, participant: { isLocal?: boolean } | undefined) => {
        if (!participant?.isLocal || roomRef.current !== room) return;
        if (pub?.source === Track.Source.Microphone) setIsMicOn(room.localParticipant.isMicrophoneEnabled);
        if (pub?.source === Track.Source.Camera) setIsCamOn(hasActiveCameraPublication(room));
      };
      room.on(RoomEvent.TrackMuted, sincronizarPropio);
      room.on(RoomEvent.TrackUnmuted, sincronizarPropio);
      // Alguien mas me silencio: avisarlo. El micro se puede volver a prender
      // cuando uno quiera — el silencio de LiveKit no lo deja bloqueado.
      room.on(RoomEvent.TrackMuted, (pub: any, participant: any) => {
        if (!participant?.isLocal) return;
        if (pub?.source !== Track.Source.Microphone) return;
        if (Date.now() - meSilencieYoRef.current < 1500) return; // fui yo
        // Me silenció OTRO (un supervisor). Se sella igual, para que el
        // `silencioLargo` de toggleMic mida cuánto lleva callado el micrófono y
        // no cuándo fue la última vez que esta persona tocó el botón.
        meSilencieYoRef.current = Date.now();
        // Con id: si enseguida llega el aviso del servidor con nombre y cara
        // ("Jhon silenció tu micrófono"), reemplaza a este en vez de apilarse.
        toast.info(traducir("shared.call.someoneMutedYou"), {
          id: ID_AVISO_ME_SILENCIARON,
          description: traducir("shared.call.canTurnBackOn"),
          duration: 8000,
        });
      });
      room.on(RoomEvent.TrackUnmuted, debouncedRefresh);
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        if (publication?.source === Track.Source.Microphone) vigilarMicro(room);
        debouncedRefresh();
        // NOTE: Background is handled by scheduleBackgroundApply on connect
        // and applyConfiguredBackgroundIfNeeded on explicit toggleCam.
        // We do NOT trigger background apply here to avoid duplicate races.
      });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        // Parar de compartir desde la BARRA DE CHROME ("Dejar de compartir") no
        // pasa por nuestro botón: LiveKit despublica la pista y nadie actualizaba
        // el estado. Quedaba en "compartiendo", y el siguiente clic en el botón
        // mandaba un apagado al vacío en vez de volver a compartir — había que
        // tocarlo dos veces.
        if (publication?.source === Track.Source.ScreenShare) setIsScreenSharing(false);
        debouncedRefresh();
      });

      // Connection quality
      room.on(RoomEvent.ConnectionQualityChanged, debouncedRefresh);

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeaker(speakers.length > 0 ? speakers[0].identity : null);
        debouncedRefresh();
      });

      // El desbloqueo de ESTA Room, para que la libreria pueda levantar el
      // contexto de audio suspendido cuando llegue el gesto. Sin esto, el
      // `play()` del elemento no produce sonido si el contexto sigue abajo.
      bajaDesbloqueoAudioRef.current?.();
      bajaDesbloqueoAudioRef.current = registrarDesbloqueo(() => room.startAudio());

      // LiveKit mide 200 ms al publicar el micrófono y avisa si no captó NADA.
      // El evento existía y nadie lo escuchaba: entrar con el micrófono muerto
      // (lo tomó otro programa, el dispositivo guardado ya no está) no producía
      // ni una señal, y la persona se enteraba cuando alguien se lo decía.
      room.on(RoomEvent.LocalAudioSilenceDetected, () => {
        toast.warning(traducir("shared.call.micSilent"), {
          id: "mic-sin-captura",
          description: traducir("shared.call.micSilentDesc"),
          duration: 12000,
        });
      });

      // ── Handle autoplay policy (resume audio context) ────────
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) {
          // El navegador bloqueo la reproduccion. La espera del gesto la maneja
          // la libreria, que engancha los listeners en TODOS los documentos de
          // la llamada —incluida la ventana flotante del sistema, y tambien la
          // que se abra despues—. Antes se enganchaban solo al documento
          // principal: la persona podia hacer mil clics dentro de la ventana
          // flotante y ninguno llegaba, asi que el audio no volvia nunca.
          reanudarAudioConGesto("el navegador bloqueo la reproduccion");
        }
      });

      // ── Data messages ────────────────────────────────────────
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const msg: DataMessage = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "chat") {
            setChatMessages((prev) => {
              const newMessages = [
                ...prev,
                {
                  // El id viaja con el mensaje; el respaldo es solo para
                  // clientes viejos que todavia no lo mandan.
                  id: msg.payload.id ?? `${Date.now()}-${participant?.identity}`,
                  sender: participant?.identity || "unknown",
                  senderName: participant?.name || participant?.identity || "Unknown",
                  content: msg.payload.text,
                  timestamp: msg.payload.ts ?? Date.now(),
                },
              ];
              if (newMessages.length > MAX_CHAT_MESSAGES) {
                return newMessages.slice(newMessages.length - MAX_CHAT_MESSAGES);
              }
              return newMessages;
            });
            setUnreadChatCount((c) => c + 1);
            playChatMessageSound();
          } else if (msg.type === "chat-history") {
            // Alguien que ya estaba me pasa lo que se dijo antes de que entrara.
            // Se fusiona por id y se ordena por hora: si llegan dos historiales
            // (o uno mientras entran mensajes nuevos), no se duplica nada.
            const historia: LKChatMessage[] = Array.isArray(msg.payload?.messages)
              ? msg.payload.messages : [];
            if (!historia.length) return;
            setChatMessages((prev) => {
              const porId = new Map(prev.map((m) => [m.id, m]));
              for (const m of historia) if (m?.id && !porId.has(m.id)) porId.set(m.id, m);
              const todos = [...porId.values()].sort((a, b) => a.timestamp - b.timestamp);
              return todos.length > MAX_CHAT_MESSAGES
                ? todos.slice(todos.length - MAX_CHAT_MESSAGES) : todos;
            });
            // NO suena ni cuenta como no leido: es lo que ya se habia dicho, no
            // algo nuevo dirigido a quien acaba de entrar.
          } else if (msg.type === "hand") {
            handRaisedMap.current[participant?.identity || ""] = msg.payload.raised;
            if (msg.payload.raised) playHandRaisedSound();
            refreshParticipants();
          } else if (msg.type === "reaction") {
            setParticipants((prev) =>
              prev.map((p) =>
                p.identity === participant?.identity
                  ? { ...p, reactions: [...p.reactions, msg.payload.emoji] }
                  : p
              )
            );
            setTimeout(() => {
              setParticipants((prev) =>
                prev.map((p) =>
                  p.identity === participant?.identity
                    ? { ...p, reactions: p.reactions.slice(1) }
                    : p
                )
              );
            }, 15000);
          }
          if (msg.type === "aviso") {
            // Avisos del SERVIDOR (silenciado, grabación): llegan sin
            // remitente. Si trae remitente lo mandó un cliente: se ignora.
            if (!participant) void mostrarAvisoDeSala(msg.payload, room.localParticipant.identity);
          }
          // El tipo "moderation" del canal de datos se ELIMINÓ: mutear y expulsar
          // los ejecuta ahora el servidor (edge livekit-moderate). Obedecer una
          // orden que llegaba por datos era opcional para el cliente, y el
          // chequeo de "eres admin" que corría acá daba verdadero para cualquier
          // participante (comparaba canPublish && canSubscribe).
        } catch {}
      });

      room.on(RoomEvent.Disconnected, (razon) => {
        // ⚠️ Solo la sala VIGENTE. El Disconnected de una sala vieja llega tarde
        // (después de que el reintento ya empezó) y pisaba el estado de la nueva:
        // dejaba la razón CLIENT_INITIATED y el reloj volvía a "sin cámara".
        if (roomRef.current !== room) return;
        setOtraPestanaTomoLaSesion(esOtraPestana(razon));
        setRazonDeSalida(razon ?? null);
        clearSyncInterval();
        clearBackgroundReapplyTimer();
        cleanupAudioResumeListeners();
        bgQueueInFlightRef.current = false;
        bgApplyQueueRef.current = Promise.resolve(true);
        void disposeBackgroundProcessor();
        holdLocalVideoUntilBackgroundRef.current = false;
        setConnectionState(ConnectionState.Disconnected);
        setIsReconnecting(false);
        setParticipants([]);
        setActiveSpeaker(null);
        anotarCorte(fueUnaCaida(razon) ? "caida" : "salida", room.name, razon);
        pararMuestreoRef.current?.();
        if (!fueUnaCaida(razon)) borrarLlamadaEnCurso();
        // La caída de verdad no se queda esperando un clic: se vuelve solo.
        if (fueUnaCaida(razon)) programarReentradaRef.current(razon);
      });

      // ── Connect & publish tracks ────────────────────────────
      await room.connect(livekitUrl, tokenData.token);
      if (!vigente()) { void room.disconnect(true); return; }
      // Que la página NO se recargue sola por un deploy mientras esto dure.
      marcarLlamadaActiva(roomName);
      marcarLlamadaEnCurso(roomName);
      iniciarMuestreo(room);
      if (reentradasRef.current > 0) anotarCorte("reentrada_ok", roomName);
      reentradasRef.current = 0;
      room.once(RoomEvent.Disconnected, () => quitarLlamadaActiva(roomName));
      console.info("[LiveKit] Connected to room:", roomName, "as", room.localParticipant.identity);
      console.info("[LiveKit] Remote participants already in room:", room.remoteParticipants.size);

      const shouldEnableMic = options.initialMicOn ?? true;
      const shouldEnableCam = options.initialCamOn ?? true;

      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setCameraEnabled(false);

      // LA INTENCIÓN de cancelación de ruido se fija ACÁ, entre o no con el
      // micro encendido. Antes solo se fijaba dentro de `if (shouldEnableMic)`:
      // quien entraba silenciado —que es SIEMPRE el caso en Cowork, y lo normal
      // en un Meet— arrancaba con la cancelación en falso, y al prender el micro
      // después `reapplyNC` no hacía nada porque miraba esa bandera. Resultado:
      // el interruptor decía "Desactivada" con la preferencia en "true", y en
      // Cowork la cancelación no se aplicaba nunca. El procesador en sí se
      // engancha cuando hay un track de micro: ahora si entra encendido, o en
      // `reapplyNC` cuando lo prenda.
      const ncDeseado = loadNCPreference() && supportsNoiseSuppression();
      ncEnabledRef.current = ncDeseado;
      setIsNoiseCancellationOn(ncDeseado);

      if (shouldEnableMic) {
        await room.localParticipant.setMicrophoneEnabled(true, getDeviceConstraint(options.audioDeviceId));
        // Apply noise cancellation if saved preference is on
        if (ncDeseado) {
          try {
            await wait(80);
            const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
              (p) => p.source === Track.Source.Microphone,
            );
            const localAudioTrack = micPub?.track;
            if (localAudioTrack) {
              const processor = new NoiseSuppresionTrackProcessor((m) => alFallarNCRef.current(m));
              ncProcessorRef.current = processor;
              await (localAudioTrack as any).setProcessor(processor);
              console.info("[LiveKit] Noise cancellation applied on connect");
            }
          } catch (err) {
            console.warn("[LiveKit] NC init error:", err);
            ncEnabledRef.current = false;
            setIsNoiseCancellationOn(false);
          }
        }
      }

      if (shouldEnableCam) {
        const shouldGateVideoUntilBackground = backgroundEffectRef.current !== "none" && !skipAutoBackgroundRestoreRef.current;
        if (shouldGateVideoUntilBackground) {
          bgFailureCooldownUntilRef.current = 0;
          holdLocalVideoUntilBackgroundRef.current = true;
          refreshParticipants();
        }

        const cameraEnabled = await enableCameraWithRecovery(room, options.videoDeviceId);

        if (cameraEnabled) {
          if (shouldGateVideoUntilBackground) {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 260);
            }
          } else {
            // Fallback path when no effect is active or auto-restore is skipped.
            scheduleBackgroundApply(room);
          }
        } else if (shouldGateVideoUntilBackground) {
          holdLocalVideoUntilBackgroundRef.current = false;
          refreshParticipants();
        }
      }

      // Aggressively start audio context and ensure all audio elements play
      kickAudioPlayback(room);

      // Second attempt after a delay (catches late track subscriptions)
      setTimeout(() => kickAudioPlayback(room), 1500);

      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      setIsCamOn(hasActiveCameraPublication(room));
      // Sin sonido al entrar UNO MISMO (pedido de Jhon): ya se ve que entraste.
      refreshParticipants();

      clearSyncInterval();
      syncIntervalRef.current = setInterval(() => {
        refreshParticipants();
        vigilarSalidaDelMicroRef.current();
      }, PARTICIPANT_SYNC_INTERVAL_MS);
    } catch (err: any) {
      // Un intento que ya no es el vigente no escribe el estado del nuevo: su
      // error tapaba una llamada que ya estaba conectada.
      if (!vigente()) throw err;
      clearSyncInterval();
      setError(formatLiveKitConnectionError(err, livekitUrlForError));
      setConnectionState(ConnectionState.Disconnected);
      console.error("LiveKit connect error:", err);
      throw err;
    } finally {
      soltarConexionEnCurso();
      // Tampoco libera el cerrojo del intento que lo reemplazó.
      if (vigente()) connectingRef.current = false;
    }
  }, [refreshParticipants, debouncedRefresh, clearSyncInterval, clearBackgroundReapplyTimer, cleanupAudioResumeListeners, hasActiveCameraPublication, enableCameraWithRecovery, disposeBackgroundProcessor, applyConfiguredBackgroundIfNeeded, applyBackgroundBeforeLocalVideoVisible, scheduleBackgroundApply, scheduleDeferredBackgroundReapply, kickAudioPlayback, vigilarMicro, anotarCorte, iniciarMuestreo]);

  // Debajo de connect porque lo usa; por ref para que el handler de
  // Disconnected (que nace dentro de cada connect) vea siempre la versión
  // vigente sin sumar dependencias al useCallback gigante de arriba.
  programarReentradaRef.current = (razon?: DisconnectReason | null) => {
    const datos = ultimaConexionRef.current;
    if (!datos) return; // salió a propósito: no hay a dónde volver
    if (reentradasRef.current >= 4) {
      anotarCorte("reentrada_agotada", datos.roomName, razon);
      return; // se queda el cartel con su botón, como hasta hoy
    }
    const n = ++reentradasRef.current;
    const espera = Math.min(2000 * Math.pow(2, n - 1), 8000); // 2 s, 4 s, 8 s, 8 s
    console.info(`[LiveKit] Caída (razón ${String(razon)}): volviendo solo, intento ${n}/4 en ${espera} ms`);
    setIsReconnecting(true);
    reentradaTimerRef.current = window.setTimeout(() => {
      reentradaTimerRef.current = null;
      const d = ultimaConexionRef.current;
      if (!d) return;
      connect(d.roomName, d.participantName, d.isAdmin, d.options)
        .catch(() => programarReentradaRef.current(razon));
    }, espera);
  };

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    // Salir a propósito también apaga la re-entrada automática.
    if (reentradaTimerRef.current != null) {
      clearTimeout(reentradaTimerRef.current);
      reentradaTimerRef.current = null;
    }
    ultimaConexionRef.current = null;
    reentradasRef.current = 0;
    pararMuestreoRef.current?.();
    borrarLlamadaEnCurso();
    clearSyncInterval();
    clearBackgroundReapplyTimer();
    cleanupAudioResumeListeners();
    bgQueueInFlightRef.current = false;
    bgApplyQueueRef.current = Promise.resolve(true);
    void disposeBackgroundProcessor();
    try { ncProcessorRef.current?.destroy(); } catch {}
    ncProcessorRef.current = null;
    ncEnabledRef.current = false;
    setIsNoiseCancellationOn(false);
    intentoRef.current++;
    roomRef.current?.disconnect(true);
    roomRef.current = null;
    // Salir a propósito: el Disconnected de la sala llega después y ya no es la
    // vigente, así que la razón se deja acá. Sin esto, salir o cambiar de sala
    // se leía como una caída.
    setRazonDeSalida(DisconnectReason.CLIENT_INITIATED);
    connectingRef.current = false;
    holdLocalVideoUntilBackgroundRef.current = false;
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setIsReconnecting(false);
    setActiveSpeaker(null);
    handRaisedMap.current = {};
    setConnectionState(ConnectionState.Disconnected);
  }, [clearSyncInterval, clearBackgroundReapplyTimer, cleanupAudioResumeListeners, disposeBackgroundProcessor]);

  // ── Mic toggle ────────────────────────────────────────────────
  // Cuando el silencio lo pide otra persona, LiveKit lo aplica en el servidor y
  // acá llega el mismo evento que cuando uno se mutea solo. Se marca el momento
  // del muteo propio para poder distinguirlos: sin eso, a quien lo silencian se
  // le corta el micro sin ninguna explicacion y sigue hablando al vacio.

  // Re-aplicar el noise cancellation al track de micrófono VIGENTE.
  //
  // El procesador se engancha a UN LocalTrack. Apagar y prender el micro (o el
  // fallback de cambio de dispositivo, que hace disable/enable) crea un track
  // NUEVO — y nadie volvía a aplicar el procesador: el botón de NC quedaba
  // diciendo "activado" mientras el NC ya no existía. El botón verde mintiendo,
  // otra vez. (El camino feliz de switchActiveDevice NO lo pierde: LiveKit
  // reinicia el track por dentro y llama al restart() del procesador.)
  /** El filtro dejó de funcionar andando: se apaga para que el micrófono vuelva
   *  crudo (al parar el procesador LiveKit vuelve a publicar el track original)
   *  y se avisa. Mejor ruido que silencio: así quedó Andrea el 10/09 sin saberlo. */
  const apagarNCPorFallo = useCallback(async (motivo: string) => {
    const room = roomRef.current;
    ncEnabledRef.current = false;
    setIsNoiseCancellationOn(false);
    console.warn("[LiveKit] cancelación de ruido apagada por fallo:", motivo);
    try {
      const micPub = Array.from(room?.localParticipant.audioTrackPublications.values() ?? []).find(
        (p) => p.source === Track.Source.Microphone,
      );
      await (micPub?.track as LocalAudioTrack | undefined)?.stopProcessor?.();
    } catch { /* el procesador ya estaba caído */ }
    ncProcessorRef.current = null;
    toast.warning(traducir("shared.call.ncOff"), {
      id: "nc-fallo",
      description: traducir("shared.call.ncOffDesc"),
      duration: 10000,
    });
  }, []);
  alFallarNCRef.current = apagarNCPorFallo;

  const reapplyNC = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !ncEnabledRef.current) return;
    try {
      const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.source === Track.Source.Microphone,
      );
      const t = micPub?.track as LocalAudioTrack | undefined;
      if (!t) return;
      // Si el track vigente ya tiene un procesador, no hay nada que reponer.
      if (t.getProcessor?.()) return;
      // El procesador viejo quedó huérfano (su track murió): se destruye para
      // no filtrar AudioContexts.
      if (ncProcessorRef.current) { try { await ncProcessorRef.current.destroy(); } catch { /* noop */ } }
      const processor = new NoiseSuppresionTrackProcessor((m) => alFallarNCRef.current(m));
      ncProcessorRef.current = processor;
      await t.setProcessor(processor as unknown as Parameters<LocalAudioTrack["setProcessor"]>[0]);
      console.info("[LiveKit] Noise cancellation re-aplicado al track nuevo del micrófono");
    } catch (err) {
      console.warn("[LiveKit] no pude re-aplicar el noise cancellation:", err);
    }
  }, []);

  // Volver a PEDIRLE el micrófono al sistema. Es lo único que devuelve el audio
  // cuando LiveKit ya vació el emisor: con la publicación viva, prender el micro
  // solo hace `unmute()` y ni siquiera vuelve a mirar el dispositivo.
  // El mismo consejo que da `repararMicro` cuando falla, para los dos caminos
  // de `toggleMic` que hasta hoy solo escribían en la consola.
  // ⚠️ ID PROPIO, no el de `repararMicro`. sonner REEMPLAZA el toast cuando el
  // id coincide, y al reemplazarlo pierde la `action`. Con el id compartido,
  // este aviso de 15 s pisaba el toast permanente que lleva el botón «Reparar»
  // — o sea que tocar el botón del micro te borraba la única cura a mano.
  const avisarMicroIrrecuperable = useCallback(() => {
    toast.error(traducir("shared.call.micWontStart"), {
      id: "mic-no-enciende",
      description: traducir("shared.call.micWontStartDesc"),
      duration: 15000,
    });
  }, []);

  const repararMicro = useCallback(async (automatica = false) => {
    const room = roomRef.current;
    if (!room) return;
    const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
      (p) => p.source === Track.Source.Microphone,
    );
    const t = micPub?.track as LocalAudioTrack | undefined;
    if (!t) return;
    // ⚠️ La reparación AUTOMÁTICA no puede usar el id del aviso permanente.
    // sonner fusiona por id y le pisaría la `duration: Infinity` al único aviso
    // que lleva el botón «Reparar»: se autodestruiría a los 15 s sin que nadie
    // lo haya tocado, y la persona quedaría muda y sin botón. Eso era aceptable
    // cuando repararMicro solo corría por un clic; ahora lo dispara el vigilante.
    const avisoId = automatica ? "mic-reparando-solo" : ID_AVISO_MIC_SIN_SALIDA;
    try {
      toast.loading(traducir("shared.call.micReconnecting"), { id: avisoId });
      // ⚠️ Soltar el procesador ANTES de re-pedir el micrófono. LiveKit llama a
      // `processor.restart()` DENTRO de `setMediaStreamTrack`, antes del
      // `replaceTrack`: si la cadena de cancelación de ruido falla ahí, aborta
      // la re-adquisición entera y deja a la persona muda. Volver a tener el
      // micrófono es lo único irrenunciable; el filtro lo repone `reapplyNC`.
      try { await t.stopProcessor?.(); } catch { /* no había procesador */ }
      try {
        await t.restartTrack(getDeviceConstraint(preferredDevicesRef.current.audioDeviceId));
      } finally {
        // En un `finally`: si el restart falla, el procesador ya fue soltado
        // arriba y sin esto la persona se quedaba sin cancelación de ruido el
        // resto del episodio, sin que nadie se lo dijera.
        await reapplyNC();
      }
      micVigiladoRef.current = null;        // la pista cruda cambió: hay que volver a vigilarla
      vigilarMicro(room);
      toast.success(traducir("shared.call.micReconnected"), { id: avisoId, duration: 6000, action: undefined });
    } catch (err) {
      console.error("[LiveKit] no pude reparar el micrófono:", err);
      toast.error(traducir("shared.call.micReconnectFailed"), {
        id: avisoId,
        description: traducir("shared.call.micReconnectFailedDesc"),
        duration: 15000,
      });
    }
  }, [reapplyNC, vigilarMicro]);
  repararMicroRef.current = repararMicro;

  // ── EL VIGILANTE DEL SALIENTE ───────────────────────────────────────────────
  //
  // El audio ENTRANTE tenía desde el 14/09 un vigilante que corre cada 3 s y se
  // repara solo (RoomAudioSink). El SALIENTE no tenía ninguno: se arregló con
  // avisos que dependen de que LiveKit emita un evento Y de que una persona
  // toque un botón. Los dos supuestos fallan justo en el caso que importa —hay
  // caminos que no emiten ningún evento, y el aviso se dibuja en la ventana de
  // Maven, que es la que quien comparte pantalla dejó atrás—. Por eso la gente
  // terminaba saliendo y volviendo a entrar a la llamada.
  //
  // Esto cuelga del intervalo de 3 s que ya existía, a propósito: no agrega un
  // temporizador nuevo ni seis sitios más donde haya que acordarse de limpiarlo.
  // La DECISIÓN (cuándo está roto, cada cuánto se puede reintentar, cuántas
  // veces) vive en `lib/audioDeLaLlamada.ts` como función pura y con pruebas:
  // su modo de fallo peligroso no es no reparar, es reparar EN BUCLE, y eso hay
  // que poder probarlo sin una llamada de verdad. Acá queda solo el cableado.
  const memoriaVigilanteRef = useRef<MemoriaDelVigilante>(MEMORIA_VIGILANTE_VACIA);
  vigilarSalidaDelMicroRef.current = () => {
    const room = roomRef.current;
    const micPub = room
      ? Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone,
        )
      : undefined;
    const t = micPub?.track as LocalAudioTrack | undefined;
    // La pista CRUDA: con un procesador puesto, `mediaStreamTrack` es la salida
    // del filtro, que la fabricamos nosotros y nunca se marca `muted`.
    const cruda = (t as unknown as { _mediaStreamTrack?: MediaStreamTrack } | undefined)?._mediaStreamTrack
      ?? t?.mediaStreamTrack;
    const { reparar, memoria } = decidirSiRepararElMicro(
      {
        conectado: !!room && room.state === ConnectionState.Connected,
        micEncendido: !!room?.localParticipant.isMicrophoneEnabled,
        hayPista: !!t,
        upstreamPausado: !!t?.isUpstreamPaused,
        estadoDeLaPista: cruda?.readyState ?? null,
        silenciadaPorElSistema: !!cruda?.muted,
      },
      memoriaVigilanteRef.current,
      Date.now(),
    );
    memoriaVigilanteRef.current = memoria;
    if (!reparar) return;
    console.warn("[LiveKit] el micrófono no está saliendo al aire; reparando solo (intento", memoria.reparaciones, ")");
    const miSello = memoria.reparandoDesde;
    void repararMicroRef.current(true).finally(() => {
      // Se marca terminada SOLO si sigue siendo la mía: si esta reparación se
      // colgó, venció a los 30 s y arrancó otra, limpiar a ciegas le borraría
      // la marca a la nueva. Si la promesa NUNCA se asienta, `reparandoDesde`
      // vence solo dentro de la función pura: el vigilante no queda muerto.
      if (memoriaVigilanteRef.current.reparandoDesde === miSello) {
        memoriaVigilanteRef.current = { ...memoriaVigilanteRef.current, reparandoDesde: 0 };
      }
    });
  };

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const shouldEnable = !room.localParticipant.isMicrophoneEnabled;
      // Apagar y prender es lo PRIMERO que hace cualquiera cuando no lo oyen, y
      // hasta hoy no servía de nada: con la publicación viva LiveKit solo llama
      // `unmute()` e ignora las restricciones, así que si el emisor estaba vacío
      // seguía vacío — y el botón volvía a verde. Si la pista necesita que se la
      // vuelvan a pedir al sistema, se la pedimos antes de prender.
      if (shouldEnable) {
        const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone,
        );
        const t = micPub?.track as LocalAudioTrack | undefined;
        // ⚠️ ACÁ ESTABA `needsReAcquisition`, Y ERA UNA TRAMPA. Esa propiedad de
        // LiveKit incluye `!enabled` (LocalTrack.ts:402) y silenciar el micro
        // pone `enabled = false` (LocalTrack.ts:394): o sea que DESPUÉS DE
        // CUALQUIER SILENCIO era siempre verdadera. Lo que se escribió el 14/09
        // para un caso raro terminó siendo el camino de TODOS los desmuteos, y
        // cada uno mataba la pista y pedía el micrófono al sistema de nuevo.
        //
        // Eso importa porque `restartTrack` PARA la pista vieja ANTES de pedir
        // la nueva (LocalTrack.ts:353-360): si ese pedido falla —el dispositivo
        // lo tomó otro programa, que es justo lo que pasa al compartir pantalla
        // con audio— queda una pista MUERTA en el emisor. Y ese estado no emite
        // `mute`, ni `ended`, ni `UpstreamPaused`, que son los eventos que
        // vigilamos: nadie te oye y no hay un solo aviso. Es lo que reportó
        // Mónica el 18/09 («debíamos salir e ingresar de nuevo»).
        //
        // Ahora se mira la pista CRUDA y solo se vuelve a pedir el dispositivo
        // si está rota DE VERDAD. Un desmuteo normal vuelve a ser un `unmute()`
        // seco, sin getUserMedia y sin riesgo. El caso `ended` lo cubre LiveKit
        // por su cuenta dentro de `unmute()` (LocalAudioTrack.ts:68-82).
        const cruda = (t as unknown as { _mediaStreamTrack?: MediaStreamTrack } | undefined)?._mediaStreamTrack
          ?? t?.mediaStreamTrack;
        const rotaDeVerdad = !!cruda && (cruda.readyState !== "live" || cruda.muted);
        // ⚠️ Y ADEMÁS tras un silencio LARGO. Sacar el re-pedido del todo perdía
        // una cura accidental que hoy funciona todos los días: la pausa de
        // Cowork apaga el micro y lo prende 20-30 min después, y en el medio la
        // máquina pudo dormirse o el sistema re-rutear el dispositivo. Eso deja
        // la pista `live` y sin `muted` pero entregando silencio, que no lo
        // detecta nadie. El churn que causaba el bug eran los silencios CORTOS
        // —desmutear cada pocos segundos—, y esos quedan fuera.
        const silencioLargo = meSilencieYoRef.current > 0
          && Date.now() - meSilencieYoRef.current > 60_000;
        if (t && (rotaDeVerdad || silencioLargo)) {
          try { await t.restartTrack(getDeviceConstraint(preferredDevicesRef.current.audioDeviceId)); }
          catch (err) {
            // Antes esto era un console.warn a secas y la persona no veía NADA.
            console.warn("[LiveKit] no pude re-pedir el micrófono al prenderlo:", err);
            avisarMicroIrrecuperable();
          }
        }
      }
      if (!shouldEnable) meSilencieYoRef.current = Date.now();
      await room.localParticipant.setMicrophoneEnabled(
        shouldEnable,
        shouldEnable ? getDeviceConstraint(preferredDevicesRef.current.audioDeviceId) : undefined,
      );
      // Encender el micro crea un track nuevo → el NC hay que volver a ponerlo.
      if (shouldEnable) { await reapplyNC(); vigilarMicro(room); }
      // Ensure remote audio playback is unblocked (browsers require a user gesture).
      // toggleMic is always invoked by a user gesture, so this is the right moment.
      if (!room.canPlaybackAudio) {
        room.startAudio().catch(() => {});
      }
      // Encendido: la marca deja de tener sentido hasta el próximo silencio.
      if (shouldEnable) meSilencieYoRef.current = 0;
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
      setTimeout(() => refreshParticipants(), 180);
    } catch (err) {
      // Idem: sin esto, tocar el botón del micro y que no pase nada era
      // indistinguible de que la app estuviera colgada.
      console.error("Mic toggle error:", err);
      avisarMicroIrrecuperable();
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    }
  }, [refreshParticipants, reapplyNC, vigilarMicro, avisarMicroIrrecuperable]);

  // ── Noise Cancellation toggle ─────────────────────────────────
  const toggleNoiseCancellation = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const newState = !ncEnabledRef.current;
    ncEnabledRef.current = newState;
    setIsNoiseCancellationOn(newState);
    saveNCPreference(newState);
    const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
      (pub) => pub.source === Track.Source.Microphone,
    );
    const localAudioTrack = micPub?.track;
    if (!localAudioTrack) return;
    if (newState) {
      if (!supportsNoiseSuppression()) { ncEnabledRef.current = false; setIsNoiseCancellationOn(false); return; }
      try {
        const processor = new NoiseSuppresionTrackProcessor((m) => alFallarNCRef.current(m));
        ncProcessorRef.current = processor;
        await (localAudioTrack as any).setProcessor(processor);
        console.info("[LiveKit] Noise cancellation enabled");
      } catch (err) {
        console.error("[LiveKit] NC toggle error:", err);
        ncProcessorRef.current = null;
        ncEnabledRef.current = false;
        setIsNoiseCancellationOn(false);
      }
    } else {
      try { await (localAudioTrack as any).stopProcessor(); } catch {}
      if (ncProcessorRef.current) { try { await ncProcessorRef.current.destroy(); } catch {} ncProcessorRef.current = null; }
      console.info("[LiveKit] Noise cancellation disabled");
    }
  }, []);

  // ── Camera toggle ─────────────────────────────────────────────
  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room || camToggleInFlightRef.current) return;

    camToggleInFlightRef.current = true;

    try {
      const currentlyEnabled = hasActiveCameraPublication(room) || room.localParticipant.isCameraEnabled;

      if (!currentlyEnabled) {
        // Optimistic UI: show cam on immediately
        setIsCamOn(true);

        // DON'T dispose the processor when turning ON — we'll reuse or re-attach it
        bgAttachedTrackRef.current = null;

        const shouldGateVideoUntilBackground = backgroundEffectRef.current !== "none";
        if (shouldGateVideoUntilBackground) {
          bgFailureCooldownUntilRef.current = 0;
          holdLocalVideoUntilBackgroundRef.current = true;
          refreshParticipants();
        }

        const cameraEnabled = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);

        if (cameraEnabled) {
          refreshParticipants();
          // User-driven camera ON: allow background apply attempts again.
          skipAutoBackgroundRestoreRef.current = false;

          if (shouldGateVideoUntilBackground) {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 280);
            }
          }
        } else if (shouldGateVideoUntilBackground) {
          holdLocalVideoUntilBackgroundRef.current = false;
          refreshParticipants();
        } else {
          setIsCamOn(false);
        }
      } else {
        // Optimistic UI: show cam off immediately
        setIsCamOn(false);

        // Keep processor warm (disabled mode) so repeated camera refreshes
        // don't constantly rebuild ML resources and freeze the tab.
        const processor = bgProcessorRef.current;
        const currentCamTrack = getLocalCameraTrack(room);
        if (currentCamTrack && bgAttachedTrackRef.current === currentCamTrack) {
          try {
            await withTimeout(Promise.resolve(currentCamTrack.stopProcessor?.()), 1000, "bg-stop-on-cam-off");
          } catch {}
        }

        bgAttachedTrackRef.current = null;
        bgLastAppliedEffectRef.current = "none";

        if (processor?.switchTo) {
          try {
            await withTimeout(Promise.resolve(processor.switchTo({ mode: "disabled" })), 1200, "bg-disable-on-cam-off");
          } catch {}
        }

        await room.localParticipant.setCameraEnabled(false);
      }

      const camActive = hasActiveCameraPublication(room);
      setIsCamOn(camActive);
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Camera toggle error:", err);
      try {
        await disposeBackgroundProcessor();
      } catch {}
      setIsCamOn(hasActiveCameraPublication(room));
      refreshParticipants();
    } finally {
      camToggleInFlightRef.current = false;
    }
  }, [refreshParticipants, hasActiveCameraPublication, enableCameraWithRecovery, getLocalCameraTrack, disposeBackgroundProcessor, applyBackgroundBeforeLocalVideoVisible, scheduleDeferredBackgroundReapply]);

  // ── Screen share (using ref to avoid stale closure) ───────────
  const isScreenSharingRef = useRef(isScreenSharing);
  isScreenSharingRef.current = isScreenSharing;
  // En Cowork se exige la PANTALLA COMPLETA (Alvaro, 10/11): una pestaña o una
  // ventana no muestran adónde se fue la persona. Lo prende LiveKitCallView
  // solo en la sala de Cowork; en una llamada común se comparte lo que quieras.
  const exigirPantallaCompletaRef = useRef(false);
  const setExigirPantallaCompleta = useCallback((v: boolean) => { exigirPantallaCompletaRef.current = v; }, []);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const newState = !isScreenSharingRef.current;
      // `audio: true` = además del video, capturar el AUDIO de lo compartido
      // (el de la pestaña o el del sistema). Sin esto, mostrar un video o poner
      // música se veía pero no se oía.
      //
      // Depende del navegador y del sistema, y no podemos forzarlo: quien
      // comparte tiene que marcar la casilla de compartir audio en el diálogo
      // de Chrome. En macOS, Chrome solo captura el audio de una PESTAÑA, no el
      // de la pantalla completa. Si no hay audio, el video se comparte igual.
      // Los teléfonos no exponen getDisplayMedia. Se avisa ANTES de intentarlo,
      // para que el mensaje diga el motivo real en vez de un error del navegador.
      if (newState && !puedeCompartirPantalla()) {
        toast.info(traducir("shared.call.screenShareUnavailable"), {
          description: traducir("shared.call.screenShareUnavailableDesc"),
        });
        return;
      }
      const exigir = newState && exigirPantallaCompletaRef.current;
      // Con la exigencia, el diálogo de Chrome abre en «Pantalla completa» y no
      // ofrece esta pestaña ni cambiar de pestaña a mitad de camino.
      const captura: ScreenShareCaptureOptions = exigir
        ? { audio: true, video: { displaySurface: "monitor" }, selfBrowserSurface: "exclude", surfaceSwitching: "exclude" }
        : { audio: newState };
      await room.localParticipant.setScreenShareEnabled(newState, captura, PUBLICACION_DE_PANTALLA);
      if (exigir) {
        const superficie = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack?.getSettings?.().displaySurface;
        if (!esPantallaCompleta(superficie)) {
          // Eligió una pestaña o una ventana: no sirve. Se corta y se le pide de
          // nuevo; mientras tanto el reloj lo cuenta como «sin pantalla».
          await room.localParticipant.setScreenShareEnabled(false);
          setIsScreenSharing(false);
          debouncedRefresh();
          toast.error(traducir("shared.call.pantallaCompletaTitulo"), {
            description: traducir("shared.call.pantallaCompletaDesc"),
            duration: 12_000,
          });
          return;
        }
      }
      setIsScreenSharing(newState);
      debouncedRefresh();
    } catch (err) {
      // Antes esto era un console.error a secas: quien tocaba el botón no veía
      // NADA pasar, ni siquiera un mensaje de por qué.
      console.error("Screen share error:", err);
      const motivo = motivoDeFalloAlCompartir(err);
      if (motivo) toast.error(traducir("shared.call.screenShareFailed"), { description: motivo });
    }
  }, [debouncedRefresh]);

  // ── Hand raise ────────────────────────────────────────────────
  const toggleHand = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    handRaisedMap.current[room.localParticipant.identity] = newState;
    const msg: DataMessage = { type: "hand", payload: { raised: newState } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
    debouncedRefresh();
  }, [isHandRaised, debouncedRefresh]);

  // ── Reactions ─────────────────────────────────────────────────
  const sendReaction = useCallback((emoji: string) => {
    const room = roomRef.current;
    if (!room) return;
    const msg: DataMessage = { type: "reaction", payload: { emoji } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
    setParticipants((prev) =>
      prev.map((p) =>
        p.isLocal ? { ...p, reactions: [...p.reactions, emoji] } : p
      )
    );
    setTimeout(() => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.isLocal ? { ...p, reactions: p.reactions.slice(1) } : p
        )
      );
    }, 15000);
  }, []);

  // ── Chat ──────────────────────────────────────────────────────
  const sendChatMessage = useCallback((text: string) => {
    const room = roomRef.current;
    if (!room || !text.trim()) return;
    // El id y la hora los pone QUIEN ESCRIBE y viajan con el mensaje. Antes cada
    // receptor se inventaba el suyo al recibir, asi que el mismo mensaje tenia
    // un id distinto en cada pantalla — imposible fusionar historiales sin
    // duplicar todo.
    const id = `${room.localParticipant.identity}-${Date.now()}-${Math.round(performance.now())}`;
    const ts = Date.now();
    const msg: DataMessage = { type: "chat", payload: { text, id, ts } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
    setChatMessages((prev) => {
      const newMessages = [
        ...prev,
        {
          id,
          sender: room.localParticipant.identity,
          senderName: room.localParticipant.name || traducir("shared.call.you"),
          content: text,
          timestamp: ts,
        },
      ];
      if (newMessages.length > MAX_CHAT_MESSAGES) {
        return newMessages.slice(newMessages.length - MAX_CHAT_MESSAGES);
      }
      return newMessages;
    });
  }, []);

  // ── Moderation ────────────────────────────────────────────────
  // ── Moderación ────────────────────────────────────────────────────────
  // ANTES esto publicaba un mensaje por el canal de datos y esperaba que el
  // cliente de la víctima se muteara o se desconectara solo: honor system. Quien
  // no quería obedecer, no obedecía. Ahora la orden la ejecuta el servidor de
  // LiveKit y la autorización la decide la base (can_moderate_livekit_room).
  const moderate = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    const room = roomRef.current;
    if (!room?.name) throw new Error(traducir("shared.call.notInCall"));
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-moderate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action, room: room.name, ...payload }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || traducir("shared.call.actionFailed"));
    return json;
  }, []);

  const muteParticipant = useCallback(async (identity: string) => {
    await moderate("muteParticipant", { identity });
  }, [moderate]);

  const removeParticipant = useCallback(async (identity: string) => {
    await moderate("removeParticipant", { identity });
  }, [moderate]);

  const muteAllParticipants = useCallback(async () => {
    const res = await moderate("muteAll");
    return (res?.muted ?? 0) as number;
  }, [moderate]);

  // El "solo ver" de Google: le saca (o le devuelve) la capacidad de publicar.
  const setParticipantCanPublish = useCallback(async (identity: string, canPublish: boolean) => {
    await moderate("setCanPublish", { identity, canPublish });
  }, [moderate]);

  const endRoomForAll = useCallback(async () => {
    await moderate("endRoom");
  }, [moderate]);

  const setCohost = useCallback(async (identity: string, isCohost: boolean) => {
    await moderate("setCohost", { identity, isCohost });
  }, [moderate]);

  const getRoom = useCallback(() => roomRef.current, []);

  // ── Background effect ─────────────────────────────────────────
  const setBackgroundEffect = useCallback(async (effect: BackgroundEffect) => {
    backgroundEffectRef.current = effect;
    bgRequestedEffectRef.current = effect;
    // Se guarda ACÁ, no solo en la UI: así vale para las tres superficies y
    // sobrevive a cerrar la pestaña. Mismo lugar donde el micro guarda la
    // preferencia de cancelación de ruido.
    guardarFondo(effect);
    setFondoCorregido(null);
    // Manual user action always re-enables background processing path.
    skipAutoBackgroundRestoreRef.current = false;

    const room = roomRef.current;
    if (!room) return;

    const hasCamera = hasActiveCameraPublication(room) || room.localParticipant.isCameraEnabled;
    if (!hasCamera && effect !== "none") return;

    if (effect === "none") {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
      await queueBackgroundEffectApply(effect);
      return;
    }

    const applied = await applyBackgroundBeforeLocalVideoVisible(room);
    if (!applied) {
      scheduleDeferredBackgroundReapply(room, 240);
    }
  }, [queueBackgroundEffectApply, hasActiveCameraPublication, refreshParticipants, applyBackgroundBeforeLocalVideoVisible, scheduleDeferredBackgroundReapply]);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearSyncInterval();
      clearBackgroundReapplyTimer();
      cleanupAudioResumeListeners();
      bgQueueInFlightRef.current = false;
      bgApplyQueueRef.current = Promise.resolve(true);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      try { ncProcessorRef.current?.destroy(); } catch {}
      void disposeBackgroundProcessor();
      roomRef.current?.disconnect(true);
    };
  }, [clearSyncInterval, clearBackgroundReapplyTimer, cleanupAudioResumeListeners, disposeBackgroundProcessor]);

  const clearUnreadChat = useCallback(() => {
    setUnreadChatCount(0);
  }, []);

  // ── Device switching (in-call) ──────────────────────────────────
  const switchAudioInput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    preferredDevicesRef.current.audioDeviceId = deviceId;
    try {
      // Use switchActiveDevice for seamless audio switching (no gap)
      await room.switchActiveDevice("audioinput", deviceId);
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Audio input switch error:", err);
      // Fallback: disable/re-enable
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(true, getDeviceConstraint(deviceId));
        // Este camino crea un track NUEVO → el noise cancellation se perdía acá.
        await reapplyNC();
        setIsMicOn(room.localParticipant.isMicrophoneEnabled);
        refreshParticipants();
      } catch (fallbackErr) {
        console.error("[LiveKit] Audio input fallback switch error:", fallbackErr);
      }
    }
  }, [refreshParticipants, reapplyNC]);

  const switchAudioOutput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    preferredDevicesRef.current.audioOutputDeviceId = deviceId;
    try {
      await room.switchActiveDevice("audiooutput", deviceId);
    } catch (err) {
      console.error("[LiveKit] Audio output switch error:", err);
    }
  }, []);

  const switchVideoInput = useCallback(async (deviceId: string) => {
    pendingVideoSwitchDeviceIdRef.current = deviceId;
    if (videoSwitchInFlightRef.current) return;

    videoSwitchInFlightRef.current = true;

    try {
      while (pendingVideoSwitchDeviceIdRef.current) {
        const nextDeviceId = pendingVideoSwitchDeviceIdRef.current;
        pendingVideoSwitchDeviceIdRef.current = null;

        const room = roomRef.current;
        if (!room) break;

        const elapsedSinceLastSwitch = Date.now() - lastVideoSwitchAtRef.current;
        if (elapsedSinceLastSwitch < VIDEO_SWITCH_MIN_INTERVAL_MS) {
          await wait(VIDEO_SWITCH_MIN_INTERVAL_MS - elapsedSinceLastSwitch);
        }
        lastVideoSwitchAtRef.current = Date.now();

        preferredDevicesRef.current.videoDeviceId = nextDeviceId;
        const hasBackgroundEffect = backgroundEffectRef.current !== "none";

        try {
          // Stop processor on current track before replacing camera source
          // to avoid orphaned ML pipelines that can freeze camera refresh.
          const currentCamTrack = getLocalCameraTrack(room);
          if (currentCamTrack && bgAttachedTrackRef.current === currentCamTrack) {
            try {
              await withTimeout(Promise.resolve(currentCamTrack.stopProcessor?.()), 1200, "bg-stop-before-video-switch");
            } catch {}
          }

          // Keep processor instance alive and only disable its mode before re-attaching.
          // Re-creating the processor on every refresh spikes CPU/GPU and can hang the page.
          const processor = bgProcessorRef.current;
          if (processor?.switchTo) {
            try {
              await withTimeout(Promise.resolve(processor.switchTo({ mode: "disabled" })), 1200, "bg-disable-before-video-switch");
            } catch {}
          }

          bgAttachedTrackRef.current = null;
          bgLastAppliedEffectRef.current = "none";

          // Device switch is user-driven, so allow background application again.
          skipAutoBackgroundRestoreRef.current = false;

          if (hasBackgroundEffect) {
            bgFailureCooldownUntilRef.current = 0;
            holdLocalVideoUntilBackgroundRef.current = true;
            refreshParticipants();
          }

          // Try seamless device switch first; fallback to deterministic restart only if needed.
          try {
            await room.switchActiveDevice("videoinput", nextDeviceId);
          } catch {
            await room.localParticipant.setCameraEnabled(false);
            await wait(70);
            await room.localParticipant.setCameraEnabled(true, getVideoConstraint(nextDeviceId, hasBackgroundEffect));
          }

          const isReady = await waitForCameraPublication(room, [80, 150, 300]);
          if (isReady && hasBackgroundEffect) {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 260);
            }
          } else if (hasBackgroundEffect) {
            holdLocalVideoUntilBackgroundRef.current = false;
            refreshParticipants();
          }

          setIsCamOn(hasActiveCameraPublication(room));
          refreshParticipants();
        } catch (err) {
          console.error("[LiveKit] Video input switch error:", err);

          // Last-resort recovery: recycle processor only after a real switch failure.
          if (backgroundEffectRef.current !== "none") {
            await disposeBackgroundProcessor();
          }

          // Fallback: full camera recovery with profile-aware constraints.
          const cameraEnabled = await enableCameraWithRecovery(room, nextDeviceId);
          if (cameraEnabled && backgroundEffectRef.current !== "none") {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 300);
            }
          } else if (backgroundEffectRef.current !== "none") {
            holdLocalVideoUntilBackgroundRef.current = false;
            refreshParticipants();
          }
          setIsCamOn(hasActiveCameraPublication(room));
          refreshParticipants();
        }
      }
    } finally {
      videoSwitchInFlightRef.current = false;
      pendingVideoSwitchDeviceIdRef.current = null;
    }
  }, [refreshParticipants, waitForCameraPublication, hasActiveCameraPublication, enableCameraWithRecovery, getLocalCameraTrack, disposeBackgroundProcessor, applyBackgroundBeforeLocalVideoVisible, scheduleDeferredBackgroundReapply]);

  return {
    connectionState,
    participants,
    chatMessages,
    unreadChatCount,
    isMicOn,
    isCamOn,
    isScreenSharing,
    isHandRaised,
    activeSpeaker,
    error,
    isReconnecting,
    otraPestanaTomoLaSesion,
    razonDeSalida,
    connect,
    disconnect,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    setExigirPantallaCompleta,
    toggleHand,
    sendReaction,
    sendChatMessage,
    muteParticipant,
    removeParticipant,
    muteAllParticipants,
    setParticipantCanPublish,
    endRoomForAll,
    setCohost,
    getRoom,
    setBackgroundEffect,
    fondoCorregido,
    clearUnreadChat,
    switchAudioInput,
    switchAudioOutput,
    switchVideoInput,
    isNoiseCancellationOn,
    toggleNoiseCancellation,
  };
}
