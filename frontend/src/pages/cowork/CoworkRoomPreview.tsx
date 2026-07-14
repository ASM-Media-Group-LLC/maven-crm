import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { VideoOff, Loader2 } from "lucide-react";

interface Props {
  roomId: string;
  // cowork.issueLiveKitToken — devuelve { token, url, ... }
  issueToken: (purpose: string, roomId?: string) => Promise<{ token: string; url: string }>;
}

// Adjunta UN track de video remoto a un <video>. Detach en cleanup.
function PreviewTile({ track }: { track: any }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && track) {
      try { track.attach(el); } catch { /* noop */ }
    }
    return () => { try { track?.detach(); } catch { /* noop */ } };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />;
}

// Preview EN VIVO (subscribe-only) de una sala cowork para la miniatura del dashboard del host.
// Crea su propia Room LiveKit con adaptiveStream (LiveKit sirve la capa de baja resolución a
// videos chicos → poco ancho de banda). Se suscribe SOLO a video de cámara y lo pinta; no
// publica nada y no reproduce audio (nunca adjunta tracks de audio). El token viene del edge
// con purpose "preview_room" (canPublish:false + hidden:true → el host no aparece en la sala).
export default function CoworkRoomPreview({ roomId, issueToken }: Props) {
  const [tracks, setTracks] = useState<Array<{ sid: string; track: any }>>([]);
  const [status, setStatus] = useState<"connecting" | "ready" | "error">("connecting");

  const getToken = useCallback(async () => {
    const r = await issueToken("preview_room", roomId);
    return { token: r.token, url: r.url };
  }, [roomId, issueToken]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });

    const isCam = (pub: any, track: any) =>
      track?.kind === Track.Kind.Video && ((pub?.source ?? track?.source) === Track.Source.Camera);

    const add = (track: any, pub: any) => {
      if (!isCam(pub, track)) return;
      setTracks((prev) => (prev.some((t) => t.sid === track.sid) ? prev : [...prev, { sid: track.sid, track }]));
    };
    const remove = (track: any) => setTracks((prev) => prev.filter((t) => t.sid !== track.sid));

    room
      .on(RoomEvent.TrackSubscribed, (track: any, pub: any) => add(track, pub))
      .on(RoomEvent.TrackUnsubscribed, (track: any) => remove(track))
      .on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus("error"); });

    (async () => {
      try {
        const { token, url } = await getToken();
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }
        setStatus("ready");
        // Adjuntar tracks ya suscritos por si conectamos después del subscribe.
        room.remoteParticipants.forEach((p: any) => {
          p.trackPublications.forEach((pub: any) => {
            if (pub.track && pub.isSubscribed) add(pub.track, pub);
          });
        });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      setTracks([]);
      try { room.disconnect(); } catch { /* noop */ }
    };
  }, [getToken]);

  if (status === "connecting") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/60">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/50 italic">
        Preview no disponible
      </div>
    );
  }
  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 text-muted-foreground/50">
        <VideoOff className="h-4 w-4" />
        <span className="text-[10px]">Cámaras apagadas</span>
      </div>
    );
  }
  const cols = tracks.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <div className={`grid ${cols} gap-1 h-full auto-rows-fr`}>
      {tracks.map((t) => (
        <div key={t.sid} className="relative overflow-hidden rounded-lg bg-black min-h-0">
          <PreviewTile track={t.track} />
        </div>
      ))}
    </div>
  );
}
