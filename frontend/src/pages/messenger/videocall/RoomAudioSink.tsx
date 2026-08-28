import { useEffect, useRef } from "react";
import { Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Track } from "livekit-client";

interface Props {
  room: Room | null | undefined;
  preferredAudioOutputDeviceId?: string;
}

/**
 * Safety-net audio renderer at the room level.
 *
 * Subscribes to ALL remote microphone tracks and attaches each to a hidden
 * <audio> element, regardless of whether a ParticipantTile for that participant
 * is currently mounted (it may be filtered out by hideNoVideo or maxTiles).
 *
 * ParticipantTile also attaches audio to its own element; the browser will play
 * both attached MediaStreams simultaneously, but the underlying media stream is
 * the same so it is heard once per output device. To avoid double audio, we
 * keep this sink muted=false and rely on the browser sharing the same source.
 * In practice attaching the same RemoteAudioTrack twice does not duplicate audio
 * because LiveKit's attach() returns the same underlying element source.
 */
export default function RoomAudioSink({ room, preferredAudioOutputDeviceId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const attachedRef = useRef<Map<string, { track: RemoteTrack; el: HTMLAudioElement }>>(new Map());

  useEffect(() => {
    if (!room) return;
    const container = containerRef.current;
    if (!container) return;

    const attach = (track: RemoteTrack, participant: RemoteParticipant) => {
      // Micrófono Y audio de pantalla compartida. El segundo faltaba: aunque
      // alguien compartiera un video con sonido, acá se descartaba y nadie lo
      // oía. Lo demás (si algún día hay otra fuente) se sigue ignorando.
      if (track.source !== Track.Source.Microphone && track.source !== Track.Source.ScreenShareAudio) return;
      const key = `${participant.sid}-${track.sid}`;
      if (attachedRef.current.has(key)) return;
      const el = document.createElement("audio");
      el.autoplay = true;
      (el as any).playsInline = true;
      el.setAttribute("data-lk-room-audio", "true");
      el.style.display = "none";
      container.appendChild(el);
      try { track.attach(el); } catch {}
      const mediaEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (preferredAudioOutputDeviceId && typeof mediaEl.setSinkId === "function") {
        mediaEl.setSinkId(preferredAudioOutputDeviceId).catch(() => {});
      }
      const tryPlay = (attempt = 0) => {
        el.play().catch(() => {
          if (attempt < 5) setTimeout(() => tryPlay(attempt + 1), 300 * Math.pow(2, attempt));
        });
      };
      tryPlay();
      attachedRef.current.set(key, { track, el });
    };

    const detach = (track: RemoteTrack, participant: RemoteParticipant) => {
      const key = `${participant.sid}-${track.sid}`;
      const entry = attachedRef.current.get(key);
      if (!entry) return;
      try { entry.track.detach(entry.el); } catch {}
      try { entry.el.remove(); } catch {}
      attachedRef.current.delete(key);
    };

    // Attach any already-subscribed tracks
    room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track) attach(pub.track as RemoteTrack, p);
      });
    });

    const onSubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      attach(track, participant);
    };
    const onUnsubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      detach(track, participant);
    };

    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);

    // Resume audio on user gesture if blocked
    const resume = () => { room.startAudio().catch(() => {}); };
    document.addEventListener("click", resume, { once: true });
    document.addEventListener("touchstart", resume, { once: true });

    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      document.removeEventListener("click", resume);
      document.removeEventListener("touchstart", resume);
      attachedRef.current.forEach((entry) => {
        try { entry.track.detach(entry.el); } catch {}
        try { entry.el.remove(); } catch {}
      });
      attachedRef.current.clear();
    };
  }, [room, preferredAudioOutputDeviceId]);

  return <div ref={containerRef} aria-hidden="true" style={{ display: "none" }} />;
}
