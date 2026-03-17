import { useEffect, useRef, useState, useCallback } from "react";
import { Track, Room } from "livekit-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MicOff, Minimize2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelfViewPipProps {
  room: Room | null;
  name: string;
  isMuted: boolean;
  isCameraOff: boolean;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function SelfViewPip({ room, name, isMuted, isCameraOff }: SelfViewPipProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const attachedTrackRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Attach camera track (not screen share)
  useEffect(() => {
    if (!room || isCameraOff) {
      if (attachedTrackRef.current && videoRef.current) {
        try { attachedTrackRef.current.detach(videoRef.current); } catch {}
        attachedTrackRef.current = null;
      }
      return;
    }

    const localP = room.localParticipant;
    const camTrack = [...localP.videoTrackPublications.values()].find(
      (t) => t.source === Track.Source.Camera
    );

    if (camTrack?.track && videoRef.current) {
      if (attachedTrackRef.current !== camTrack.track) {
        if (attachedTrackRef.current) {
          try { attachedTrackRef.current.detach(videoRef.current); } catch {}
        }
        camTrack.track.attach(videoRef.current);
        attachedTrackRef.current = camTrack.track;
        videoRef.current.play?.().catch(() => {});
      }
    }

    return () => {
      if (attachedTrackRef.current && videoRef.current) {
        try { attachedTrackRef.current.detach(videoRef.current); } catch {}
        attachedTrackRef.current = null;
      }
    };
  }, [room, isCameraOff]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="absolute z-20 bottom-24 right-4 h-10 w-10 rounded-full bg-[hsl(220_3%_22%/0.9)] border border-[hsl(220_3%_30%)] backdrop-blur-sm flex items-center justify-center text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_28%)] transition-colors shadow-lg"
        title="Mostrar cámara"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-20 rounded-xl overflow-hidden shadow-2xl border border-[hsl(220_3%_30%/0.6)] cursor-grab active:cursor-grabbing select-none"
      style={{
        width: 180,
        height: 135,
        right: position.x,
        bottom: position.y + 80, // offset above controls bar
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Camera feed or avatar */}
      {!isCameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[hsl(220_3%_20%)] flex items-center justify-center">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-[hsl(220_50%_45%)] text-white font-medium text-sm">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {/* Minimize button */}
      <button
        onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-[hsl(220_3%_14%/0.7)] backdrop-blur-sm flex items-center justify-center text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_14%/0.9)] transition-colors z-10"
        title="Minimizar"
      >
        <Minimize2 className="h-3 w-3" />
      </button>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-2 py-1 bg-gradient-to-t from-black/50 to-transparent z-10">
        <span className="text-[10px] font-medium text-white truncate">Tú</span>
        {isMuted && (
          <div className="h-4 w-4 rounded-full bg-[hsl(0_72%_51%)] flex items-center justify-center shrink-0">
            <MicOff className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
