import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import type { Call } from "@/hooks/useVideoCall";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { vibrarMientrasSuena } from "@/lib/tonosDeLlamada";
import { RUTA_DESCARGAR_CON_GUIA } from "@/lib/guiaApp";

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
  /** Llamadas solo en la app (18/11/2026): en el navegador del computador,
   *  «Aceptar» abre la app y se ofrece descargarla. */
  enLaApp?: boolean;
}

export default function IncomingCallModal({ call, onAccept, onDecline, enLaApp = false }: Props) {
  const { t } = useLanguage();
  const isAudio = call.call_type === "audio";
  const isGroup = call.is_group === true;
  const isOngoing = call.call_status === "accepted";
  const CallIcon = isAudio ? Phone : Video;
  const perfil = useFotoDe(call.caller_id);
  // En el teléfono además vibra mientras suena (el timbre lo pone CallProvider).
  useEffect(() => vibrarMientrasSuena(), []);

  // Tarjeta arriba a la derecha (Alvaro, 26/11/2026): avisa con foto, nombre y
  // timbre SIN tapar lo que estás haciendo. Antes era un velo oscuro en toda la
  // pantalla. En el teléfono va arriba, a lo ancho.
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={call.caller_name ?? t("messenger.incoming.desconocido")}
      data-llamada-entrante
      className="vidrio vidrio-glow sube fixed inset-x-2 top-2 z-[200] rounded-2xl border border-border/60 p-3 shadow-2xl sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[340px]"
    >
      <div className="flex items-center gap-3">
        {/* Quién llama: su foto, con las ondas del timbre y el tipo de llamada. */}
        <div className="relative shrink-0">
          <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping motion-reduce:animate-none" />
          <UserAvatar name={call.caller_name ?? "?"} src={perfil?.foto} seed={perfil?.seed} size="lg" className="relative h-12 w-12 text-base" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
            <CallIcon className="h-2.5 w-2.5" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{call.caller_name ?? t("messenger.incoming.desconocido")}</p>
          <p className="truncate text-xs text-muted-foreground">
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
          {/* En grupo: en qué chat es la llamada. */}
          {isGroup && call.titulo && call.titulo !== call.caller_name && (
            <p className="truncate text-[11px] text-muted-foreground/80">{call.titulo}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={onDecline}
            title={t("messenger.incoming.rechazar")}
            aria-label={t("messenger.incoming.rechazar")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive shadow-lg transition-transform hover:scale-105"
          >
            <PhoneOff className="h-4 w-4 text-destructive-foreground" />
          </button>
          <button
            onClick={onAccept}
            title={enLaApp
              ? t(isOngoing ? "messenger.incoming.unirseEnApp" : "messenger.incoming.contestarEnApp")
              : t(isOngoing ? "messenger.incoming.unirse" : "messenger.incoming.aceptar")}
            aria-label={enLaApp
              ? t(isOngoing ? "messenger.incoming.unirseEnApp" : "messenger.incoming.contestarEnApp")
              : t(isOngoing ? "messenger.incoming.unirse" : "messenger.incoming.aceptar")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-success shadow-lg transition-transform hover:scale-105"
          >
            <Phone className="h-4 w-4 text-success-foreground" />
          </button>
        </div>
      </div>

      {enLaApp && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
          <p className="text-[11px] text-muted-foreground">{t("messenger.incoming.soloEnApp")}</p>
          <a href={RUTA_DESCARGAR_CON_GUIA} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] font-medium text-primary underline-offset-2 hover:underline">
            {t("messenger.incoming.descargarApp")}
          </a>
        </div>
      )}
    </div>
  );
}
