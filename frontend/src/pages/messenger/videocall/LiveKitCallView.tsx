import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { ConnectionState, CriticalTimers, RoomEvent, Track } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import CallTopBar from "./CallTopBar";
import CallControls from "./CallControls";
import CallChatSidebar from "./CallChatSidebar";
import CallParticipantsSidebar from "./CallParticipantsSidebar";
import AdjustViewDialog, { type ViewSettings } from "./AdjustViewDialog";
import VideoSettingsDialog from "./VideoSettingsDialog";
import MetricsDialog from "./MetricsDialog";
import ParticipantTile from "./ParticipantTile";
import RecordingControl, { leerMiGrabacion, detenerAlSalir } from "./RecordingControl";
import RoomAudioSink from "./RoomAudioSink";
import { useAutoPiP } from "./useAutoPiP";
import AvisoCaidasSeguidas from "./AvisoCaidasSeguidas";
import { suscribirOrdenesDePausa } from "@/lib/ordenesDePausa";

import { Loader2, Wifi, WifiOff, Copy, ChevronLeft, ChevronRight, DoorOpen, Check } from "lucide-react";
import { CLAVES_SALA_TOMADA, olvidarSalaSoltada } from "@/lib/sesionDuplicada";
import { caidaEnCurso, conexionDeSala, marcarCaida, olvidarCaida } from "@/lib/conexionSala";
import type { ConexionSala } from "@/lib/coworkTiempoRegla";
import type { DestinoDeTelemetria } from "@/lib/saludDeLlamada";
import { cn } from "@/lib/utils";
import { aplicaCalidadPorVoz, calidadDeCamara } from "@/lib/calidadPorVoz";
import { puedeCompartirPantalla } from "@/lib/compartirPantalla";
import { toast } from "sonner";
import { useFaceWatch, faceStateLabel, type FaceWatch } from "@/hooks/useFaceWatch";
import { useFaceNudge, useScreenShareNudge } from "@/hooks/useFaceNudge";
import { useMonitorCamara } from "@/hooks/useMonitorCamara";
import { useUltimoPantallazo } from "@/lib/monitorLocal";
import { supabase } from "@/integrations/supabase/client";
import { useArgosEscaleraClip } from "@/hooks/useArgosEscaleraClip";
import { latirEnLlamada, salirDeLlamada, LATIDO_LLAMADA_MS, LATIDO_SERVIDOR_MS, latirLlamadaEnServidor, salirLlamadaEnServidor } from "@/lib/llamadaEnMaven";
import { useRegistrarLlamados } from "@/hooks/useRegistrarLlamados";
import { esBlur, alternarBlur, leerFondoGuardado, guardarFondo, type BackgroundEffect } from "@/lib/fondoDeLlamada";
import { precalentarFondo, soportaProcesadorDeFondo } from "@/lib/fondoFino/procesador";
import { escritorio } from "@/lib/escritorio";
import { useLanguage } from "@/hooks/useLanguage";

const DEFAULT_VIEW_SETTINGS: ViewSettings = { layout: "auto", maxTiles: 49, hideNoVideo: false };

interface LiveKitCallViewProps {
  roomName: string;
  displayName: string;
  callDisplayName?: string;
  isAdmin?: boolean;
  onLeave: () => void;
  initialMicOn?: boolean;
  initialCamOn?: boolean;
  /** Arrancar compartiendo pantalla (volver de un meet grupal como se estaba).
   *  Best-effort: el navegador solo lo permite cerca del clic; si no, avisa. */
  initialScreenShareOn?: boolean;
  initialAudioDeviceId?: string;
  initialVideoDeviceId?: string;
  initialAudioOutputDeviceId?: string;
  initialBackgroundEffect?: BackgroundEffect;
  hideShareLink?: boolean;
  hideScreenShare?: boolean;
  hideLeaveButton?: boolean;
  /** Custom label for the leave button (e.g. "Regresar a la sala"). When set, the button shows icon + text */
  leaveLabel?: string;
  /** Custom icon for the leave button (defaults to PhoneOff) */
  leaveIcon?: import("lucide-react").LucideIcon;
  /** When true, skip the generic "Llamada finalizada" toast on leave */
  suppressLeaveToast?: boolean;
  compact?: boolean;
  /** Deja que ESTA vista maneje el PiP de video del navegador.
   *
   *  Se apaga donde la llamada ya sale a la ventana flotante del sistema
   *  (Cowork, Meet, videollamada): las dos cosas registran la MISMA accion de
   *  MediaSession —"enterpictureinpicture"— y ese casillero es uno solo. La
   *  segunda registrada pisa a la primera.
   *
   *  Pero NO se apaga incondicionalmente: en Brave y Firefox la ventana del
   *  sistema no existe, y ahi este PiP de video es el UNICO respaldo. Los
   *  llamadores pasan `!docPipSupported()`. */
  autoPip?: boolean;
  /** If set, auto-leave when remote participants reach 0 for this many ms */
  autoLeaveOnEmpty?: number;
  /** Custom token provider; bypasses the default livekit-token edge function */
  getToken?: () => Promise<{ token: string; url: string }>;
  /** Fires whenever the local participant's media state changes */
  onMediaStateChange?: (state: {
    micOn: boolean; camOn: boolean; screenShareOn: boolean;
    /** Cómo está respecto de la sala. null = todavía entrando (no se sabe). */
    conexionSala: ConexionSala | null;
  }) => void;
  /**
   * Opt-in de la vigilancia de encuadre (¿se le ve la cara?). Solo se activa si
   * el contenedor pasa este callback: una llamada 1:1 del chat no lo necesita.
   * Corre sobre el video LOCAL, en el navegador de la propia persona.
   */
  onFaceStateChange?: (watch: FaceWatch) => void;
  /** Cowork: avisarle a la propia persona cuando no se le ve. Va acá y no en la
   *  página para que siga funcionando en la ventanita flotante. */
  supervisorEncuadre?: boolean;
  /** La pantalla que esta persona está compartiendo en la llamada (null si no
   *  comparte). El tablero de Cowork la reenvía a una sala sin pedir otra. */
  onLocalScreenTrack?: (track: MediaStreamTrack | null) => void;
  /** La pantalla que comparto aquí no la ve nadie de esta llamada (Argos sí la
   *  usa). El Supervisor Hub: su pantalla va solo a la sala donde habla. */
  pantallaSoloParaMi?: boolean;
  /** No cuenta como «llamada de Maven» para callar a Argos: la sala en la que
   *  entra el supervisor no le quita la vigilancia del Hub. */
  sinLatidoDeLlamada?: boolean;
  // Silenciar TODO el audio entrante de esta llamada SOLO para mí (los demás
  // siguen hablando y escuchándose entre sí; mi micro tampoco se toca). Se hace
  // con setVolume(0) de LiveKit sobre cada participante remoto: cubre tanto los
  // <audio> de los tiles como los de la red de seguridad (RoomAudioSink), y la
  // pista recuerda el volumen para elementos que se adjunten después.
  incomingAudioMuted?: boolean;
  // Aviso hacia el DUEÑO de la llamada cuando el silencio local se togglea
  // desde otro lado (el header de la ventanita flotante del provider), para
  // que sincronice su estado/persistencia. La vista no lo usa.
  onIncomingAudioMutedChange?: (muted: boolean) => void;
  // Navegador de salas (Cowork, supervisor+): flechas a los costados estilo
  // Instagram + botón con la lista completa. La vista solo DIBUJA y avisa;
  // moverse de verdad (colgar la sala anterior, entrar muteado a la nueva) es
  // del dueño, vía onSwitch.
  /** Cowork: sin "Terminar para todos" en el panel de participantes. Una sala
   *  de Cowork no se termina desde adentro de la llamada. */
  hideEndForAll?: boolean;
  roomSwitcher?: {
    rooms: Array<{ id: string; name: string }>;
    currentId: string;
    onSwitch: (id: string) => void;
  };
  /** Un control más en la barra, a la derecha del chat (la tacita del Hub). */
  controlesExtra?: ReactNode;
  /** Habilita el botón de grabar (Meet/Cowork, solo usuarios con cuenta).
   *  Sin este prop igual se muestra el punto rojo pasivo cuando la sala se
   *  está grabando — que un invitado sepa que lo graban no es opcional. */
  recording?: { source: "meet" | "cowork"; title?: string };
  /** Link que copia el botón "Copiar enlace". Sin esto se comparte
   *  /call/<sala>, que exige login — a un externo lo deja mirando la
   *  pantalla de login (feedback de Jhon 21/08). Meet pasa acá su link
   *  público /entrar/<código>. */
  shareLink?: string;
  /** Botones extra a la derecha de la barra de arriba (p. ej. «Invitar de
   *  afuera» en un Meet o una llamada del Messenger). */
  accionesBarra?: ReactNode;
  /** Sala de Cowork del PARTICIPANTE: oye a todos pero no recibe el video de
   *  sus compañeros (lib/videoAjeno.ts). Solo lo pasa CoworkParticipantView
   *  para su sala; el tablero, el Hub, los meets y las 1:1 no lo pasan. */
  sinVideoAjeno?: boolean;
  /** Adónde va la telemetría de la llamada cuando no hay sesión (invitado de
   *  afuera, por meet-guest). Ver saludDeLlamada.ts. */
  telemetria?: DestinoDeTelemetria;
  /** En la pantalla de error, solo «Reintentar». Para el invitado de afuera:
   *  «Volver» le gastaba la admisión y tenía que pedir entrada otra vez. */
  sinVolverEnError?: boolean;
}

/** ¿Este dispositivo se maneja con el dedo? Se mide una sola vez: nadie cambia
 *  de mouse a pantalla táctil en medio de una llamada. */
function usePunteroGrueso(): boolean {
  const [grueso] = useState(() => {
    try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
  });
  return grueso;
}

export default function LiveKitCallView({ roomName, displayName, callDisplayName, isAdmin = false, onLeave, initialMicOn = true, initialCamOn = true, initialScreenShareOn = false, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect = "none", hideShareLink, hideScreenShare, hideLeaveButton, leaveLabel, leaveIcon, suppressLeaveToast, compact, autoPip = true, autoLeaveOnEmpty, getToken, onMediaStateChange, onFaceStateChange, supervisorEncuadre, onLocalScreenTrack, pantallaSoloParaMi, sinLatidoDeLlamada, incomingAudioMuted, roomSwitcher, recording, shareLink: shareLinkProp, accionesBarra, hideEndForAll, controlesExtra, sinVideoAjeno = false, telemetria, sinVolverEnError = false }: LiveKitCallViewProps) {
  // Lista de salas del navegador (solo Cowork supervisor+): estado del popup.
  const [salasAbiertas, setSalasAbiertas] = useState(false);
  const lk = useLiveKit();
  const { t } = useLanguage();

  // Silencio local del audio entrante (p.ej. el Hub de Cowork mientras el
  // coordinador está metido en una sala). setVolume(0) por participante remoto:
  // LiveKit lo aplica a todos los <audio> ya adjuntos Y lo recuerda para los
  // que se adjunten después (tiles que se montan, la red de seguridad, un
  // participante que entra más tarde — por eso además se re-aplica en los
  // eventos de entrada/suscripción mientras el silencio esté activo).
  useEffect(() => {
    const room = lk.getRoom();
    if (!room) return;
    const vol = incomingAudioMuted ? 0 : 1;
    const aplicar = () => {
      room.remoteParticipants.forEach((p) => {
        try { p.setVolume(vol); } catch { /* noop */ }
        try { p.setVolume(vol, Track.Source.ScreenShareAudio); } catch { /* noop */ }
      });
    };
    aplicar();
    if (!incomingAudioMuted) return;
    room.on(RoomEvent.ParticipantConnected, aplicar);
    room.on(RoomEvent.TrackSubscribed, aplicar);
    return () => {
      room.off(RoomEvent.ParticipantConnected, aplicar);
      room.off(RoomEvent.TrackSubscribed, aplicar);
    };
  }, [incomingAudioMuted, lk, lk.connectionState]);
  const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);

  // ── Pausa de Cowork: apagar todo al pausar, reencender al volver ─────────
  // Pedido del jefe (08/09): que al marcar pausa "la cámara y todo se cancele".
  // La orden llega por lib/ordenesDePausa desde la página de Cowork. Se recuerda
  // qué estaba encendido para devolverlo igual. La pantalla compartida no se
  // puede reabrir sola (el navegador exige un clic): queda pendiente y se
  // muestra un botón.
  const antesDePausaRef = useRef<{ mic: boolean; cam: boolean; pantalla: boolean } | null>(null);
  const [pantallaPendiente, setPantallaPendiente] = useState<null | "pausa">(null);
  // ⚠️ VOLVIENDO DE UNA CAÍDA SE ENTRA CON CÁMARA Y MICRÓFONO APAGADOS. Se probó
  // restaurarlos "como estaban" y cada combinación terminaba con el micrófono
  // abierto sin que la persona lo pidiera: una pausa marcada a mitad del
  // intento, alguien que la había silenciado, un F5 que arranca creyendo que
  // estaba todo prendido, tocar el micrófono con la sala caída. Entrar apagado
  // es como se entra a Cowork, y la persona está ahí: acaba de tocar Reconectar.
  // Se declara acá arriba porque el efecto de conexión lo lee. Arranca con la
  // marca de la pestaña: un F5 en plena caída también vuelve apagado.
  const volviendoDeCaidaRef = useRef(caidaEnCurso(roomName));
  // Si el intento EN CURSO entró apagado: solo entonces se avisa "quedaron apagados".
  const intentoApagadoRef = useRef(false);
  const lkRef = useRef(lk);
  lkRef.current = lk;
  useEffect(() => suscribirOrdenesDePausa((orden) => {
    const l = lkRef.current;
    // Sin sala no se toca nada: los interruptores actuarían sobre una sala que ya
    // no existe (se tomaba el micrófono 15 s), y lo que "estaba prendido" no se
    // sabe (tras un F5 arranca en true). Se vuelve de la caída con todo apagado.
    const conSala = l.connectionState === ConnectionState.Connected
      || l.connectionState === ConnectionState.Reconnecting
      || l.connectionState === ConnectionState.SignalReconnecting;
    // ⚠️ Se decide con el estado REAL del micrófono, el mismo que mira toggleMic,
    // y no con `isMicOn`: si otro la había silenciado, `isMicOn` decía
    // "prendido", la pausa llamaba a toggleMic para apagarlo y toggleMic —que sí
    // sabe que está apagado— lo PRENDÍA durante toda la pausa.
    const micReal = (): boolean => {
      const lp = l.getRoom()?.localParticipant;
      return typeof lp?.isMicrophoneEnabled === "boolean" ? lp.isMicrophoneEnabled : l.isMicOn;
    };
    if (orden === "apagar") {
      if (!conSala) { antesDePausaRef.current = null; setPantallaPendiente(null); return; }
      const mic = micReal();
      antesDePausaRef.current = { mic, cam: l.isCamOn, pantalla: l.isScreenSharing };
      if (l.isScreenSharing) void l.toggleScreenShare();
      if (l.isCamOn) void l.toggleCam();
      if (mic) void l.toggleMic();
      setPantallaPendiente(null);
      return;
    }
    const antes = antesDePausaRef.current;
    antesDePausaRef.current = null;
    if (!antes || !conSala) return;
    if (antes.cam && !l.isCamOn) void l.toggleCam();
    if (antes.mic && !micReal()) void l.toggleMic();
    if (antes.pantalla && !l.isScreenSharing) setPantallaPendiente("pausa");
  }), []);
  useEffect(() => { if (lk.isScreenSharing) setPantallaPendiente(null); }, [lk.isScreenSharing]);

  // PiP automático estilo Google Meet: al cambiar de pestaña/ventana, la llamada
  // aparece en la ventanita flotante del navegador (pantalla compartida o hablante).
  //
  // Se apaga donde la llamada ya sale a la VENTANA DEL SISTEMA, porque las dos
  // registran la misma acción de MediaSession y el casillero es uno solo.
  useAutoPiP(lk.getRoom, autoPip);

  // Modo compacto AUTOMÁTICO cuando el contenedor es chico (ventana angosta/baja):
  // mismos controles que Google Meet a tamaño mini. Se suma al prop `compact`.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [autoCompact, setAutoCompact] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setAutoCompact(r.width < 640 || r.height < 480);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [lk.connectionState]);
  const effectiveCompact = compact || autoCompact;
  // ¿Los controles se van a tocar con un dedo?
  //
  // El modo compacto se inventó para la ventana flotante de 340px, donde los
  // botones de 28px se usan con un mouse y están bien. En un teléfono la misma
  // fila se dibuja igual de chica pero se toca con el pulgar.
  //
  // Se pregunta por el TIPO DE PUNTERO, no por el tamaño del contenedor. Un
  // primer intento usaba `!compact && autoCompact` con el argumento de que
  // `compact` solo llega por prop desde la ventana flotante: era falso. El Hub
  // del supervisor dibuja la llamada por CallOutlet, donde el provider pasa
  // `compact={false}`, y su panel mide menos de 640px — así que en un escritorio
  // con mouse se prendían los botones grandes. Lo mismo con la sala activa y la
  // llamada 1:1 en cualquier ventana de menos de ~1216px.
  //
  // Se conserva el `!compact` para dejar intactas la ventana flotante y el PiP,
  // que aunque se abran desde una tablet son demasiado chicos para agrandar
  // nada adentro.
  const punteroGrueso = usePunteroGrueso();
  const tactil = !compact && autoCompact && punteroGrueso;
  const [adjustViewOpen, setAdjustViewOpen] = useState(false);
  // Sube cuando la persona aprieta "Usar aquí" tras haber sido sacada por
  // otra pestaña. Está en las dependencias del efecto de conexión: subirlo
  // es LO QUE hace que se vuelva a conectar. Un reintento a pedido, nunca
  // automático — el automático es el que arma la pelea entre las pestañas.
  const [reintentoManual, setReintentoManual] = useState(0);
  // «Usar esta pestaña»: el próximo intento entra aunque esta pestaña haya
  // soltado la sala a la app u otro lado (lib/sesionDuplicada.ts). Lo consume
  // el efecto de conexión; cualquier otro intento sigue sin tomarla solo.
  const tomarLaSalaRef = useRef(false);
  const [videoSettingsOpen, setVideoSettingsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  // Si quien monta no dice nada —Cowork en sus cuatro caminos, el invitado de
  // Meet—, vale lo último que la persona eligió.
  // ⚠️ Inicializador PEREZOSO a propósito: `initialBackgroundEffect` está en las
  // dependencias del efecto de conexión, cuyo cleanup desconecta la sala. Si
  // esto llegara por un prop que cambia después del primer render, cada lectura
  // de la preferencia reconectaría la llamada entera.
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>(
    () => (initialBackgroundEffect && initialBackgroundEffect !== "none" ? initialBackgroundEffect : leerFondoGuardado()),
  );
  // El fondo que se le pasa a `connect`, siempre el vigente.
  // ⚠️ Va por REF, igual que displayName más abajo: `bgEffect` cambia cada vez
  // que la persona toca un fondo, y lo que entra al efecto de conexión está en
  // su array de dependencias — como estado, cada cambio de fondo reconectaría
  // la sala entera. Al reconectar por otra razón (cambio de sala) se usa la
  // elección de ese momento, no la del primer render.
  // Y NO sirve pasar `initialBackgroundEffect`: su default es "none", que es
  // truthy, así que el `|| leerFondoGuardado()` del hook nunca caía y en Cowork
  // el fondo guardado no se aplicaba nunca.
  const bgInicialRef = useRef<BackgroundEffect>(bgEffect);
  bgInicialRef.current = bgEffect;
  const [audioInputId, setAudioInputId] = useState(initialAudioDeviceId);
  const [audioOutputId, setAudioOutputId] = useState(initialAudioOutputDeviceId);
  const [videoInputId, setVideoInputId] = useState(initialVideoDeviceId);
  const [pinnedSid, setPinnedSid] = useState<string | null>(null);

  const handleViewSettingsChange = useCallback((s: ViewSettings) => { setViewSettings(s); }, []);

  useEffect(() => { if (chatOpen && lk.unreadChatCount > 0) lk.clearUnreadChat(); }, [chatOpen, lk.unreadChatCount, lk.clearUnreadChat]);

  // Si el hook tuvo que caerse a "sin efecto" —la imagen guardada ya no
  // existe—, la UI tiene que seguirlo. Sin esto el botón quedaba encendido
  // sobre una cámara que estaba publicando la habitación real.
  useEffect(() => {
    if (lk.fondoCorregido && lk.fondoCorregido !== bgEffect) setBgEffect(lk.fondoCorregido);
    // `bgEffect` a propósito FUERA de las dependencias: acá solo interesa
    // reaccionar a la corrección del hook, no re-evaluar en cada cambio de
    // fondo (eso sería una pelea entre los dos estados).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lk.fondoCorregido]);

  // El último nivel de difuminado que la persona eligió, para que el botón
  // rápido lo devuelva igual. Antes apagaba "Difuminar más" y lo volvía a
  // prender como normal, sin decir nada.
  const ultimoBlurRef = useRef<BackgroundEffect>("blur");
  if (esBlur(bgEffect)) ultimoBlurRef.current = bgEffect;

  // El detector del fondo baja ~9,4 MB la primera vez (lib/fondoFino/procesador.ts).
  // Se baja de antemano a quien lo va a usar —ya tiene un fondo elegido— o en la
  // app de computador (caché nueva): así el desenfoque se pone al instante.
  useEffect(() => {
    if (!soportaProcesadorDeFondo()) return;
    if (leerFondoGuardado() === "none" && !escritorio()) return;
    const id = window.setTimeout(() => { void precalentarFondo(); }, 3000);
    return () => window.clearTimeout(id);
  }, []);

  const handleBgChange = useCallback((effect: BackgroundEffect) => {
    setBgEffect(effect);
    // Se guarda SIEMPRE, conectado o no: si solo lo guardara el hook, elegir
    // fondo antes de que la sala termine de conectar no dejaría rastro.
    guardarFondo(effect);
    if (lk.connectionState === ConnectionState.Connected) void lk.setBackgroundEffect(effect);
  }, [lk.connectionState, lk.setBackgroundEffect]);

  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  // Por ref, como el nombre: no cambia en una misma llamada y, si estuviera en
  // las dependencias del efecto de conexión, cualquier cambio la reconectaría.
  const sinVideoAjenoRef = useRef(sinVideoAjeno);
  sinVideoAjenoRef.current = sinVideoAjeno;
  const telemetriaRef = useRef(telemetria);
  telemetriaRef.current = telemetria;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retried = false;
    // Espera creciente para los reintentos automáticos de la conexión inicial.
    let intentosFallidos = 0;
    const ESPERAS_RECONEXION = [2000, 5000, 10000, 20000, 30000];

    // Volviendo de una caída: todo apagado (ver volviendoDeCaidaRef).
    const deCaida = volviendoDeCaidaRef.current;
    intentoApagadoRef.current = deCaida;
    // Se lee UNA vez por corrida del efecto: los reintentos de abajo (los de la
    // conexión inicial) siguen siendo el mismo pedido de la persona.
    const tomarLaSala = tomarLaSalaRef.current;
    tomarLaSalaRef.current = false;
    const tryConnect = async () => {
      try {
        await lk.connect(roomName, displayNameRef.current, isAdmin, {
          tomarLaSala,
          initialMicOn: deCaida ? false : initialMicOn,
          initialCamOn: deCaida ? false : initialCamOn,
          audioDeviceId: initialAudioDeviceId,
          videoDeviceId: initialVideoDeviceId,
          audioOutputDeviceId: initialAudioOutputDeviceId,
          backgroundEffect: bgInicialRef.current,
          tokenProvider: getTokenRef.current ? () => getTokenRef.current!() : undefined,
          sinVideoAjeno: sinVideoAjenoRef.current,
          telemetria: telemetriaRef.current,
        });
      } catch (err: any) {
        if (cancelled) return;
        const msg = String(err?.message || err || "");
        // Auto-retry once on race-condition aborts (StrictMode double-mount, fast remount)
        if (!retried && /Abort handler called|aborted|AbortError/i.test(msg)) {
          retried = true;
          console.warn("[LiveKit] Signal aborted, retrying once in 600ms…", msg);
          retryTimer = setTimeout(() => { if (!cancelled) void tryConnect(); }, 600);
          return;
        }
        // La conexión inicial que falla (token que no llegó, "Failed to fetch",
        // un 5xx) SE REINTENTA SOLA con espera creciente, mientras la vista siga
        // montada. El Hub del supervisor se quedaba muerto en "Error de conexión"
        // hasta que alguien tocara un botón (Alvaro, 10/2026: "siempre tenemos un
        // error de conexión — arréglalo de una vez"). Esto NO pelea con la
        // protección de pestañas: esa es un desconecte POSTERIOR (sala viva que
        // otra pestaña adopta), nunca un throw de connect().
        const espera = ESPERAS_RECONEXION[Math.min(intentosFallidos, ESPERAS_RECONEXION.length - 1)];
        intentosFallidos++;
        console.warn(`[LiveKit] Conexión inicial falló (${msg}); se reintenta en ${espera / 1000}s`);
        retryTimer = setTimeout(() => { if (!cancelled) void tryConnect(); }, espera);
      }
    };

    void tryConnect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      lk.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, isAdmin, initialMicOn, initialCamOn, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect, reintentoManual]);

  // Volver de un meet grupal compartiendo pantalla como antes (Jhon, 10/09). El
  // navegador solo deja pedir la pantalla cerca del clic de "Volver"; si ya
  // pasó el momento, se avisa en vez de fallar en silencio. Una sola vez.
  const pantallaInicialRef = useRef(initialScreenShareOn);
  useEffect(() => {
    if (!pantallaInicialRef.current || lk.connectionState !== ConnectionState.Connected || lk.isScreenSharing) return;
    pantallaInicialRef.current = false;
    Promise.resolve(lk.toggleScreenShare()).catch(() => toast.info(t("messenger.callView.tocaCompartir")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lk.connectionState]);

  useEffect(() => {
    const h = () => { lk.disconnect(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [lk]);

  const handleLeave = useCallback(() => {
    // Si ESTA persona está grabando, no se va sin parar: la grabación se
    // detiene y queda guardada (Jhon, 09/09/2026: tres grabaciones quedaron
    // días "En curso" porque quien grabó se fue). El servidor la cortaría
    // igual a los 5 min sin el iniciador; esto la deja limpia al instante y
    // le avisa a quien se va.
    const mia = leerMiGrabacion(roomName);
    if (mia) {
      const ok = window.confirm(t("messenger.callView.confirmarSalirGrabando"));
      if (!ok) return;
      void detenerAlSalir(roomName, mia.id);
    }
    olvidarCaida(roomName);
    // Salir a propósito: la próxima vez que entre aquí, entra (no queda el
    // «la tiene otro lado» de un corte anterior).
    olvidarSalaSoltada(roomName);
    lk.disconnect(); onLeave(); if (!suppressLeaveToast) toast.info(t("messenger.callView.llamadaFinalizada"));
  }, [lk, onLeave, suppressLeaveToast, roomName, t]);

  // Una acción de moderación puede volver con 403 del servidor (no eres
  // anfitrión, o intentás moderar al anfitrión): mostramos el motivo. Con el
  // honor system anterior no había respuesta posible — el mensaje salía al aire
  // y nadie sabía si había pasado algo.
  const runModeration = useCallback(async (fn: () => Promise<unknown>, okMessage: string) => {
    try {
      await fn();
      toast.success(okMessage);
    } catch (e: any) {
      toast.error(e?.message || t("messenger.callView.noSePudoAplicar"));
    }
  }, [t]);

  const handleModeration = useCallback(
    (fn: (identity: string) => Promise<void>, okMessage: string) => (identity: string) => {
      void runModeration(() => fn(identity), okMessage);
    },
    [runModeration],
  );

  const handleAudioInputChange = useCallback((id: string) => { setAudioInputId(id); lk.switchAudioInput?.(id); }, [lk]);
  const handleAudioOutputChange = useCallback((id: string) => { setAudioOutputId(id); lk.switchAudioOutput?.(id); }, [lk]);
  const handleVideoInputChange = useCallback((id: string) => { setVideoInputId(id); lk.switchVideoInput?.(id); }, [lk]);

  const handlePinParticipant = useCallback((sid: string) => {
    setPinnedSid((prev) => prev === sid ? null : sid);
  }, []);

  const shareLink = useMemo(() => {
    if (shareLinkProp) return shareLinkProp;
    const params = new URLSearchParams();
    const n = (callDisplayName || roomName).trim();
    if (n) params.set("name", n);
    const qs = params.toString();
    return `${window.location.origin}/call/${encodeURIComponent(roomName)}${qs ? `?${qs}` : ""}`;
  }, [roomName, callDisplayName, shareLinkProp]);

  // Clear pin if participant left
  useEffect(() => {
    if (pinnedSid && !lk.participants.some((p) => p.sid === pinnedSid)) {
      setPinnedSid(null);
    }
  }, [lk.participants, pinnedSid]);

  // En Cowork, la cámara de quien no habla llega en calidad baja (lib/calidadPorVoz.ts).
  const conectada = lk.connectionState === ConnectionState.Connected;
  const getRoomLk = lk.getRoom;
  useEffect(() => {
    const room = getRoomLk();
    if (!room || !conectada || !aplicaCalidadPorVoz(room.name)) return;
    const ultimaVez = new Map<string, number>();
    const ajustar = () => {
      const ahora = Date.now();
      room.remoteParticipants.forEach((p) => {
        if (p.isSpeaking) ultimaVez.set(p.sid, ahora);
        const pub = p.getTrackPublication(Track.Source.Camera);
        if (!pub?.isSubscribed) return;
        try {
          pub.setVideoQuality(calidadDeCamara({ fijado: p.sid === pinnedSid, hablando: p.isSpeaking, ultimaVezHablo: ultimaVez.get(p.sid), ahora }));
        } catch { /* la calidad nunca rompe la llamada */ }
      });
    };
    ajustar();
    room.on(RoomEvent.ActiveSpeakersChanged, ajustar);
    room.on(RoomEvent.TrackSubscribed, ajustar);
    const repaso = window.setInterval(ajustar, 3_000);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, ajustar);
      room.off(RoomEvent.TrackSubscribed, ajustar);
      window.clearInterval(repaso);
    };
  }, [getRoomLk, conectada, pinnedSid]);

  // Auto-leave when remote participants reach 0 for autoLeaveOnEmpty ms
  // Only triggers after at least one remote participant has been seen (room was populated)
  const handleLeaveRef = useRef(handleLeave);
  handleLeaveRef.current = handleLeave;
  const hadRemoteParticipantRef = useRef(false);
  useEffect(() => { hadRemoteParticipantRef.current = false; }, [roomName]);
  useEffect(() => {
    if (!autoLeaveOnEmpty || lk.connectionState !== ConnectionState.Connected) return;
    const remoteCount = lk.participants.filter((p) => !p.isLocal).length;
    if (remoteCount > 0) { hadRemoteParticipantRef.current = true; return; }
    if (!hadRemoteParticipantRef.current) return;
    const timer = setTimeout(() => { handleLeaveRef.current(); }, autoLeaveOnEmpty);
    return () => clearTimeout(timer);
  }, [autoLeaveOnEmpty, lk.participants, lk.connectionState]);

  // Fire onMediaStateChange when local participant's media state changes
  const localP = lk.participants.find((p) => p.isLocal);
  const localMicOn = localP ? !localP.isMuted : false;
  const localCamOn = localP ? !localP.isCameraOff : false;
  // Para SUPERVISAR se usa el estado real: `isCameraOff` incluye el freno de
  // dibujado del efecto de fondo, y ese freno haciendose pasar por "camara
  // apagada" es lo que le reclamaba encuadre a gente que estaba en camara.
  const camaraRealOn = localP ? !(localP.isCameraOffReal ?? localP.isCameraOff) : false;
  // ⚠️ `localP.isScreenSharing` sale de la LISTA de participantes, y esa lista
  // solo se recalcula cuando algún evento la refresca. Si queda vieja —una
  // reconexión, un evento que no llegó— el valor se pega en `false` mientras la
  // persona SÍ está compartiendo, y entonces el aviso le reclama que comparta
  // algo que ya está compartiendo. Le pasó a Alexandra en producción.
  //
  // Es el mismo bug que tuvo la cámara y tiene el mismo arreglo, que acá arriba
  // ya está probado: leer el estado REAL en un tic, no confiar en la lista.
  // Cuesta nada — es mirar una propiedad de un objeto que ya está en memoria.
  const [compartiendoReal, setCompartiendoReal] = useState(false);
  // El MediaStreamTrack de la pantalla propia, para que Argos le saque un
  // pantallazo cada minuto (igual que el de la cámara). Sale del mismo tic.
  const [localScreenTrack, setLocalScreenTrack] = useState<MediaStreamTrack | null>(null);
  useEffect(() => {
    const mirar = () => {
      const room = lk.getRoom();
      const pub = room?.localParticipant?.getTrackPublication?.(Track.Source.ScreenShare);
      const activo = !!pub && !pub.isMuted;
      setCompartiendoReal((antes) => (antes === activo ? antes : activo));
      const t = activo ? ((pub?.track?.mediaStreamTrack as MediaStreamTrack | undefined) ?? null) : null;
      setLocalScreenTrack((antes) => (antes === t ? antes : t));
    };
    mirar();
    const id = window.setInterval(mirar, 1000);
    return () => window.clearInterval(id);
  }, [lk]);
  const onLocalScreenTrackRef = useRef(onLocalScreenTrack);
  onLocalScreenTrackRef.current = onLocalScreenTrack;
  useEffect(() => { onLocalScreenTrackRef.current?.(localScreenTrack); }, [localScreenTrack]);
  useEffect(() => () => { onLocalScreenTrackRef.current?.(null); }, []);
  // UNA SOLA PANTALLA (Alvaro, 16/11/2026): en el Supervisor Hub la pantalla se
  // publica (Argos la necesita y así se pide pantalla completa) pero nadie del
  // Hub puede suscribirse a ella; solo la ve la sala donde el supervisor habla,
  // por el clon que manda el tablero. Se recalcula cuando entra alguien o cambia
  // lo que publico.
  const salaLista = lk.connectionState === ConnectionState.Connected;
  useEffect(() => {
    if (!pantallaSoloParaMi || !salaLista) return;
    const room = lk.getRoom();
    if (!room) return;
    const aplicar = () => {
      const lp = room.localParticipant;
      const permitidas = Array.from(lp.trackPublications.values())
        .filter((p) => p.source !== Track.Source.ScreenShare && p.source !== Track.Source.ScreenShareAudio)
        .map((p) => p.trackSid);
      lp.setTrackSubscriptionPermissions(false, Array.from(room.remoteParticipants.values()).map((rp) => ({
        participantIdentity: rp.identity, allowAll: false, allowedTrackSids: permitidas,
      })));
    };
    aplicar();
    const eventos = [RoomEvent.ParticipantConnected, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished] as const;
    eventos.forEach((e) => room.on(e, aplicar));
    return () => {
      eventos.forEach((e) => room.off(e, aplicar));
      try { room.localParticipant.setTrackSubscriptionPermissions(true); } catch { /* ya colgó */ }
    };
  }, [pantallaSoloParaMi, salaLista, lk]);
  // La lista se sigue usando para DIBUJAR (el tile de pantalla), que es su
  // trabajo. Para decidir si se le reclama a alguien, manda el estado real.
  const localScreenShare = compartiendoReal;

  // ── LA SALA SE CAYÓ ───────────────────────────────────────────────────────
  // Antes, cuando LiveKit se rendía (~19 s de reintentos) la persona quedaba con
  // la grilla vacía, sin cartel, sin botón y sin reconexión: una caída duraba lo
  // que tardara en darse cuenta, y el reloj de Cowork la anotaba como "sin
  // cámara". Ahora se informa la conexión al reloj (que paga hasta 10 min de
  // caídas por hora) y se muestra un cartel con un botón para volver. Decisión
  // de Jhon, 29/09/2026.
  // Sobrevive a recargar la página (sessionStorage, por sala y por pestaña): si
  // no, un F5 en medio de la caída —o la recarga sola por un deploy— hacía que el
  // primer intento fallido se leyera como "primera entrada": el reloj volvía a
  // anotar "sin cámara" y aparecía la pantalla de error que saca de la sala.
  const [yaEstuvoConectada, setYaEstuvoConectada] = useState(() => caidaEnCurso(roomName));
  // Otra sala se mira por su cuenta: entrar a una sala nueva no es "caerse".
  useEffect(() => { setYaEstuvoConectada(caidaEnCurso(roomName)); }, [roomName]);
  // Irse de la sala dentro de la app (cambiar de sala, colgar desde la
  // ventanita) borra la marca. Un F5 o una recarga por deploy no corren esta
  // limpieza, así que la marca sobrevive justo en el caso para el que existe.
  useEffect(() => () => olvidarCaida(roomName), [roomName]);
  // Se marca al LLEGAR a conectada, no con cualquier render conectado: al cambiar
  // de sala hay un render con el nombre nuevo y la conexión vieja todavía viva.
  // Arranca en "desconectada": la vista que se monta YA conectada también cuenta
  // como llegada.
  const estadoAnteriorRef = useRef<ConnectionState | string>(ConnectionState.Disconnected);
  const [volvioDeCaida, setVolvioDeCaida] = useState(false);
  useEffect(() => {
    const antes = estadoAnteriorRef.current;
    estadoAnteriorRef.current = lk.connectionState;
    if (lk.connectionState !== ConnectionState.Connected || antes === ConnectionState.Connected) return;
    setYaEstuvoConectada(true);
    olvidarCaida(roomName);
    volviendoDeCaidaRef.current = false;
    if (intentoApagadoRef.current) { intentoApagadoRef.current = false; setVolvioDeCaida(true); }
  }, [lk.connectionState, roomName]);
  const conexionDeLaSala = conexionDeSala(lk.connectionState, lk.razonDeSalida, yaEstuvoConectada);
  // El equipo se durmió (lib/equipoDormido.ts): para la vista es una sala caída
  // (cartel y botón), pero al reloj de Cowork va «dormido», que no se paga.
  const conexionActual: ConexionSala | null =
    lk.equipoDormido && conexionDeLaSala === "desconectada" ? "dormido" : conexionDeLaSala;
  const salaCaida = conexionDeLaSala === "desconectada";
  const salaConectada = lk.connectionState === ConnectionState.Connected;
  // El cartel de «la sala la tiene otro lado», según desde dónde sigue.
  const textosSalaTomada = CLAVES_SALA_TOMADA[lk.quienTieneLaSala ?? "pestana"];

  useEffect(() => {
    if (!salaCaida) return;
    volviendoDeCaidaRef.current = true;
    marcarCaida(roomName);
  }, [salaCaida, roomName]);
  // El aviso de vuelta se va solo en cuanto prende la cámara o el micrófono.
  useEffect(() => { if (lk.isCamOn || lk.isMicOn) setVolvioDeCaida(false); }, [lk.isCamOn, lk.isMicOn]);
  // Con sala de verdad (conectada o en los segundos de reintento de LiveKit).
  // Fuera de eso —caída, otra pestaña, la primera entrada que falló— los avisos
  // de "prende la cámara" mandarían a arreglar lo que no está roto.
  const conSalaViva = conexionActual === "conectada" || conexionActual === "reconectando";
  // Con la sala caída los interruptores no hacen nada: actuaban sobre una sala
  // que ya no existe (se tomaba el micrófono 15 s y salía "el micrófono no
  // enciende"). Se avisa qué hacer.
  const primeroReconectar = useCallback(() => {
    toast.info(t(lkRef.current.connectionState === ConnectionState.Disconnected
      ? "messenger.callView.primeroReconecta" : "messenger.callView.esperaALaSala"));
  }, [t]);

  // ⚠️ SE VUELVE CON UN BOTÓN, NO SOLA. Esta vista la usan TODAS las llamadas de
  // Maven, y la vuelta automática abría problemas peores que la caída: una
  // laptop que perdió el wifi volvía sola horas después a la llamada, con el
  // micrófono abierto; en Cowork, el equipo abandonado le quitaba el lugar al
  // teléfono que la persona sí estaba usando. Con el botón, vuelve quien está.
  // El botón solo aparece sin un intento en curso (ver el cartel).
  const puedeReconectar = salaCaida && lk.connectionState === ConnectionState.Disconnected;
  const onMediaStateChangeRef = useRef(onMediaStateChange);
  onMediaStateChangeRef.current = onMediaStateChange;
  // Vigilancia de encuadre sobre la cámara local. El track sale del room de
  // LiveKit, así no capturamos la cámara una segunda vez.
  //
  // SE BUSCA EN UN TIC, NO EN UN useMemo, y esto no es un detalle de estilo:
  // LiveKit publica la cámara de forma ASÍNCRONA. `localCamOn` se pone en true
  // apenas se pide la cámara, pero la publicación aparece unos instantes
  // después. Con un useMemo dependiente de `localCamOn`, el cálculo corría
  // justo en ese hueco, devolvía null, y NADA lo volvía a disparar: el
  // supervisor se quedaba con "no hay cámara" para siempre y le reclamaba a
  // alguien que estaba perfectamente encuadrado. Le pasó a Jhon probando, y
  // sobrevivía a recargar porque la carrera se repite en cada arranque.
  //
  // Un tic de un segundo cierra la carrera venga la publicación cuando venga,
  // y cuesta nada: es leer una propiedad de un objeto que ya está en memoria.
  const [localCameraTrack, setLocalCameraTrack] = useState<MediaStreamTrack | null>(null);
  useEffect(() => {
    const buscar = () => {
      const room = lk.getRoom();
      const pub = room?.localParticipant?.getTrackPublication?.(Track.Source.Camera);
      const t = (pub?.track?.mediaStreamTrack as MediaStreamTrack | undefined) ?? null;
      // Solo se avisa si CAMBIÓ: si no, cada segundo re-dispararía el detector.
      setLocalCameraTrack((antes) => (antes === t ? antes : t));
    };
    buscar();
    const id = window.setInterval(buscar, 1000);
    return () => window.clearInterval(id);
  }, [lk, localCamOn, lk.connectionState]);
  // `enabled` NO incluye localCamOn: con la cámara apagada queremos que reporte
  // `cam_off`, no que se congele en el último estado.
  const faceWatch = useFaceWatch(localCameraTrack, !!onFaceStateChange && camaraRealOn);

  // EL SUPERVISOR VIVE ACÁ, no en la página de Cowork. Esta vista sobrevive a
  // navegar a otra sección de Maven (se muda a la ventanita flotante); la
  // página no. Cuando el aviso vivía allá, se apagaba justo cuando la persona
  // se iba a mirar otra pestaña — o sea, justo cuando más falta hace.
  // Con la sala caída la cámara se ve apagada aunque no lo esté: reclamarle
  // "prende la cámara" la mandaría a arreglar lo que no está roto, en vez de
  // enterarse de que se cayó la sala (para eso está el cartel).
  useFaceNudge(supervisorEncuadre && conSalaViva ? faceWatch : null);
  // Monitor de cámara de RRHH: vive JUSTO acá, pegado al supervisor de encuadre,
  // porque comparte su mismo track y estado y su misma vida (sobrevive a la
  // ventanita flotante). Registra las faltas gratis (cámara apagada/tapada, se
  // fue, cara incompleta) y cada ~2 min pasa un frame por la IA (celular/
  // distraído). Solo en una sala de Cowork viva; el propio hook excluye admins.
  // En la sala de Cowork se exige la PANTALLA COMPLETA (Alvaro, 10/11): si
  // elige una pestaña o una ventana, useLiveKit se la rechaza y se la pide de nuevo.
  useEffect(() => { lk.setExigirPantallaCompleta(!!supervisorEncuadre); }, [lk.setExigirPantallaCompleta, supervisorEncuadre]);
  const ultimoPantallazo = useUltimoPantallazo();
  const [ahoraMonitor, setAhoraMonitor] = useState(() => Date.now());
  useEffect(() => {
    if (!supervisorEncuadre) return;
    const id = window.setInterval(() => setAhoraMonitor(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [supervisorEncuadre]);
  useMonitorCamara({
    track: localCameraTrack,
    trackPantalla: localScreenTrack,
    camaraRealOn,
    faceWatch,
    activo: !!supervisorEncuadre && conSalaViva,
    roomNombre: roomName,
  });
  // Argos — escalera de muestreo + grabación al distraerse (Alvaro, 08/11).
  // Solo corre cuando hay PANTALLA compartida (nada que grabar sin eso); el
  // propio hook excluye admins y respeta monitor_config.activo. Reemplaza el
  // tick normal de IA de useMonitorCamara mientras esté activo (ese se apaga
  // solo al detectar trackPantalla).
  useArgosEscaleraClip({
    trackCamara: localCameraTrack,
    trackPantalla: localScreenTrack,
    faceWatch,
    activo: !!supervisorEncuadre && conSalaViva,
    roomNombre: roomName,
  });
  // El aviso de voz a la persona + su registro en el expediente los hace el
  // mismo useFaceNudge/useScreenShareNudge (voz Javi + argos_nudges). El hook
  // aparte era redundante y su registro estaba roto: se quitó (Alvaro, 09/11).
  // Cualquier llamada que NO es la sala de Cowork (Messenger, Meet, la 1:1 con
  // el coordinador) deja un latido en localStorage mientras está montada: el
  // supervisor de encuadre de Cowork lo consulta en cada tic y se calla — estar
  // en una llamada de Maven es trabajo, no una ausencia que reclamar. Cross-
  // pestaña a propósito: /call/... y Meet abren en OTRA pestaña.
  useEffect(() => {
    if (supervisorEncuadre || sinLatidoDeLlamada) return;
    latirEnLlamada();
    const id = window.setInterval(() => latirEnLlamada(), LATIDO_LLAMADA_MS);
    // También en el servidor: el vigía «fuera de Cowork» no cuenta como salida
    // estar en otra llamada de Maven (Alvaro, 11/11).
    // Con el reloj del Worker (lib/relojesFirmes, ya puesto en CriticalTimers al
    // conectar): la pestaña del Meet suele quedar atrás y Chrome adormece sus
    // relojes; para un anfitrión este latido es lo que hace que la reunión
    // cuente como Cowork (Alvaro, 17/11/2026).
    latirLlamadaEnServidor(supabase, roomName);
    const idServidor = CriticalTimers.setInterval(() => latirLlamadaEnServidor(supabase, roomName), LATIDO_SERVIDOR_MS);
    // Al salir solo se borra el latido de ESTA sala, no el de otra llamada abierta.
    return () => { window.clearInterval(id); CriticalTimers.clearInterval(idServidor); salirDeLlamada(); salirLlamadaEnServidor(supabase, roomName); };
  }, [supervisorEncuadre, sinLatidoDeLlamada, roomName]);
  // En Cowork la pantalla compartida es la mitad del trabajo: sin ella se ve la
  // cara pero no QUÉ está haciendo la persona.
  useScreenShareNudge(localScreenShare, !!supervisorEncuadre && conSalaViva);
  // Y que quede constancia: los mismos llamados, guardados. Va acá al lado de
  // los avisos a propósito — se anota lo que la persona efectivamente escuchó,
  // no una regla parecida calculada en otra parte que puede irse separando.
  useRegistrarLlamados({
    faceWatch,
    compartiendo: localScreenShare,
    activo: !!supervisorEncuadre,
    // Con la sala caída, LiveKit vacía la lista de participantes y la cámara de
    // todo el mundo se ve apagada aunque esté prendida. Sin esto, una caída de
    // veinte minutos le anotaba a cada persona veinte minutos de "cámara
    // apagada" — y como Supabase vive en otro servidor, las escrituras salían.
    conectado: salaConectada,
  });
  const onFaceStateChangeRef = useRef(onFaceStateChange);
  onFaceStateChangeRef.current = onFaceStateChange;
  useEffect(() => {
    onFaceStateChangeRef.current?.(faceWatch);
  }, [faceWatch]);

  // ⚠️ EL BUG ERA LA LISTA DE DEPENDENCIAS.
  //
  // El efecto reportaba `camaraRealOn` pero su lista de dependencias miraba
  // `localCamOn`, que es OTRA variable. Y con la pantalla compartida —que es
  // justo cuando importa— `localCamOn` queda CLAVADO en false: la lista de
  // participantes trae DOS recuadros para quien comparte (`tilesDeParticipante`
  // en useLiveKit.ts) y el PRIMERO es el de la pantalla, con `isCameraOff: true`
  // escrito a mano; el `find(p => p.isLocal)` de arriba agarra ese. Entonces la
  // dependencia no cambiaba nunca, el efecto no se volvía a ejecutar y el
  // `setInterval` re-mandaba cada 10 s el `camaraRealOn` que había quedado
  // atrapado en el closure.
  //
  // Reportado por Maria Villegas el 28/09/2026: su cara visible en la grilla de
  // Maven y el reloj diciendo "cámara apagada" durante 5 minutos, con el tramo
  // empezando 3 segundos después de re-entrar a la sala. Prender y apagar la
  // cámara no la destrababa —no cambia ninguna dependencia—; solo tocar el
  // micrófono o dejar de compartir.
  //
  // ⚠️ FALLA EN LAS DOS DIRECCIONES, y por eso urge: congelado en `false` no le
  // cuenta tiempo que trabajó; congelado en `true` le cuenta tiempo con la
  // cámara apagada. Este reloj reemplaza a Hubstaff: mueve pago.
  //
  // Lo que arregla el bug son las DEPENDENCIAS: ahora miran `camaraRealOn`, que
  // es el valor que de verdad se reporta, así que un cambio sale en el momento
  // y no hasta 10 s después.
  // El ref es aparte y es defensivo: hace que el repetidor lea siempre el valor
  // vigente, así que si mañana alguien agrega un cuarto dato al aviso y se
  // olvida de ponerlo en las dependencias, el repetidor no puede volver a
  // quedarse pegado. Mismo patrón que `onMediaStateChangeRef` de acá arriba.
  // `conexionSala` va en el mismo aviso que la cámara, y no en otro: con la sala
  // caída los dos cambian en el mismo render, y el reloj tiene que ver los dos
  // juntos para no anotar un "sin cámara" de paso.
  const mediaReportadaRef = useRef<{ micOn: boolean; camOn: boolean; screenShareOn: boolean; conexionSala: ConexionSala | null }>({
    micOn: false, camOn: false, screenShareOn: false, conexionSala: null,
  });
  mediaReportadaRef.current = { micOn: localMicOn, camOn: camaraRealOn, screenShareOn: localScreenShare, conexionSala: conexionActual };
  useEffect(() => {
    const avisar = () => onMediaStateChangeRef.current?.(mediaReportadaRef.current);
    avisar();
    // Se repite cada 10 s aunque no cambie nada. El aviso "solo al cambiar"
    // deja a la persona invisible para el supervisor si ESE aviso se pierde
    // —y esta noche se perdio varias veces—; repetirlo es barato y convierte
    // cualquier hueco en 10 segundos de atraso en vez de un turno entero.
    const id = window.setInterval(avisar, 10_000);
    return () => window.clearInterval(id);
  }, [localMicOn, camaraRealOn, localScreenShare, conexionActual]);

  const effectiveLayout: "grid" | "sidebar" = useMemo(() => {
    if (pinnedSid) return "sidebar";
    const mode = viewSettings.layout;
    if (mode === "sidebar") return "sidebar";
    if (mode === "tiled") return "grid";
    return lk.participants.some((p) => p.isScreenSharing) ? "sidebar" : "grid";
  }, [viewSettings.layout, lk.participants, pinnedSid]);

  // PERSONAS, no recuadros. Al compartir pantalla se emiten DOS tiles de la
  // misma persona (uno para la pantalla, otro para su camara), asi que
  // `participants.length` contaba de mas: dos personas se leian como tres.
  const cantidadDePersonas = useMemo(
    () => new Set(lk.participants.map((p) => p.identity)).size,
    [lk.participants],
  );

  const visibleParticipants = useMemo(() => {
    let list = lk.participants;
    if (viewSettings.hideNoVideo) list = list.filter((p) => !p.isCameraOff || p.isScreenSharing || p.isLocal);
    if (list.length > viewSettings.maxTiles) list = list.slice(0, viewSettings.maxTiles);
    return list;
  }, [lk.participants, viewSettings.hideNoVideo, viewSettings.maxTiles]);

  const spotlightParticipant = useMemo(() => {
    if (pinnedSid) {
      const pinned = visibleParticipants.find((p) => p.sid === pinnedSid);
      if (pinned) return pinned;
    }
    const ss = visibleParticipants.find((p) => p.isScreenSharing);
    return ss || visibleParticipants.find((p) => p.identity === lk.activeSpeaker) || visibleParticipants[0];
  }, [visibleParticipants, lk.activeSpeaker, pinnedSid]);

  // Los que NO son el destacado. Se calculaba dos veces inline; con la vista
  // compacta pasaban a ser tres, así que se nombra una vez.
  //
  // Va DESPUÉS de `spotlightParticipant` y no antes: declarar esto arriba lo
  // dejaría leyendo una variable que todavía no existe, y eso no es un detalle
  // de estilo — ese error exacto tumbó la página en producción dos veces.
  const otrosParticipantes = useMemo(
    () => visibleParticipants.filter((p) => p.sid !== spotlightParticipant?.sid),
    [visibleParticipants, spotlightParticipant],
  );

  const room = lk.getRoom();

  // Volviendo de una caída NO se tapa la llamada: se queda el cartel.
  if (lk.connectionState === ConnectionState.Connecting && !yaEstuvoConectada) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("messenger.callView.conectando")}</p>
      </div>
    );
  }

  // Un intento de volver que falla deja `error`: no es para mostrar la pantalla
  // de error, cuyo único botón SACA de la sala. Se sigue intentando.
  if (lk.error && !salaCaida) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground items-center justify-center gap-4">
        <p className="text-destructive font-medium">{t("messenger.callView.errorConexion")}</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{lk.error}</p>
        {/* La conexión inicial se reintenta sola (espera creciente): que se vea,
            para que nadie se quede esperando con el dedo en el botón. */}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> {t("messenger.callView.reintentaSolo")}
        </p>
        {/* Reintentar sin salir: el botón de antes solo COLGABA, y un fetch
            cortado dejaba al supervisor con el Hub muerto hasta volver a
            entrar a mano. */}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => setReintentoManual((n) => n + 1)} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm hover:bg-primary/90">{t("messenger.callView.reintentar")}</button>
          {!sinVolverEnError && (
            <button onClick={handleLeave} className="px-4 py-2 rounded-full border border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{t("common.back")}</button>
          )}
        </div>
      </div>
    );
  }

  const gridCols =
    visibleParticipants.length <= 1 ? "grid-cols-1"
    : visibleParticipants.length <= 2 ? "grid-cols-1 md:grid-cols-2"
    : visibleParticipants.length <= 4 ? "grid-cols-2"
    : visibleParticipants.length <= 9 ? "grid-cols-2 md:grid-cols-3"
    : "grid-cols-3 md:grid-cols-4";

  // Navegador de sesiones/salas de Cowork. El SELECTOR va en la barra superior:
  // antes flotaba abajo, sobre el video, y tapaba el nombre de la gente y el
  // aviso de "esperando a que otros se unan" (pedido de Jhon, 10/09). Las
  // flechas de los costados siguen donde estaban.
  const salasNavegables = roomSwitcher && roomSwitcher.rooms.length > 1 ? roomSwitcher.rooms : null;
  const salaActualIdx = salasNavegables && roomSwitcher
    ? Math.max(0, salasNavegables.findIndex((r) => r.id === roomSwitcher.currentId))
    : 0;
  const selectorDeSalas = salasNavegables && roomSwitcher ? (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => setSalasAbiertas((v) => !v)}
        title={t("messenger.callView.cambiarDeSala")}
        className={`flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted ${effectiveCompact ? "max-w-[190px]" : "max-w-[240px]"}`}
      >
        <DoorOpen className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{salasNavegables[salaActualIdx]?.name ?? t("messenger.callView.salas")}</span>
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${salasAbiertas ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {salasAbiertas && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-56 min-w-[200px] overflow-y-auto rounded-2xl border border-border bg-card/95 py-1 shadow-xl backdrop-blur-sm">
          {salasNavegables.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { setSalasAbiertas(false); if (r.id !== roomSwitcher.currentId) roomSwitcher.onSwitch(r.id); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-primary/10 ${r.id === roomSwitcher.currentId ? "text-primary font-medium" : "text-foreground"}`}
            >
              <span className="w-4 shrink-0">{r.id === roomSwitcher.currentId && <Check className="h-3.5 w-3.5" />}</span>
              <span className="truncate">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative flex flex-col h-full bg-background text-foreground">
      <CallTopBar roomName={callDisplayName || roomName} participantCount={cantidadDePersonas} onOpenAdjustView={() => setAdjustViewOpen(true)} shareLink={shareLink} hideShareLink={hideShareLink} compact={effectiveCompact} tactil={tactil} extra={selectorDeSalas} acciones={accionesBarra} />

      {lk.isReconnecting && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-warning/15 text-warning text-xs font-medium">
          <WifiOff className="h-3.5 w-3.5 animate-pulse" /> {t("messenger.callView.reconectando")}
        </div>
      )}
      {/* «Solo avisarle» (Alvaro, 17/11/2026): con la conexión mala sostenida,
          un aviso discreto que se va solo cuando mejora. No apaga nada
          (lib/internetDebil.ts). */}
      {lk.internetDebil && salaConectada && !lk.isReconnecting && (
        <div role="status" className="shrink-0 flex items-center justify-center gap-2 py-1 px-3 bg-warning/10 text-warning text-xs font-medium text-center">
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t("messenger.callView.internetDebil")}
        </div>
      )}
      {/* «Tu internet se está cortando seguido» (lib/caidasSeguidas.ts): con 3
          caídas propias en 30 min, una vez por hora. Solo avisa. */}
      <AvisoCaidasSeguidas />
      {salaCaida && (
        <div role="status" className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 px-3 bg-warning/15 text-warning text-xs font-medium text-center">
          <WifiOff className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          {puedeReconectar ? (
            <>
              <span>{t(lk.equipoDormido ? "messenger.callView.equipoDormido" : "messenger.callView.salaCaida")}</span>
              <button
                type="button"
                onClick={() => setReintentoManual((n) => n + 1)}
                className="rounded-full bg-warning px-3 py-1 text-warning-foreground font-semibold hover:bg-warning/90"
              >
                {t("messenger.callView.reconectarAhora")}
              </button>
            </>
          ) : (
            <span>{t("messenger.callView.volviendoALaSala")}</span>
          )}
        </div>
      )}

      {/* Nos sacaron porque esta cuenta abrió Cowork en otro lado. No se
          reconecta solo a propósito: si lo hiciera, patearía a la otra pestaña,
          que volvería a patear a esta, y así para siempre. Se le muestra qué
          pasó y se le deja elegir dónde quedarse. */}
      {volvioDeCaida && !salaCaida && (
        <div role="status" className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 px-3 bg-primary/15 text-foreground text-xs font-medium text-center">
          {/* La pantalla solo se nombra en Cowork, donde se comparte. */}
          <span>{t(supervisorEncuadre && !hideScreenShare ? "messenger.callView.volvisteALaSala" : "messenger.callView.volvisteALaLlamada")}</span>
          <button type="button" onClick={() => setVolvioDeCaida(false)} className="underline underline-offset-2 opacity-80 hover:opacity-100">
            {t("messenger.callView.entendido")}
          </button>
        </div>
      )}
      {/* «Monitoreo activo · pantallazo hace X»: se ve también en la ventanita
          flotante y en la ventana del sistema, para que la persona sepa que el
          monitoreo sigue aunque esté en otra app (Alvaro, 10/11). */}
      {supervisorEncuadre && conSalaViva && ultimoPantallazo && ahoraMonitor - ultimoPantallazo < 5 * 60_000 && (
        <div role="status" className="shrink-0 flex items-center justify-center gap-1.5 py-1 px-3 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          {t("messenger.callView.monitoreoActivo", {
            hace: ahoraMonitor - ultimoPantallazo < 60_000
              ? t("messenger.callView.monitoreoAhora")
              : t("messenger.callView.monitoreoMin", { n: Math.floor((ahoraMonitor - ultimoPantallazo) / 60_000) }),
          })}
        </div>
      )}
      {pantallaPendiente && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 px-3 bg-primary/15 text-foreground text-xs font-medium text-center">
          <span>{t("messenger.callView.volvisteDeLaPausa")}</span>
          <button
            type="button"
            onClick={() => { void lk.toggleScreenShare(); setPantallaPendiente(null); }}
            className="rounded-full bg-primary px-3 py-1 text-primary-foreground font-semibold hover:bg-primary/90"
          >
            {t("messenger.callView.volverACompartir")}
          </button>
          <button type="button" onClick={() => setPantallaPendiente(null)} className="underline underline-offset-2 opacity-80 hover:opacity-100">
            {t("messenger.callView.ahoraNo")}
          </button>
        </div>
      )}
      {/* La sala la tomó otro lado. El texto dice DESDE DÓNDE sigue la persona
          (la app de Maven, otra ventana, otra pestaña: lib/sesionDuplicada.ts) y
          el botón es lo ÚNICO que la vuelve a tomar aquí: le marca al intento
          `tomarLaSala`, que deja afuera al otro lado. */}
      {lk.otraPestanaTomoLaSesion && (
        <div role="status" className="shrink-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-2 px-3 bg-warning/15 text-warning text-xs font-medium text-center">
          <Copy className="h-3.5 w-3.5 shrink-0" />
          <span>{t(textosSalaTomada.titulo)}.</span>
          <span className="font-normal opacity-80">{t(textosSalaTomada.detalle)}</span>
          <button
            type="button"
            onClick={() => { tomarLaSalaRef.current = true; setReintentoManual((n) => n + 1); }}
            className="underline underline-offset-2 hover:opacity-80"
          >
            {t(textosSalaTomada.usarAqui)}
          </button>
        </div>
      )}

      <div className="relative flex-1 flex overflow-hidden">
        <div className="call-ambiente relative flex-1 p-3 overflow-hidden">
          <div className="absolute left-5 top-5 z-20">
            <RecordingControl
              room={room}
              roomName={roomName}
              source={recording?.source ?? "cowork"}
              title={recording?.title}
              canControl={!!recording}
              compact={effectiveCompact}
            />
          </div>
          {effectiveLayout === "grid" ? (
            // Techo de ancho: en un monitor ultra-ancho, con una o dos personas
            // los cajones se volvian enormes y la cara quedaba perdida en el
            // medio. Centrado y con tope se ve como en Meet.
            <div className={cn("grid gap-3 h-full mx-auto w-full max-w-[1600px]", gridCols)}>
              {visibleParticipants.map((p) => <ParticipantTile key={`${p.identity}-${p.sid}`} participant={p} room={room} preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} />)}
            </div>
          ) : (
            // En COMPACTO (ventana flotante) las caras van SUPERPUESTAS sobre la
            // pantalla compartida, en la esquina, como hace Meet. En grande, al
            // costado como siempre.
            //
            // La barra lateral medía 192px FIJOS y `shrink-0`: en la ventanita
            // de 480px eso es el 40% del ancho, y como el panel grande tampoco
            // cedía (le faltaba `min-w-0`), la barra terminaba empujada fuera
            // del `overflow-hidden` del padre. La cámara estaba en el DOM pero
            // fuera de lo visible: Alexandra solo veía el cuadro de su pantalla.
            <div className={cn("h-full", effectiveCompact ? (tactil ? "flex flex-col gap-1.5" : "relative") : "flex gap-2")}>
              {spotlightParticipant && (
                // `min-w-0` es lo que le permite al panel grande achicarse. Sin
                // eso, un flex item se niega a bajar de su contenido y desborda.
                <div className={effectiveCompact ? (tactil ? "min-h-0 flex-1" : "h-full") : "flex-1 min-w-0"}>
                  <ParticipantTile compact={effectiveCompact} participant={spotlightParticipant} room={room} large className="h-full" preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} />
                </div>
              )}
              {otrosParticipantes.length > 0 && (
                effectiveCompact && tactil ? (
                  // Teléfono: TODOS los demás en una tira debajo, deslizable y con su
                  // nombre (Jhon, 10/09: "no veo todos los participantes"). Las dos
                  // caritas encimadas de la ventana flotante son para el mouse.
                  <div className="flex h-24 shrink-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {otrosParticipantes.map((p) => (
                      <div key={`${p.identity}-${p.sid}`} className="aspect-video h-full shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15">
                        <ParticipantTile compact={effectiveCompact} participant={p} room={room} className="h-full" preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} />
                      </div>
                    ))}
                  </div>
                ) : effectiveCompact ? (
                  // Esquina inferior derecha, encima de la pantalla. Se muestran
                  // como mucho DOS: en una ventana de este tamaño, una tira de
                  // nueve caritas no se ve, estorba.
                  <div className="absolute bottom-2 right-2 flex flex-col-reverse gap-1.5 w-[34%] max-w-[150px] pointer-events-none">
                    {otrosParticipantes.slice(0, 2).map((p) => (
                      <div key={`${p.identity}-${p.sid}`} className="aspect-video rounded-lg overflow-hidden ring-1 ring-white/25 shadow-lg pointer-events-auto">
                        <ParticipantTile compact={effectiveCompact} participant={p} room={room} className="h-full" preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 w-48 shrink-0 overflow-y-auto">
                    {otrosParticipantes.map((p) => (
                      <div key={`${p.identity}-${p.sid}`} className="h-28 shrink-0"><ParticipantTile compact={effectiveCompact} participant={p} room={room} preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} /></div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {lk.participants.length <= 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4">
              <div className="rounded-full bg-[hsl(220_3%_20%/0.9)] border border-border px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">{t("messenger.callView.esperando")}</div>
            </div>
          )}


        </div>

        {chatOpen && <CallChatSidebar messages={lk.chatMessages} onSend={lk.sendChatMessage} onSendFile={lk.sendChatFile} onClose={() => setChatOpen(false)} localIdentity={room?.localParticipant.identity || ""} />}
        {/* El aviso de encuadre se le muestra a la PROPIA persona: si el sistema
          detecta que no se le ve, que se entere y se acomode. Es una ayuda, no
          una cámara de vigilancia silenciosa. */}
      {onFaceStateChange && faceStateLabel(faceWatch.state) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-warning/15 border border-warning/30 px-3 py-1.5 backdrop-blur-sm">
          <span className="text-[11px] text-warning">{faceStateLabel(faceWatch.state)}</span>
        </div>
      )}

      {participantsOpen && (
          <CallParticipantsSidebar
            participants={lk.participants}
            isAdmin={isAdmin}
            onMuteParticipant={handleModeration(lk.muteParticipant, t("messenger.callView.silenciado"))}
            onRemoveParticipant={handleModeration(lk.removeParticipant, t("messenger.callView.sacado"))}
            onSetCanPublish={(identity, canPublish) =>
              runModeration(
                () => lk.setParticipantCanPublish(identity, canPublish),
                canPublish ? t("messenger.callView.puedeHablar") : t("messenger.callView.soloOyente"),
              )}
            onSetCohost={(identity, isCohost) =>
              runModeration(
                () => lk.setCohost(identity, isCohost),
                isCohost ? t("messenger.callView.ahoraCoanfitrion") : t("messenger.callView.yaNoCoanfitrion"),
              )}
            onMuteAll={() => runModeration(
              async () => {
                const muted = await lk.muteAllParticipants();
                return muted;
              },
              t("messenger.callView.todosSilenciados"),
            )}
            onEndForAll={hideEndForAll ? undefined : async () => {
              if (!window.confirm(t("messenger.callView.confirmarTerminarTodos"))) return;
              await runModeration(lk.endRoomForAll, t("messenger.callView.terminadaParaTodos"));
            }}
            onClose={() => setParticipantsOpen(false)}
          />
        )}
      </div>

      {/* Safety-net: ensures every remote mic is audible even if its tile isn't mounted */}
      <RoomAudioSink room={room} preferredAudioOutputDeviceId={audioOutputId} />

      {/* Navegador de salas (Cowork): flechas estilo Instagram + lista. Al
          moverse, el dueño cuelga la sala anterior y te mete MUTEADO a la
          nueva (initialMicOn=false del flujo de entrar a sala): no quedas como
          presencia fantasma ni hablando donde ya no estás mirando. */}
      {roomSwitcher && roomSwitcher.rooms.length > 1 && (() => {
        const n = roomSwitcher.rooms.length;
        const idx = Math.max(0, roomSwitcher.rooms.findIndex((r) => r.id === roomSwitcher.currentId));
        const anterior = roomSwitcher.rooms[(idx - 1 + n) % n];
        const siguiente = roomSwitcher.rooms[(idx + 1) % n];
        return (
          <>
            <button
              type="button"
              title={t("messenger.callView.irA", { name: anterior.name })}
              aria-label={t("messenger.callView.irA", { name: anterior.name })}
              onClick={() => roomSwitcher.onSwitch(anterior.id)}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-30 h-9 w-9 rounded-full flex items-center justify-center bg-black/45 text-white/85 backdrop-blur-sm hover:bg-black/65 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              title={t("messenger.callView.irA", { name: siguiente.name })}
              aria-label={t("messenger.callView.irA", { name: siguiente.name })}
              onClick={() => roomSwitcher.onSwitch(siguiente.id)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-30 h-9 w-9 rounded-full flex items-center justify-center bg-black/45 text-white/85 backdrop-blur-sm hover:bg-black/65 hover:text-white transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

          </>
        );
      })()}

      <CallControls
        isMicOn={lk.isMicOn}
        isCamOn={lk.isCamOn}
        isScreenSharing={lk.isScreenSharing}
        isHandRaised={lk.isHandRaised}
        isChatOpen={chatOpen}
        unreadChatCount={lk.unreadChatCount}
        isParticipantsOpen={participantsOpen}
        currentAudioInputId={audioInputId}
        currentAudioOutputId={audioOutputId}
        currentVideoInputId={videoInputId}
        onToggleMic={salaCaida ? primeroReconectar : lk.toggleMic}
        estadoNC={lk.estadoNC}
        onToggleCam={salaCaida ? primeroReconectar : lk.toggleCam}
        onToggleScreenShare={salaCaida ? primeroReconectar : lk.toggleScreenShare}
        onToggleHand={lk.toggleHand}
        onToggleChat={() => { const w = !chatOpen; setChatOpen(w); if (w) { setParticipantsOpen(false); lk.clearUnreadChat(); } }}
        onToggleParticipants={() => { setParticipantsOpen(!participantsOpen); if (!participantsOpen) setChatOpen(false); }}
        onSendReaction={lk.sendReaction}
        onLeave={handleLeave}
        onAudioInputChange={handleAudioInputChange}
        onAudioOutputChange={handleAudioOutputChange}
        onVideoInputChange={handleVideoInputChange}
        onOpenVideoSettings={() => setVideoSettingsOpen(true)}
        onOpenMetrics={() => setMetricsOpen(true)}
        // Los teléfonos no exponen getDisplayMedia: el botón sobraba y hacía
        // envolver la fila de controles en dos renglones (Jhon, 10/09).
        hideScreenShare={hideScreenShare || !puedeCompartirPantalla()}
        hideLeaveButton={hideLeaveButton}
        leaveLabel={leaveLabel}
        leaveIcon={leaveIcon}
        compact={effectiveCompact}
        tactil={tactil}
        onOpenAdjustView={() => setAdjustViewOpen(true)}
        backgroundEffect={bgEffect}
        onToggleBlurBackground={() => handleBgChange(alternarBlur(bgEffect, ultimoBlurRef.current))}
        controlesExtra={controlesExtra}
      />

      <AdjustViewDialog open={adjustViewOpen} onClose={() => setAdjustViewOpen(false)} settings={viewSettings} onSettingsChange={handleViewSettingsChange} />

      <VideoSettingsDialog
        open={videoSettingsOpen}
        onClose={() => setVideoSettingsOpen(false)}
        currentVideoInputId={videoInputId}
        onVideoInputChange={handleVideoInputChange}
        backgroundEffect={bgEffect}
        onBackgroundChange={handleBgChange}
      />

      <MetricsDialog
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        room={room}
        participants={lk.participants}
      />
    </div>
  );
}
