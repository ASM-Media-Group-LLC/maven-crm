import { useEffect, useRef, memo } from "react";
import { Track, Room } from "livekit-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MicOff, Hand, Monitor, WifiOff } from "lucide-react";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";

interface ParticipantTileProps {
  participant: LKParticipant;
  room: Room | null;
  large?: boolean;
  className?: string;
  preferredAudioOutputDeviceId?: string;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
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
    areReactionsEqual(prevP.reactions, nextP.reactions)
  );
}

// Connection quality indicator
function ConnectionIndicator({ quality }: { quality: string }) {
  const bars = quality === "excellent" ? 3 : quality === "good" ? 2 : quality === "poor" ? 1 : 0;
  const color = bars >= 2 ? "bg-emerald-400" : bars === 1 ? "bg-amber-400" : "bg-destructive";

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
          className={cn(
            "w-[3px] rounded-sm transition-colors",
            level <= bars ? color : "bg-[hsl(0_0%_100%/0.2)]"
          )}
          style={{ height: `${level * 4}px` }}
        />
      ))}
    </div>
  );
}

const ParticipantTile = memo(function ParticipantTile({
  participant,
  room,
  large,
  className,
  preferredAudioOutputDeviceId,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const attachedVideoTrackRef = useRef<any>(null);
  const attachedVideoElRef = useRef<HTMLVideoElement | null>(null);
  const attachedAudioTrackRef = useRef<any>(null);

  // Reset attached track ref when video element changes (camera toggle unmounts/remounts <video>)
  const showVideo = !participant.isCameraOff || participant.isScreenSharing;

  // Attach/detach tracks
  useEffect(() => {
    if (!room) return;

    // If the video element changed (remounted), detach from previous element and force reattach
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

    // ── Video ────────────────────────────────────────────────
    const videoSource = participant.isScreenSharing ? Track.Source.ScreenShare : Track.Source.Camera;
    
    const attachVideo = () => {
      const videoTrack = [...lkParticipant.videoTrackPublications.values()].find(
        (t) => t.source === videoSource
      );
      const videoEl = videoRef.current;
      
      if (videoTrack?.track && videoEl) {
        try {
          if (attachedVideoTrackRef.current && attachedVideoTrackRef.current !== videoTrack.track) {
            attachedVideoTrackRef.current.detach(videoEl);
          }

          const shouldAttach =
            attachedVideoTrackRef.current !== videoTrack.track ||
            !(videoEl as HTMLVideoElement).srcObject;

          if (shouldAttach) {
            videoTrack.track.attach(videoEl);
            attachedVideoTrackRef.current = videoTrack.track;
            // Force play in case autoplay is blocked
            videoEl.play?.().catch(() => {});
          }

          return false; // attached, no retry needed
        } catch {
          // Track can be transiently unavailable while processor/device switches
          attachedVideoTrackRef.current = null;
          return !participant.isCameraOff;
        }
      } else if (videoEl) {
        // No track available — clean up
        if (attachedVideoTrackRef.current) {
          try { attachedVideoTrackRef.current.detach(videoEl); } catch {}
          attachedVideoTrackRef.current = null;
        }
        return !participant.isCameraOff; // retry if camera should be on
      }
      return false;
    };
    
    const needsRetry = attachVideo();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempts = 0;

    const scheduleAttachRetry = () => {
      if (retryAttempts >= 8 || participant.isCameraOff) return;
      retryTimer = setTimeout(() => {
        retryAttempts += 1;
        const stillNeedsRetry = attachVideo();
        if (stillNeedsRetry) scheduleAttachRetry();
      }, 200 * retryAttempts + 150);
    };

    if (needsRetry && !participant.isCameraOff) {
      scheduleAttachRetry();
    }

    // ── Audio (remote only) ──────────────────────────────────
    const audioEl = audioRef.current;
    if (!participant.isLocal && audioEl) {
      const audioTrack = [...lkParticipant.audioTrackPublications.values()].find(
        (t) => t.source === Track.Source.Microphone
      );
      if (audioTrack?.track) {
        if (attachedAudioTrackRef.current !== audioTrack.track) {
          if (attachedAudioTrackRef.current) {
            attachedAudioTrackRef.current.detach(audioEl);
          }
          audioTrack.track.attach(audioEl);
          attachedAudioTrackRef.current = audioTrack.track;
          audioEl.volume = 1;
          const mediaEl = audioEl as HTMLAudioElement & {
            setSinkId?: (deviceId: string) => Promise<void>;
            sinkId?: string;
          };

          if (
            preferredAudioOutputDeviceId &&
            typeof mediaEl.setSinkId === "function" &&
            mediaEl.sinkId !== preferredAudioOutputDeviceId
          ) {
            mediaEl.setSinkId(preferredAudioOutputDeviceId).catch(() => {});
          }

          const tryPlay = (attempt = 0) => {
            audioEl.play().catch(() => {
              if (attempt < 3) {
                setTimeout(() => tryPlay(attempt + 1), 500 * Math.pow(2, attempt));
              }
            });
          };
          tryPlay();
        }
      } else if (attachedAudioTrackRef.current && audioEl) {
        attachedAudioTrackRef.current.detach(audioEl);
        attachedAudioTrackRef.current = null;
      }
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    room,
    participant,
    preferredAudioOutputDeviceId,
  ]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      const videoEl = videoRef.current;
      const audioEl = audioRef.current;
      if (attachedVideoTrackRef.current && videoEl) {
        attachedVideoTrackRef.current.detach(videoEl);
        attachedVideoTrackRef.current = null;
      }
      if (attachedAudioTrackRef.current && audioEl) {
        attachedAudioTrackRef.current.detach(audioEl);
        attachedAudioTrackRef.current = null;
      }
    };
  }, []);

  // showVideo already declared above

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden flex items-center justify-center h-full transition-shadow duration-200",
        participant.isSpeaking && "ring-2 ring-primary ring-offset-1 ring-offset-[hsl(240_10%_6%)]",
        className
      )}
      style={{ background: "hsl(240 8% 12%)" }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className="absolute inset-0 w-full h-full object-cover z-[1]"
          style={{ transform: participant.isLocal && !participant.isScreenSharing ? "scaleX(-1)" : undefined }}
        />
      ) : (
        <Avatar className={cn("border-2 border-[hsl(0_0%_100%/0.1)] z-[1]", large ? "h-24 w-24" : "h-16 w-16")}>
          <AvatarFallback
            className={cn("bg-primary/20 text-primary font-semibold", large ? "text-3xl" : "text-lg")}
          >
            {getInitials(participant.name)}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Audio element for remote participants — always mounted, marked for autoplay recovery */}
      {!participant.isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          data-lk-audio="true"
          style={{ display: "none" }}
        />
      )}

      {/* Reactions */}
      {participant.reactions.length > 0 && (
        <div className="absolute top-3 right-3 flex gap-1 animate-bounce z-10">
          {participant.reactions.map((emoji, i) => (
            <span key={i} className="text-2xl drop-shadow-lg">{emoji}</span>
          ))}
        </div>
      )}

      {/* Hand raised */}
      {participant.handRaised && (
        <div className="absolute top-3 left-3 bg-amber-500/90 rounded-full p-1.5 animate-pulse z-10">
          <Hand className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Screen sharing badge */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Monitor className="h-3 w-3" /> Compartiendo pantalla
          </Badge>
        </div>
      )}

      {/* Bottom bar — name, mic, connection quality */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-1.5 bg-[hsl(0_0%_0%/0.6)] backdrop-blur-sm rounded-md px-2 py-1">
          <span className="text-xs font-medium text-[hsl(0_0%_96%)]">
            {participant.isLocal ? "Tú" : participant.name}
          </span>
          {participant.isMuted && <MicOff className="h-3 w-3 text-destructive" />}
          <ConnectionIndicator quality={participant.connectionQuality} />
        </div>
      </div>
    </div>
  );
});

export default ParticipantTile;
