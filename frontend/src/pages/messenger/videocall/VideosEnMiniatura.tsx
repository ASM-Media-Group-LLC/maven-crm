import { useEffect, useState } from "react";
import type { Room } from "livekit-client";
import type { LKParticipant } from "@/hooks/useLiveKit";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import ParticipantTile from "./ParticipantTile";

const ESPERA_VOZ_MS = 750;

export default function VideosEnMiniatura({ participantes, vozActiva, room, audioOutputId }: {
  participantes: LKParticipant[];
  vozActiva: string | null;
  room: Room | null;
  audioOutputId?: string;
}) {
  const { t } = useLanguage();
  const camaras = participantes.filter((p) => !p.isScreenSharing);
  const remotos = camaras.filter((p) => !p.isLocal);
  const yo = camaras.find((p) => p.isLocal);
  const pantalla = participantes.find((p) => !p.isLocal && p.isScreenSharing);
  const candidato = remotos.length > 1 && remotos.some((p) => p.identity === vozActiva)
    ? vozActiva
    : null;
  const [vozDestacada, setVozDestacada] = useState<string | null>(null);

  useEffect(() => {
    // Con un ruido corto o una pausa, se conserva la cámara que ya estaba.
    if (!candidato || candidato === vozDestacada) return;
    const espera = window.setTimeout(() => setVozDestacada(candidato), ESPERA_VOZ_MS);
    return () => window.clearTimeout(espera);
  }, [candidato, vozDestacada]);

  const principal = pantalla ?? remotos.find((p) => p.identity === vozDestacada) ?? remotos[0];
  if (!principal) return null;
  // Durante una presentación se ve a quien presenta; la cámara propia no
  // debe tapar la pantalla ni sustituir la explicación de la otra persona.
  const superpuesta = pantalla ? camaras.find((p) => p.identity === pantalla.identity) : yo;
  const otros = pantalla ? [] : remotos.filter((p) => p.identity !== principal.identity);
  const resto = Math.max(0, otros.length - 3);
  const hayFila = otros.length > 0;
  // Se mantienen las mismas claves cuando una cámara pasa de la fila al
  // primer plano, de modo que su pista sigue adjunta al mismo elemento.
  const visibles = [principal, ...otros.slice(0, 3), ...(superpuesta ? [superpuesta] : [])];

  return (
    <div
      className={cn("relative grid h-full grid-cols-4 gap-1.5", hayFila ? "grid-rows-[minmax(0,1fr)_3.5rem]" : "grid-rows-[minmax(0,1fr)]")}
      data-testid="video-miniatura-llamada"
    >
      {visibles.map((persona) => (
        <div
          key={persona.sid}
          className={persona === principal
            ? "col-span-full min-h-0"
            : persona === superpuesta
              ? cn("absolute right-2 z-10 h-[28%] w-[28%] min-h-12 min-w-16", hayFila ? "bottom-[4.25rem]" : "bottom-2")
              : "min-h-0 min-w-0"
          }
          data-testid={persona === principal ? "video-miniatura-principal" : undefined}
        >
          <ParticipantTile
            compact
            large={persona === principal}
            participant={persona}
            room={room}
            className="h-full"
            preferredAudioOutputDeviceId={audioOutputId}
          />
        </div>
      ))}
      {resto > 0 && (
        <span
          className="grid place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground"
          aria-label={`${resto} ${t("messenger.call.participantes")}`}
        >
          +{resto}
        </span>
      )}
    </div>
  );
}
