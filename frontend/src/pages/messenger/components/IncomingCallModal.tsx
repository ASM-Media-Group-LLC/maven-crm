import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import type { Call } from "@/hooks/useVideoCall";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { vibrarMientrasSuena } from "@/lib/tonosDeLlamada";

/** La foto de quien llama (si no se puede leer, quedan sus iniciales). */
function useFotoDe(uid: string | null | undefined) {
  const [perfil, setPerfil] = useState<{ foto: string | null; seed: string | null } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    void supabase.from("profiles").select("avatar_url, avatar_seed").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (vivo && data) setPerfil({ foto: (data.avatar_url as string | null) ?? null, seed: (data.avatar_seed as string | null) ?? null });
      });
    return () => { vivo = false; };
  }, [uid]);
  return perfil;
}

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
  const perfil = useFotoDe(call.caller_id);
  // En el teléfono además vibra mientras suena (el timbre lo pone CallProvider).
  useEffect(() => vibrarMientrasSuena(), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="vidrio vidrio-glow sube rounded-[20px] border border-border/60 p-8 flex flex-col items-center gap-6 w-80">
        {/* Quién llama: su foto, con las ondas del timbre y el tipo de llamada. */}
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping motion-reduce:animate-none" />
          <span className="absolute -inset-3 rounded-full border border-primary/20" />
          <UserAvatar name={call.caller_name ?? "?"} src={perfil?.foto} seed={perfil?.seed} size="xl" className="relative h-24 w-24 text-2xl" />
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
            <CallIcon className="h-4 w-4" />
          </span>
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
