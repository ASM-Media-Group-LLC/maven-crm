import { useEffect, useRef, memo, useCallback } from "react";
import { Track, Room } from "livekit-client";
import { UserAvatar } from "@/components/UserAvatar";
import { MicOff, Hand, Monitor, WifiOff, Pin, PinOff, MoreVertical, UserX } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";

interface ParticipantTileProps {
  participant: LKParticipant;
  room: Room | null;
  large?: boolean;
  className?: string;
  preferredAudioOutputDeviceId?: string;
  onMuteParticipant?: (identity: string) => void;
  onRemoveParticipant?: (identity: string) => void;
  onPinParticipant?: (sid: string) => void;
  pinnedSid?: string | null;
  isAdmin?: boolean;
}


function areReactionsEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areParticipantPropsEqual(prev: ParticipantTileProps, next: ParticipantTileProps) {
  const prevP = prev.participant;
  const nextP = next.participant;
  return (
    prev.room === next.room &&
    prev.large === next.large &&
    prev.className === next.className &&
    prev.preferredAudioOutputDeviceId === next.preferredAudioOutputDeviceId &&
    prev.pinnedSid === next.pinnedSid &&
    prevP.sid === nextP.sid &&
    prevP.identity === nextP.identity &&
    prevP.name === nextP.name &&
    prevP.isSpeaking === nextP.isSpeaking &&
    prevP.isMuted === nextP.isMuted &&
    prevP.isCameraOff === nextP.isCameraOff &&
    prevP.isScreenSharing === nextP.isScreenSharing &&
    prevP.isLocal === nextP.isLocal &&
    prevP.handRaised === nextP.handRaised &&
    prevP.connectionQuality === nextP.connectionQuality &&
    prevP.hasVideoTrack === nextP.hasVideoTrack &&
    areReactionsEqual(prevP.reactions, nextP.reactions) &&
    prev.isAdmin === next.isAdmin &&
    prev.onMuteParticipant === next.onMuteParticipant &&
    prev.onRemoveParticipant === next.onRemoveParticipant &&
    prev.onPinParticipant === next.onPinParticipant
  );
}

function ConnectionIndicator({ quality }: { quality: string }) {
  const bars = quality === "excellent" ? 3 : quality === "good" ? 2 : quality === "poor" ? 1 : 0;
  const color = bars >= 2 ? "bg-success" : bars === 1 ? "bg-warning" : "bg-destructive";

  if (quality === "lost") {
    return (
      <div className="flex items-center gap-0.5" title="Conexión perdida">
        <WifiOff className="h-3 w-3 text-destructive" />
      </div>
    );
  }

  return (
    <div className="flex items-end gap-px h-3" title={`Calidad: ${quality}`}>
      {[1, 2, 3].map((level) => (
        <div
          key={level}
          className={cn("w-[3px] rounded-sm transition-colors", level <= bars ? color : "bg-muted")}
          style={{ height: `${level * 4}px` }}
        />
      ))}
    </div>
  );
}

const ParticipantTile = memo(function ParticipantTile({
  participant, room, large, className, preferredAudioOutputDeviceId,
  onMuteParticipant, onRemoveParticipant, onPinParticipant, pinnedSid, isAdmin,
}: ParticipantTileProps) {
  const isPinned = pinnedSid === participant.sid;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const attachedVideoTrackRef = useRef<any>(null);
  const attachedVideoElRef = useRef<HTMLVideoElement | null>(null);
  const attachedAudioTrackRef = useRef<any>(null);

  const showVideo = !participant.isCameraOff || participant.isScreenSharing;

  // ── Robust audio attachment helper ─────────────────────────────
  const attachAudioTrack = useCallback(() => {
    if (participant.isLocal || !room) return;

    const audioEl = audioRef.current;
    if (!audioEl) return;

    const lkParticipant = room.remoteParticipants.get(participant.identity);
    if (!lkParticipant) return;

    const audioTrack = [...lkParticipant.audioTrackPublications.values()].find(
      (t) => t.source === Track.Source.Microphone
    );

    if (audioTrack?.track) {
      // Only re-attach if the track changed or the element lost its source
      const needsAttach =
        attachedAudioTrackRef.current !== audioTrack.track ||
        !audioEl.srcObject ||
        (audioEl.srcObject instanceof MediaStream && audioEl.srcObject.getAudioTracks().length === 0);

      if (needsAttach) {
        // Detach old track if different
        if (attachedAudioTrackRef.current && attachedAudioTrackRef.current !== audioTrack.track) {
          try { attachedAudioTrackRef.current.detach(audioEl); } catch {}
        }

        audioTrack.track.attach(audioEl);
        attachedAudioTrackRef.current = audioTrack.track;
        audioEl.volume = 1;


        // Set audio output device
        const mediaEl = audioEl as HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void>; sinkId?: string };
        if (preferredAudioOutputDeviceId && typeof mediaEl.setSinkId === "function" && mediaEl.sinkId !== preferredAudioOutputDeviceId) {
          mediaEl.setSinkId(preferredAudioOutputDeviceId).catch(() => {});
        }

        // Robust play with retries
        const tryPlay = (attempt = 0) => {
          audioEl.play().catch(() => {
            if (attempt < 5) setTimeout(() => tryPlay(attempt + 1), 300 * Math.pow(2, attempt));
          });
        };
        tryPlay();
      }
    } else if (attachedAudioTrackRef.current && audioEl) {
      try { attachedAudioTrackRef.current.detach(audioEl); } catch {}
      attachedAudioTrackRef.current = null;
    }
  }, [room, participant.identity, participant.isLocal, preferredAudioOutputDeviceId]);

  // ── Video attachment effect ────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    if (videoRef.current !== attachedVideoElRef.current) {
      if (attachedVideoTrackRef.current && attachedVideoElRef.current) {
        try { attachedVideoTrackRef.current.detach(attachedVideoElRef.current); } catch {}
      }
      attachedVideoTrackRef.current = null;
      attachedVideoElRef.current = videoRef.current;
    }

    const lkParticipant = participant.isLocal
      ? room.localParticipant
      : room.remoteParticipants.get(participant.identity);

    if (!lkParticipant) return;

    const videoSource = participant.isScreenSharing ? Track.Source.ScreenShare : Track.Source.Camera;

    const attachVideo = () => {
      const videoTrack = [...lkParticipant.videoTrackPublications.values()].find((t) => t.source === videoSource);
      const videoEl = videoRef.current;
      if (videoTrack?.track && videoEl) {
        try {
          if (attachedVideoTrackRef.current && attachedVideoTrackRef.current !== videoTrack.track) {
            attachedVideoTrackRef.current.detach(videoEl);
          }
          const shouldAttach = attachedVideoTrackRef.current !== videoTrack.track || !(videoEl as HTMLVideoElement).srcObject;
          if (shouldAttach) {
            videoTrack.track.attach(videoEl);
            attachedVideoTrackRef.current = videoTrack.track;
            videoEl.play?.().catch(() => {});
          }
          return false;
        } catch {
          attachedVideoTrackRef.current = null;
          return !participant.isCameraOff;
        }
      } else if (videoEl) {
        if (attachedVideoTrackRef.current) {
          try { attachedVideoTrackRef.current.detach(videoEl); } catch {}
          attachedVideoTrackRef.current = null;
        }
        return !participant.isCameraOff;
      }
      return false;
    };

    const needsRetry = attachVideo();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempts = 0;

    const scheduleAttachRetry = () => {
      if (retryAttempts >= 8 || (participant.isCameraOff && !participant.isScreenSharing)) return;
      retryTimer = setTimeout(() => {
        retryAttempts += 1;
        const stillNeedsRetry = attachVideo();
        if (stillNeedsRetry) scheduleAttachRetry();
      }, 200 * retryAttempts + 150);
    };

    if (needsRetry && (!participant.isCameraOff || participant.isScreenSharing)) scheduleAttachRetry();

    return () => { if (retryTimer) clearTimeout(retryTimer); };
  }, [room, participant.identity, participant.isLocal, participant.isCameraOff, participant.isScreenSharing, participant.hasVideoTrack]);

  // ── Audio attachment effect (separate from video) ──────────────
  useEffect(() => {
    attachAudioTrack();

    // Also set up a retry: sometimes the track arrives slightly after the
    // participant state updates, so poll a few times.
    if (participant.isLocal) return;

    let retryCount = 0;
    const maxRetries = 6;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (retryCount >= maxRetries) return;
      retryTimer = setTimeout(() => {
        retryCount++;
        attachAudioTrack();
        // Keep retrying if we still don't have audio attached
        if (!attachedAudioTrackRef.current) scheduleRetry();
      }, 300 * (retryCount + 1));
    };

    // If no track attached yet, schedule retries
    if (!attachedAudioTrackRef.current) {
      scheduleRetry();
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [attachAudioTrack, participant.isLocal, participant.isMuted]);

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    const videoElRef = videoRef;
    const audioElRef = audioRef;
    const attachedVideo = attachedVideoTrackRef;
    const attachedAudio = attachedAudioTrackRef;
    return () => {
      if (attachedVideo.current) {
        try { attachedVideo.current.detach(videoElRef.current!); } catch {}
        try { attachedVideo.current.detach(); } catch {}
        attachedVideo.current = null;
      }
      if (attachedAudio.current) {
        try { attachedAudio.current.detach(audioElRef.current!); } catch {}
        try { attachedAudio.current.detach(); } catch {}
        attachedAudio.current = null;
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "group relative rounded-lg overflow-hidden flex items-center justify-center h-full transition-all duration-200",
        participant.isSpeaking && "ring-2 ring-primary ring-offset-1 ring-offset-[hsl(220_3%_14%)]",
        isPinned && "ring-2 ring-primary",
        className
      )}
      style={{ background: "hsl(220 3% 20%)" }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className={cn("absolute inset-0 w-full h-full z-[1]", participant.isScreenSharing ? "object-contain bg-black" : "object-cover")}
          style={{ transform: participant.isLocal && !participant.isScreenSharing ? "scaleX(-1)" : undefined }}
        />
      ) : (
        <UserAvatar
          name={participant.name}
          size="xl"
          className={cn("z-[1]", large ? "h-24 w-24" : "h-16 w-16")}
        />
      )}

      {!participant.isLocal && (
        <audio ref={audioRef} autoPlay playsInline data-lk-audio="true" style={{ display: "none" }} />
      )}

      {/* Google Meet-style hover overlay */}
      <div className="absolute inset-0 z-[5] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          {onPinParticipant && (
            <button
              onClick={() => onPinParticipant(participant.sid)}
              className={cn(
                "h-10 w-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors",
                isPinned
                  ? "bg-primary/30 text-primary hover:bg-primary/40"
                  : "bg-[hsl(220_3%_18%/0.85)] text-foreground hover:bg-[hsl(220_3%_25%/0.95)]"
              )}
              title={isPinned ? "Desanclar" : "Anclar en pantalla"}
            >
              {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          )}
          {!participant.isLocal && onMuteParticipant && !participant.isMuted && (
            <button
              onClick={() => onMuteParticipant(participant.identity)}
              className="h-10 w-10 rounded-full bg-[hsl(220_3%_18%/0.85)] backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-[hsl(220_3%_25%/0.95)] transition-colors"
              title="Silenciar"
            >
              <MicOff className="h-4 w-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-10 w-10 rounded-full bg-[hsl(220_3%_18%/0.85)] backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-[hsl(220_3%_25%/0.95)] transition-colors"
                title={`Más opciones para ${participant.name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="bg-card border-border">
              {onPinParticipant && (
                <DropdownMenuItem onClick={() => onPinParticipant(participant.sid)} className="text-foreground focus:bg-muted">
                  {isPinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
                  {isPinned ? "Desanclar" : "Anclar en pantalla"}
                </DropdownMenuItem>
              )}
              {/* Silenciar es acción de anfitrión: el servidor rechaza al resto,
                  así que ofrecerlo a todos era prometer algo que no pasa. */}
              {isAdmin && !participant.isLocal && onMuteParticipant && !participant.isMuted && (
                <DropdownMenuItem onClick={() => onMuteParticipant(participant.identity)} className="text-foreground focus:bg-muted">
                  <MicOff className="h-3.5 w-3.5 mr-2" /> Silenciar
                </DropdownMenuItem>
              )}
              {isAdmin && !participant.isLocal && onRemoveParticipant && (
                <DropdownMenuItem onClick={() => onRemoveParticipant(participant.identity)} className="text-destructive focus:bg-muted">
                  <UserX className="h-3.5 w-3.5 mr-2" /> Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Reactions */}
      {participant.reactions.length > 0 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 z-10 pointer-events-none">
          {participant.reactions.map((emoji, i) => (
            <span key={`${emoji}-${i}-${Date.now()}`} className="text-6xl drop-shadow-lg animate-reaction-float">{emoji}</span>
          ))}
        </div>
      )}

      {/* Hand raised */}
      {participant.handRaised && (
        <div className="absolute top-3 left-3 bg-warning/90 rounded-full p-2 animate-pulse z-10">
          <Hand className="h-6 w-6 text-white" />
        </div>
      )}

      {/* Pinned indicator */}
      {isPinned && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 bg-primary/85 backdrop-blur-sm text-white text-[10px] font-medium rounded-full px-2 py-1">
            <Pin className="h-3 w-3" /> Anclado
          </div>
        </div>
      )}

      {/* Screen sharing badge */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-1.5 bg-[hsl(220_3%_14%/0.8)] backdrop-blur-sm text-foreground text-[10px] font-medium rounded-full px-2.5 py-1">
            <Monitor className="h-3 w-3" /> Compartiendo pantalla
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2.5 py-1.5 z-10 bg-gradient-to-t from-black/50 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-white">
            {participant.isLocal ? "Tú" : participant.name}
          </span>
          {participant.isMuted && (
            <div className="h-5 w-5 rounded-full bg-destructive flex items-center justify-center">
              <MicOff className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <ConnectionIndicator quality={participant.connectionQuality} />
      </div>
    </div>
  );
}, areParticipantPropsEqual);

export default ParticipantTile;
