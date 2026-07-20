import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { VideoOff, Loader2 } from "lucide-react";

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
export default function CoworkRoomMonitor({ roomId, issueToken, showVideo, hearOn, broadcastOn, micBaseTrack, enabled = true }: Props) {
  const [videoTracks, setVideoTracks] = useState<Array<{ sid: string; track: any }>>([]);
  const [audioTracks, setAudioTracks] = useState<Array<{ sid: string; track: any }>>([]);
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");
  const roomRef = useRef<Room | null>(null);
  const publishedCloneRef = useRef<MediaStreamTrack | null>(null);

  const getToken = useCallback(async () => {
    const r = await issueToken("monitor_room", roomId);
    return { token: r.token, url: r.url };
  }, [roomId, issueToken]);

  // Conexión (una sola vez por sala). Si el coordinador entró a esta sala, NO conectamos
  // el monitor (evita la doble presencia 📢-monitor + participante real).
  useEffect(() => {
    if (!enabled) { setStatus("connecting"); return; }
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const addTrack = (track: any, pub: any) => {
      if (track?.kind === Track.Kind.Video && ((pub?.source ?? track?.source) === Track.Source.Camera)) {
        setVideoTracks((prev) => (prev.some((t) => t.sid === track.sid) ? prev : [...prev, { sid: track.sid, track }]));
      } else if (track?.kind === Track.Kind.Audio) {
        setAudioTracks((prev) => (prev.some((t) => t.sid === track.sid) ? prev : [...prev, { sid: track.sid, track }]));
      }
    };
    const rmTrack = (track: any) => {
      setVideoTracks((prev) => prev.filter((t) => t.sid !== track.sid));
      setAudioTracks((prev) => prev.filter((t) => t.sid !== track.sid));
    };

    room
      .on(RoomEvent.TrackSubscribed, (t: any, p: any) => addTrack(t, p))
      .on(RoomEvent.TrackUnsubscribed, (t: any) => rmTrack(t))
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("error"); });

    (async () => {
      try {
        const { token, url } = await getToken();
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }
        setStatus("ready");
        room.remoteParticipants.forEach((p: any) => {
          p.trackPublications.forEach((pub: any) => { if (pub.track && pub.isSubscribed) addTrack(pub.track, pub); });
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      setVideoTracks([]);
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
  }, [getToken, enabled]);

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
          } catch {
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
        ) : videoTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground/50">
            <VideoOff className="h-4 w-4" />
            <span className="text-[10px]">Cámaras apagadas</span>
          </div>
        ) : (
          <div className={`grid ${videoTracks.length === 1 ? "grid-cols-1" : "grid-cols-2"} gap-1 h-full auto-rows-fr`}>
            {videoTracks.map((t) => (
              <div key={t.sid} className="relative overflow-hidden rounded-lg bg-black min-h-0"><VideoTile track={t.track} /></div>
            ))}
          </div>
        )
      )}
    </>
  );
}
