import { Phone, PhoneOff, Video } from "lucide-react";
import type { Call } from "@/hooks/useVideoCall";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  call: Call;
  onAccept: () => void;
  onDecline: () => void;
}

export default function IncomingCallModal({ call, onAccept, onDecline }: Props) {
  const { t } = useLanguage();
  const isAudio = call.call_type === "audio";
  const isGroup = call.is_group === true;
  const isOngoing = call.call_status === "accepted";
  const CallIcon = isAudio ? Phone : Video;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="vidrio vidrio-glow sube rounded-[20px] border border-border/60 p-8 flex flex-col items-center gap-6 w-80">
        {/* Avatar ring */}
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
            <CallIcon className="h-10 w-10 text-primary" />
          </div>
          {/* Pulsing ring */}
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        </div>

        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            {t(
              isOngoing
                ? (isGroup
                    ? (isAudio ? "messenger.incoming.enCursoGrupoAudio" : "messenger.incoming.enCursoGrupoVideo")
                    : (isAudio ? "messenger.incoming.enCursoAudio" : "messenger.incoming.enCursoVideo"))
                : (isGroup
                    ? (isAudio ? "messenger.incoming.entranteGrupoAudio" : "messenger.incoming.entranteGrupoVideo")
                    : (isAudio ? "messenger.incoming.entranteAudio" : "messenger.incoming.entranteVideo")),
            )}
          </p>
          <p className="text-xl font-semibold text-foreground">{call.caller_name ?? t("messenger.incoming.desconocido")}</p>
          {/* En grupo: en qué chat es la llamada. */}
          {isGroup && call.titulo && call.titulo !== call.caller_name && (
            <p className="text-xs text-muted-foreground truncate max-w-[16rem]">{call.titulo}</p>
          )}
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
            <span className="text-xs text-muted-foreground">{t("messenger.incoming.rechazar")}</span>
          </button>

          {/* Accept */}
          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="h-14 w-14 rounded-full bg-success flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Phone className="h-6 w-6 text-success-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{isOngoing ? t("messenger.incoming.unirse") : t("messenger.incoming.aceptar")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
