import { useCallback, useEffect, useRef, useState } from "react";
import AudioSink from "./AudioSink";
import { Room, RoomEvent, Track } from "livekit-client";
import { copiaSirve } from "@/lib/microDelSupervisor";
import { VideoOff, Loader2, Monitor, Video, Copy } from "lucide-react";
import { esOtraPestana, TITULO_OTRA_PESTANA, BOTON_USAR_AQUI } from "@/lib/sesionDuplicada";
import { toast } from "sonner";

interface Props {
  roomId: string;
  /** Nombre visible de la sala. Solo para poder AVISAR con precisión cuál se
   *  quedó sin tu voz: "no pude publicar tu micro" sin decir dónde no sirve
   *  cuando se supervisan nueve. */
  roomName?: string;
  // cowork.issueLiveKitToken — devuelve { token, url, ... }
  issueToken: (purpose: string, roomId?: string) => Promise<{ token: string; url: string }>;
  // Renderizar la miniatura de video (modo 'video'). En modo 'avatars' es false: la conexión
  // sigue viva para el AUDIO, pero no dibuja video (los avatares los pinta el padre).
  showVideo: boolean;
  // Escuchar el audio entrante de esta sala (🔊). Si false, la conexión sigue pero en silencio.
  hearOn: boolean;
  // Publicar mi micro en esta sala (🎤 = master global && mic de esta sala). Usa un clon del
  // track base compartido para no capturar el micro N veces.
  broadcastOn: boolean;
  micBaseTrack: MediaStreamTrack | null;
  // Broadcastear mi CÁMARA a esta sala (misma mecánica que el micro: la cámara
  // se captura UNA vez en el dashboard y cada sala publica un clon).
  camOn?: boolean;
  camBaseTrack?: MediaStreamTrack | null;
  // Broadcastear mi PANTALLA a esta sala (una sola captura, un clon por sala).
  screenOn?: boolean;
  screenBaseTrack?: MediaStreamTrack | null;
  // Cuando el coordinador ENTRÓ a esta misma sala, el monitor se apaga: si no, aparecería
  // dos veces (📢 monitor + él mismo como participante). Default true.
  enabled?: boolean;
  // Reporta quién está compartiendo pantalla en esta sala (verdad de LiveKit, no presence).
  onSharersChange?: (names: string[]) => void;
  // Reporta quién está HABLANDO ahora (ActiveSpeakersChanged). El dashboard lo usa
  // para pintar la card en verde: se ve de un vistazo dónde hay conversación.
  onSpeakingChange?: (names: string[]) => void;
}

// Video por participante: su cámara y su pantalla (cualquiera puede faltar).
interface PartVideo {
  identity: string;
  name: string;
  camera: any | null;
  screen: any | null;
}

// Adjunta un track de video remoto a un <video>.
function VideoTile({ track }: { track: any }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && track) { try { track.attach(el); } catch { /* noop */ } }
    return () => { try { track?.detach(); } catch { /* noop */ } };
  }, [track]);
  // `contain` y no `cover`: esta miniatura es la que usa el supervisor para ver
  // si alguien está en cámara. `cover` rellena el rectángulo RECORTANDO, y como
  // la caja no tiene la proporción de la cámara, lo primero que se pierde es la
  // cabeza — justo lo único que hay que mirar.
  return <video ref={ref} autoPlay playsInline muted className="w-full h-full object-contain bg-black" />;
}

// Miniatura de un participante con botón de SWAP cámara ↔ pantalla. Por defecto muestra la
// cámara; si comparte pantalla, el botón deja alternar. Si NO comparte, el botón va
// deshabilitado. Solo se ADJUNTA (y por ende streamea) el track que se está viendo — el otro
// queda pausado por adaptiveStream, así ver la pantalla no cuesta ancho de banda hasta pedirlo.
function MonitorTile({ pv, viewingScreen, onSwap }: { pv: PartVideo; viewingScreen: boolean; onSwap: () => void }) {
  const canSwap = !!pv.screen;
  const activeTrack = viewingScreen && pv.screen ? pv.screen : pv.camera;
  return (
    <div className="relative overflow-hidden rounded-lg bg-black min-h-0">
      {activeTrack ? (
        <VideoTile track={activeTrack} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground/50">
          <VideoOff className="h-4 w-4" />
          <span className="text-[9px] tactil:text-[11px]">Cámara apagada</span>
        </div>
      )}
      <button
        type="button"
        disabled={!canSwap}
        onClick={onSwap}
        title={
          !canSwap
            ? "No está compartiendo pantalla"
            : viewingScreen
              ? "Ver cámara"
              : "Ver pantalla compartida"
        }
        aria-label={viewingScreen ? "Ver cámara" : "Ver pantalla compartida"}
        className="absolute top-1 right-1 z-10 flex h-6 w-6 tactil:h-8 tactil:w-8 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {viewingScreen ? <Video className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
      </button>
      {(pv.name || viewingScreen) && (
        <span className="absolute bottom-1 left-1 max-w-[85%] truncate rounded bg-black/50 px-1.5 py-0.5 text-[9px] tactil:text-[11px] text-white/90">
          {pv.name}{viewingScreen ? " · pantalla" : ""}
        </span>
      )}
    </div>
  );
}

// ── Publicar un CLON de un track base en la sala ────────────────────────────
//
// Es la mecánica del 🎤 "hablar a la sala", generalizada para poder broadcastear
// también la cámara y la pantalla: el dashboard captura el track UNA vez y cada
// sala publica su propio clon. Conserva las tres defensas que el micro aprendió
// a los golpes:
//   · `copiaSirve`: re-publica si el clon murió o si el track base cambió.
//   · Reintentos con espera creciente que NUNCA se rinden, con aviso al 4º.
//   · Si la sala se desconecta, el clon viejo se descarta: pertenece a la
//     conexión vieja, y dejarlo colgado era quedarse mudo tras reconectar.
function useClonPublicado(opts: {
  roomRef: React.MutableRefObject<Room | null>;
  status: string;
  activo: boolean;
  baseTrack: MediaStreamTrack | null | undefined;
  source: Track.Source;
  roomId: string;
  roomName?: string;
  /** Para los avisos: "tu micrófono", "tu cámara", "tu pantalla". */
  etiqueta: string;
}) {
  const { roomRef, status, activo, baseTrack, source, roomId, roomName, etiqueta } = opts;
  const publishedCloneRef = useRef<MediaStreamTrack | null>(null);
  const baseDelCloneRef = useRef<MediaStreamTrack | null>(null);
  const [intentoPublicar, setIntentoPublicar] = useState(0);
  const MAX_INTENTOS_PUBLICAR = 4;
  const toastId = `clon-${source}-sala-${roomId}`;

  useEffect(() => {
    const room = roomRef.current;
    if (status !== "ready") {
      // Sala caída o reconectando: el clon pertenece a la conexión VIEJA.
      // Guardarlo hacía que copiaSirve dijera "todo bien" y la sala nueva
      // quedara sin el track para siempre.
      const viejo = publishedCloneRef.current;
      if (viejo) {
        publishedCloneRef.current = null;
        baseDelCloneRef.current = null;
        try { viejo.stop(); } catch { /* noop */ }
      }
      return;
    }
    if (!room) return;
    let cancelado = false;
    (async () => {
      if (activo && baseTrack) {
        const actual = publishedCloneRef.current;
        if (copiaSirve(actual, baseDelCloneRef.current, baseTrack)) return;

        // Lo que había ya no sirve: se retira antes de poner lo nuevo, para no
        // dejar dos pistas tuyas en la sala (una de ellas muerta).
        if (actual) {
          publishedCloneRef.current = null;
          baseDelCloneRef.current = null;
          try { room.localParticipant.unpublishTrack(actual, true); } catch { /* noop */ }
          try { actual.stop(); } catch { /* noop */ }
        }

        let clone: MediaStreamTrack | null = null;
        try {
          clone = baseTrack.clone();
          publishedCloneRef.current = clone;
          baseDelCloneRef.current = baseTrack;
          await room.localParticipant.publishTrack(clone, { source });
          if (intentoPublicar !== 0) setIntentoPublicar(0);
          toast.dismiss(toastId);
        } catch (e) {
          console.error(`[cowork monitor] no pude publicar ${etiqueta} en la sala:`, e);
          if (clone) { try { clone.stop(); } catch { /* noop */ } }
          publishedCloneRef.current = null;
          baseDelCloneRef.current = null;
          if (!cancelado) {
            if (intentoPublicar === MAX_INTENTOS_PUBLICAR) {
              toast.error(`No se está publicando ${etiqueta} en ${roomName ? `«${roomName}»` : "una sala"}`, {
                description: "Se sigue reintentando solo; si no vuelve, apaga y vuelve a encender el botón de esa sala.",
                duration: 15_000,
                id: toastId,
              });
            }
            const espera = intentoPublicar < MAX_INTENTOS_PUBLICAR
              ? 2_000 * (intentoPublicar + 1)
              : 15_000;
            window.setTimeout(() => setIntentoPublicar((n) => n + 1), espera);
          }
        }
      } else {
        const clone = publishedCloneRef.current;
        if (clone) {
          publishedCloneRef.current = null;
          baseDelCloneRef.current = null;
          try { room.localParticipant.unpublishTrack(clone, true); } catch { /* noop */ }
          try { clone.stop(); } catch { /* noop */ }
        }
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, baseTrack, status, intentoPublicar]);

  // Al desmontar el monitor, el clon no puede quedar vivo reteniendo hardware.
  useEffect(() => () => {
    const clone = publishedCloneRef.current;
    if (clone) {
      publishedCloneRef.current = null;
      baseDelCloneRef.current = null;
      try { roomRef.current?.localParticipant.unpublishTrack(clone, true); } catch { /* noop */ }
      try { clone.stop(); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Monitor EN VIVO de una sala para el dashboard del host: escucha su audio, puede hablarle
// (publica el micro del coordinador) y muestra el video en miniatura. Una Room LiveKit propia
// por sala (adaptiveStream → capa baja para thumbnails). El coordinador aparece como
// "📢 Coordinador" (solo audio) en las salas donde tenga el micro activo.
export default function CoworkRoomMonitor({ roomId, roomName, issueToken, showVideo, hearOn, broadcastOn, micBaseTrack, camOn = false, camBaseTrack = null, screenOn = false, screenBaseTrack = null, enabled = true, onSharersChange, onSpeakingChange }: Props) {
  const [partVideos, setPartVideos] = useState<PartVideo[]>([]);
  const [audioTracks, setAudioTracks] = useState<Array<{ sid: string; track: any }>>([]);
  // Qué participantes están mostrando su PANTALLA en vez de su cámara (por identity).
  const [screenView, setScreenView] = useState<Record<string, boolean>>({});
  // "duplicada" NO es un error y por eso es un estado aparte: la sala está
  // perfecta, lo que pasa es que esta cuenta abrió Cowork en otro lado y
  // LiveKit nos sacó de acá. Mezclarlo con "error" era lo que disparaba el
  // reintento, y el reintento era el bucle.
  const [status, setStatus] = useState<"connecting" | "ready" | "error" | "duplicada">("connecting");
  // Reintentos de la miniatura. Antes, un `Disconnected` dejaba la card en
  // "Reconectando…" PARA SIEMPRE: el coordinador quedaba mirando una
  // sala que en realidad estaba llena y trabajando. Una supervisión que se
  // queda ciega en silencio es peor que uno que avisa que está ciega.
  const [intento, setIntento] = useState(0);
  const reintentoRef = useRef<number | null>(null);
  const roomRef = useRef<Room | null>(null);
  const onSharersRef = useRef(onSharersChange);
  onSharersRef.current = onSharersChange;
  /** Mi propia identidad en ESTA sala, capturada al conectar.
   *  Antes se leía `roomRef.current?.localParticipant?.identity` en el momento
   *  de filtrar, y durante una reconexión eso puede ser null: ahí el filtro no
   *  filtraba nada y MI PROPIA voz pintaba la tarjeta de verde, como si
   *  estuviera hablando el chatter. */
  const identidadLocalRef = useRef<string | null>(null);
  const onSpeakingRef = useRef(onSpeakingChange);
  onSpeakingRef.current = onSpeakingChange;

  const getToken = useCallback(async () => {
    const r = await issueToken("monitor_room", roomId);
    return { token: r.token, url: r.url };
  }, [roomId, issueToken]);

  // Conexión (una sola vez por sala). Si el coordinador entró a esta sala, NO conectamos
  // el monitor (evita la doble presencia 📢-monitor + participante real).
  useEffect(() => {
    if (!enabled) { setStatus("connecting"); onSharersRef.current?.([]); onSpeakingRef.current?.([]); return; }
    let cancelled = false;
    // Espera creciente, con techo: si LiveKit está caído no tiene sentido
    // martillarlo desde nueve miniaturas a la vez, pero tampoco rendirse.
    const esperaMs = Math.min(30_000, 3_000 * 2 ** Math.min(intento, 4));
    const programarReintento = () => {
      if (cancelled || reintentoRef.current !== null) return;
      reintentoRef.current = window.setTimeout(() => {
        reintentoRef.current = null;
        setIntento((n) => n + 1);
      }, esperaMs);
    };

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    // Guarda la cámara o la pantalla de un participante en su casillero.
    const addVideo = (participant: any, pub: any, track: any) => {
      const source = pub?.source ?? track?.source;
      const isCam = source === Track.Source.Camera;
      const isScreen = source === Track.Source.ScreenShare;
      if (!isCam && !isScreen) return;
      const identity = participant?.identity ?? track?.sid ?? "?";
      const name = participant?.name || participant?.identity || "Alguien";
      setPartVideos((prev) => {
        const i = prev.findIndex((p) => p.identity === identity);
        if (i === -1) {
          return [...prev, { identity, name, camera: isCam ? track : null, screen: isScreen ? track : null }];
        }
        const next = [...prev];
        next[i] = {
          ...next[i],
          name,
          camera: isCam ? track : next[i].camera,
          screen: isScreen ? track : next[i].screen,
        };
        return next;
      });
    };
    const addAudio = (track: any) => {
      setAudioTracks((prev) => (prev.some((t) => t.sid === track.sid) ? prev : [...prev, { sid: track.sid, track }]));
    };
    const removeVideoBySid = (sid: string) => {
      setPartVideos((prev) =>
        prev
          .map((p) => ({
            ...p,
            camera: p.camera?.sid === sid ? null : p.camera,
            screen: p.screen?.sid === sid ? null : p.screen,
          }))
          .filter((p) => p.camera || p.screen),
      );
    };

    // Verdad de LiveKit: escanea las publicaciones de la sala y reporta quién comparte
    // pantalla (source=ScreenShare). Más confiable que el presence auto-reportado.
    const recomputeSharers = () => {
      if (!roomRef.current) return;
      const names: string[] = [];
      roomRef.current.remoteParticipants.forEach((p: any) => {
        const sharing = Array.from(p.trackPublications.values()).some(
          (pub: any) => pub.source === Track.Source.ScreenShare && pub.kind === Track.Kind.Video,
        );
        if (sharing) names.push(p.name || p.identity || "Alguien");
      });
      onSharersRef.current?.(names);
    };

    room
      .on(RoomEvent.TrackSubscribed, (t: any, pub: any, participant: any) => {
        if (t?.kind === Track.Kind.Video) addVideo(participant, pub, t);
        else if (t?.kind === Track.Kind.Audio) addAudio(t);
        recomputeSharers();
      })
      .on(RoomEvent.TrackUnsubscribed, (t: any) => {
        if (t?.kind === Track.Kind.Video) removeVideoBySid(t.sid);
        else setAudioTracks((prev) => prev.filter((x) => x.sid !== t.sid));
        recomputeSharers();
      })
      .on(RoomEvent.TrackPublished, () => recomputeSharers())
      .on(RoomEvent.TrackUnpublished, () => recomputeSharers())
      .on(RoomEvent.ParticipantConnected, () => recomputeSharers())
      .on(RoomEvent.ParticipantDisconnected, () => recomputeSharers())
      // Quién habla AHORA. Excluimos al participante local: cuando el coordinador
      // le habla a la sala publica su micro acá, y su propia voz no debe pintar la
      // card como si estuvieran hablando los chatters.
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
        const remotos = (speakers || [])
          // Doble guarda: `isLocal` lo dice LiveKit y no depende de ninguna
          // referencia nuestra; la identidad capturada al conectar es el
          // respaldo. Cualquiera de las dos alcanza para no contarme a mí.
          .filter((sp) => !sp?.isLocal && sp?.identity !== identidadLocalRef.current)
          .map((sp) => sp?.name || sp?.identity || "Alguien");
        onSpeakingRef.current?.(remotos);
      })
      // OJO con reintentar acá sin mirar la razón: si nos sacaron porque la
      // misma cuenta entró en otra pestaña, reconectar la patea a ella, que
      // reconecta y nos patea a nosotros. Bucle infinito, y desde afuera se ve
      // como la miniatura parpadeando y la persona entrando y saliendo sola.
      .on(RoomEvent.Disconnected, (razon) => {
        if (cancelled) return;
        if (esOtraPestana(razon)) { setStatus("duplicada"); return; }
        setStatus("error");
        programarReintento();
      });

    (async () => {
      try {
        const { token, url } = await getToken();
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }
        identidadLocalRef.current = room.localParticipant?.identity ?? null;
        setStatus("ready");
        if (intento !== 0) setIntento(0);   // volvió: se reinicia la espera
        room.remoteParticipants.forEach((p: any) => {
          p.trackPublications.forEach((pub: any) => {
            if (!pub.track || !pub.isSubscribed) return;
            if (pub.kind === Track.Kind.Video) addVideo(p, pub, pub.track);
            else if (pub.kind === Track.Kind.Audio) addAudio(pub.track);
          });
        });
        recomputeSharers();
      } catch {
        if (!cancelled) { setStatus("error"); programarReintento(); }
      }
    })();

    return () => {
      cancelled = true;
      if (reintentoRef.current !== null) { window.clearTimeout(reintentoRef.current); reintentoRef.current = null; }
      onSharersRef.current?.([]);
      onSpeakingRef.current?.([]);
      setPartVideos([]);
      setAudioTracks([]);
      // Los clones publicados (micro/cámara/pantalla) los limpia su propio
      // hook (useClonPublicado) cuando status deja de ser "ready" o al desmontar.
      try { room.disconnect(); } catch { /* noop */ }
      roomRef.current = null;
    };
    // `intento` en las dependencias es LO QUE HACE que el reintento ocurra:
    // al subirlo, el efecto se rehace y vuelve a conectar la sala.
  }, [getToken, enabled, intento]);

  // ── SI LA SALA NO ESTÁ CONECTADA, NO SABEMOS QUIÉN HABLA ────────────────
  //
  // El borde verde de la tarjeta significa "acá hay alguien hablando AHORA", y
  // ese dato llega por eventos en vivo de la sala. Si la sala se desconectó,
  // dejan de llegar — pero la última lista se quedaba pegada, así que quien
  // estuviera hablando en el instante justo de la caída dejaba la tarjeta
  // VERDE PARA SIEMPRE. El supervisor veía conversación donde no había nadie.
  //
  // La lista solo se limpiaba al desmontar el monitor o al desactivarlo; NO al
  // desconectarse. Acá se cubre cualquier estado que no sea "conectado":
  // desconexión, error, reintento y sesión duplicada.
  //
  // Mejor no decir nada que decir algo de hace veinte minutos.
  useEffect(() => {
    if (status === "ready") return;
    onSpeakingRef.current?.([]);
    onSharersRef.current?.([]);
  }, [status]);

  // Los tres broadcasts del coordinador hacia esta sala, con la MISMA mecánica
  // (clon del track base + copiaSirve + reintentos que no se rinden):
  useClonPublicado({ roomRef, status, activo: broadcastOn, baseTrack: micBaseTrack, source: Track.Source.Microphone, roomId, roomName, etiqueta: "tu micrófono" });
  useClonPublicado({ roomRef, status, activo: camOn, baseTrack: camBaseTrack, source: Track.Source.Camera, roomId, roomName, etiqueta: "tu cámara" });
  useClonPublicado({ roomRef, status, activo: screenOn, baseTrack: screenBaseTrack, source: Track.Source.ScreenShare, roomId, roomName, etiqueta: "tu pantalla" });

  return (
    <>
      {/* Audio entrante (invisible). muted corta la reproducción sin desconectar. */}
      {audioTracks.map((t) => <AudioSink key={t.sid} track={t.track} muted={!hearOn} />)}

      {/* Miniatura de video (solo en modo 'video'). */}
      {showVideo && (
        status === "connecting" ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/60"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : status === "duplicada" ? (
          // Se le dice qué pasó y se le da la salida en el mismo lugar. Antes
          // esto caía en "Preview no disponible", que hacía pensar que la sala
          // estaba rota cuando en realidad estaba llena y trabajando.
          <div className="flex flex-col items-center justify-center h-full gap-1 px-2 text-center">
            <Copy className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-[10px] tactil:text-[11px] text-muted-foreground/70">{TITULO_OTRA_PESTANA}</span>
            <button
              type="button"
              onClick={() => setIntento((n) => n + 1)}
              className="text-[10px] underline text-primary hover:text-primary/80"
            >
              {BOTON_USAR_AQUI}
            </button>
          </div>
        ) : status === "error" ? (
          <div className="flex items-center justify-center h-full text-[11px] tactil:text-[12px] text-muted-foreground/50 italic">Preview no disponible</div>
        ) : partVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground/50">
            <VideoOff className="h-4 w-4" />
            <span className="text-[10px] tactil:text-[11px]">Cámaras apagadas</span>
          </div>
        ) : (
          <div className={`grid ${partVideos.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-1 h-full auto-rows-fr`}>
            {partVideos.map((pv) => (
              <MonitorTile
                key={pv.identity}
                pv={pv}
                viewingScreen={!!screenView[pv.identity] && !!pv.screen}
                onSwap={() => setScreenView((m) => ({ ...m, [pv.identity]: !m[pv.identity] }))}
              />
            ))}
          </div>
        )
      )}
    </>
  );
}
