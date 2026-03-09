import { useEffect, useRef } from "react";
import { Track, Participant, Room } from "livekit-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MicOff, Hand, Monitor } from "lucide-react";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";
import { BackgroundEffect, BACKGROUND_TEMPLATES } from "./BackgroundSelector";

interface ParticipantTileProps {
  participant: LKParticipant;
  room: Room | null;
  large?: boolean;
  className?: string;
  backgroundEffect?: BackgroundEffect;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function ParticipantTile({ participant, room, large, className, backgroundEffect = "none" }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!room) return;

    const lkParticipant = participant.isLocal
      ? room.localParticipant
      : room.remoteParticipants.get(participant.identity);

    if (!lkParticipant) return;

    // Attach video
    const videoTrack = [...lkParticipant.videoTrackPublications.values()].find(
      (t) => t.source === (participant.isScreenSharing ? Track.Source.ScreenShare : Track.Source.Camera)
    );

    if (videoTrack?.track && videoRef.current) {
      videoTrack.track.attach(videoRef.current);
    }

    // Attach audio (remote only)
    if (!participant.isLocal) {
      const audioTrack = [...lkParticipant.audioTrackPublications.values()].find(
        (t) => t.source === Track.Source.Microphone
      );
      if (audioTrack?.track && audioRef.current) {
        audioTrack.track.attach(audioRef.current);
      }
    }

    return () => {
      if (videoTrack?.track && videoRef.current) {
        videoTrack.track.detach(videoRef.current);
      }
      if (!participant.isLocal) {
        const at = [...lkParticipant.audioTrackPublications.values()].find(
          (t) => t.source === Track.Source.Microphone
        );
        if (at?.track && audioRef.current) {
          at.track.detach(audioRef.current);
        }
      }
    };
  }, [room, participant]);

  const showVideo = !participant.isCameraOff || participant.isScreenSharing;

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden flex items-center justify-center h-full transition-all",
        participant.isSpeaking && "ring-2 ring-primary ring-offset-1 ring-offset-[hsl(240_10%_6%)]",
        className
      )}
      style={{ background: showVideo ? "hsl(240 6% 10%)" : "hsl(240 8% 12%)" }}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <Avatar className={cn("border-2 border-[hsl(0_0%_100%/0.1)]", large ? "h-24 w-24" : "h-16 w-16")}>
          <AvatarFallback
            className={cn("bg-primary/20 text-primary font-semibold", large ? "text-3xl" : "text-lg")}
          >
            {getInitials(participant.name)}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Audio element for remote participants */}
      {!participant.isLocal && <audio ref={audioRef} autoPlay />}

      {/* Reactions floating */}
      {participant.reactions.length > 0 && (
        <div className="absolute top-3 right-3 flex gap-1 animate-bounce">
          {participant.reactions.map((emoji, i) => (
            <span key={i} className="text-2xl drop-shadow-lg">
              {emoji}
            </span>
          ))}
        </div>
      )}

      {/* Hand raised */}
      {participant.handRaised && (
        <div className="absolute top-3 left-3 bg-amber-500/90 rounded-full p-1.5 animate-pulse">
          <Hand className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Screen sharing indicator */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Monitor className="h-3 w-3" /> Compartiendo pantalla
          </Badge>
        </div>
      )}

      {/* Bottom label */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 bg-[hsl(0_0%_0%/0.6)] backdrop-blur-sm rounded-md px-2 py-1">
          <span className="text-xs font-medium text-[hsl(0_0%_96%)]">
            {participant.isLocal ? "Tú" : participant.name}
          </span>
          {participant.isMuted && <MicOff className="h-3 w-3 text-destructive" />}
        </div>
      </div>
    </div>
  );
}
