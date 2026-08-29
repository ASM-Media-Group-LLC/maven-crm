import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { VideoOff, Loader2, Monitor, Video } from "lucide-react";

interface Props {
  roomId: string;
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
  return <video ref={ref} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />;
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
          <span className="text-[9px]">Cámara apagada</span>
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
        className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {viewingScreen ? <Video className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
      </button>
      {(pv.name || viewingScreen) && (
        <span className="absolute bottom-1 left-1 max-w-[85%] truncate rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white/90">
          {pv.name}{viewingScreen ? " · pantalla" : ""}
        </span>
      )}
    </div>
  );
}

// Adjunta un track de audio remoto a un <audio> oculto. `muted` corta la reproducción sin
// desconectar (así el 🔊 por sala es instantáneo).
function AudioSink({ track, muted }: { track: any; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && track) { try { track.attach(el); } catch { /* noop */ } }
    return () => { try { track?.detach(); } catch { /* noop */ } };
  }, [track]);
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);
  return <audio ref={ref} autoPlay />;
}

// Monitor EN VIVO de una sala para el dashboard del host: escucha su audio, puede hablarle
// (publica el micro del coordinador) y muestra el video en miniatura. Una Room LiveKit propia
// por sala (adaptiveStream → capa baja para thumbnails). El coordinador aparece como
// "📢 Coordinador" (solo audio) en las salas donde tenga el micro activo.
export default function CoworkRoomMonitor({ roomId, issueToken, showVideo, hearOn, broadcastOn, micBaseTrack, enabled = true, onSharersChange, onSpeakingChange }: Props) {
  const [partVideos, setPartVideos] = useState<PartVideo[]>([]);
  const [audioTracks, setAudioTracks] = useState<Array<{ sid: string; track: any }>>([]);
  // Qué participantes están mostrando su PANTALLA en vez de su cámara (por identity).
  const [screenView, setScreenView] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  // Reintentos de la miniatura. Antes, un `Disconnected` dejaba la card en
  // "Reconectando…" PARA SIEMPRE: el coordinador quedaba mirando una
  // sala que en realidad estaba llena y trabajando. Una supervisión que se
  // queda ciega en silencio es peor que uno que avisa que está ciega.
  const [intento, setIntento] = useState(0);
  const reintentoRef = useRef<number | null>(null);
  const roomRef = useRef<Room | null>(null);
  const publishedCloneRef = useRef<MediaStreamTrack | null>(null);
  const onSharersRef = useRef(onSharersChange);
  onSharersRef.current = onSharersChange;
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
          .filter((sp) => sp?.identity !== roomRef.current?.localParticipant?.identity)
          .map((sp) => sp?.name || sp?.identity || "Alguien");
        onSpeakingRef.current?.(remotos);
      })
      .on(RoomEvent.Disconnected, () => { if (!cancelled) { setStatus("error"); programarReintento(); } });

    (async () => {
      try {
        const { token, url } = await getToken();
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }
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
      const clone = publishedCloneRef.current;
      if (clone) {
        try { room.localParticipant.unpublishTrack(clone, true); } catch { /* noop */ }
        try { clone.stop(); } catch { /* noop */ }
        publishedCloneRef.current = null;
      }
      try { room.disconnect(); } catch { /* noop */ }
      roomRef.current = null;
    };
    // `intento` en las dependencias es LO QUE HACE que el reintento ocurra:
    // al subirlo, el efecto se rehace y vuelve a conectar la sala.
  }, [getToken, enabled, intento]);

  // Publicar / dejar de publicar el micro según broadcastOn + micBaseTrack.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "ready") return;
    (async () => {
      if (broadcastOn && micBaseTrack) {
        if (!publishedCloneRef.current) {
          try {
            const clone = micBaseTrack.clone();
            publishedCloneRef.current = clone;
            await room.localParticipant.publishTrack(clone, { source: Track.Source.Microphone });
          } catch (e) {
            console.error("[cowork monitor] no pude publicar tu micro en la sala:", e);
            publishedCloneRef.current = null;
          }
        }
      } else {
        const clone = publishedCloneRef.current;
        if (clone) {
          publishedCloneRef.current = null;
          try { room.localParticipant.unpublishTrack(clone, true); } catch { /* noop */ }
          try { clone.stop(); } catch { /* noop */ }
        }
      }
    })();
  }, [broadcastOn, micBaseTrack, status]);

  return (
    <>
      {/* Audio entrante (invisible). muted corta la reproducción sin desconectar. */}
      {audioTracks.map((t) => <AudioSink key={t.sid} track={t.track} muted={!hearOn} />)}

      {/* Miniatura de video (solo en modo 'video'). */}
      {showVideo && (
        status === "connecting" ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/60"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : status === "error" ? (
          <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/50 italic">Preview no disponible</div>
        ) : partVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground/50">
            <VideoOff className="h-4 w-4" />
            <span className="text-[10px]">Cámaras apagadas</span>
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
