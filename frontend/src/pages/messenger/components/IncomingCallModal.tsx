import { Phone, PhoneOff, Video } from "lucide-react";
import type { Call } from "@/hooks/useVideoCall";

interface Props {
  call: Call;
  onAccept: () => void;
  onDecline: () => void;
}

export default function IncomingCallModal({ call, onAccept, onDecline }: Props) {
  const isAudio = call.call_type === "audio";
  const isGroup = call.is_group === true;
  const isOngoing = call.call_status === "accepted";
  const CallIcon = isAudio ? Phone : Video;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-6 w-80 animate-in zoom-in-95">
        {/* Avatar ring */}
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
            <CallIcon className="h-10 w-10 text-primary" />
          </div>
          {/* Pulsing ring */}
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        </div>

        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {isOngoing ? "En curso" : "Entrante"} · {isGroup ? "grupo " : ""}{isAudio ? "audio" : "video"}
          </p>
          <p className="text-xl font-semibold text-foreground">{call.caller_name ?? "Desconocido"}</p>
        </div>

        <div className="flex gap-6">
          {/* Decline */}
          <button
            onClick={onDecline}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="h-14 w-14 rounded-full bg-destructive flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <PhoneOff className="h-6 w-6 text-destructive-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">Rechazar</span>
          </button>

          {/* Accept */}
          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="h-14 w-14 rounded-full bg-success flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Phone className="h-6 w-6 text-success-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{isOngoing ? "Unirse" : "Aceptar"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
