import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { RoomEvent, type Room } from "livekit-client";
import { useLanguage } from "@/hooks/useLanguage";

/** Gesto explícito en el documento donde se ve la llamada, incluida la miniatura. */
export default function ReactivarAudioLlamada({ room }: { room: Room | null }) {
  const { t } = useLanguage();
  const [bloqueado, setBloqueado] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    const actualizar = () => {
      const sigueBloqueado = room?.canPlaybackAudio === false;
      setBloqueado(sigueBloqueado);
      if (!sigueBloqueado) setFallo(false);
    };
    actualizar();
    if (!room) return;
    room.on(RoomEvent.AudioPlaybackStatusChanged, actualizar);
    return () => { room.off(RoomEvent.AudioPlaybackStatusChanged, actualizar); };
  }, [room]);

  if (!room || !bloqueado) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 bg-warning/10 px-2 py-1 text-xs text-warning">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-2.5 py-1 font-semibold hover:bg-warning/30"
        onClick={() => {
          setFallo(false);
          // Arranca dentro del clic para aprovechar el permiso de reproducción.
          void room.startAudio().catch(() => setFallo(true));
        }}
      >
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
        {t("messenger.callView.reactivarAudio")}
      </button>
      {fallo && <p role="status">{t("messenger.callView.audioSigueBloqueado")}</p>}
    </div>
  );
}
