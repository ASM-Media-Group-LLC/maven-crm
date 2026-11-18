// Lo que quien llama necesita saber (Alvaro, 18/11/2026): a quién le está
// sonando, quién rechazó y quién no contestó. Antes la pestaña no escuchaba
// nada de eso y uno se quedaba solo en la sala, esperando.
import { useEffect, useRef } from "react";
import { PhoneMissed, PhoneOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import type { Invitado } from "@/hooks/useInvitadosDeLaLlamada";
import { asegurarLlamada, estaViva, invitarALaLlamada, type LlamadaViva } from "@/lib/llamadaInvitar";

interface Props {
  roomName: string;
  uid: string;
  llamada: LlamadaViva | null;
  invitados: Invitado[];
  alColgar: () => void;
  alReintentar: () => void;
}

export default function AvisoDeInvitados({ roomName, uid, llamada, invitados, alColgar, alReintentar }: Props) {
  const { t } = useLanguage();
  const avisados = useRef(new Set<string>());

  const otros = invitados.filter((i) => i.user_id !== uid);
  const sonando = otros.filter((i) => i.status === "ringing");
  const nadieContesto =
    otros.length > 0 && otros.every((i) => i.status === "declined" || i.status === "missed");

  // Un aviso corto por cada «rechazó» / «no contestó», una sola vez.
  useEffect(() => {
    for (const i of otros) {
      if (i.status !== "declined" && i.status !== "missed") continue;
      const clave = `${i.user_id}:${i.status}`;
      if (avisados.current.has(clave)) continue;
      avisados.current.add(clave);
      if (nadieContesto) continue; // lo dice la tarjeta grande
      toast(t(i.status === "declined" ? "messenger.enLlamada.invitados.rechazo" : "messenger.enLlamada.invitados.noContesto", { name: i.nombre || "?" }));
    }
  }, [otros, nadieContesto, t]);

  if (nadieContesto && llamada) {
    const unoSolo = otros.length === 1;
    const rechazo = otros.every((i) => i.status === "declined");
    const nombre = otros[0]?.nombre || "?";
    return (
      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
        <div className="vidrio vidrio-glow sube pointer-events-auto w-full max-w-sm rounded-[20px] border border-border/60 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
            {rechazo ? <PhoneOff className="h-5 w-5 text-destructive" /> : <PhoneMissed className="h-5 w-5 text-destructive" />}
          </div>
          <p className="text-base font-semibold">
            {unoSolo
              ? t(rechazo ? "messenger.enLlamada.invitados.rechazoTitulo" : "messenger.enLlamada.invitados.noContestoTitulo", { name: nombre })
              : t("messenger.enLlamada.invitados.nadieTitulo")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("messenger.enLlamada.invitados.queHacer")}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={async () => {
                avisados.current.clear();
                try {
                  // Si la llamada ya se cerró (1 a 1 rechazado), se abre otra en la misma sala.
                  const viva = estaViva(llamada)
                    ? llamada
                    : await asegurarLlamada(roomName, uid, llamada.call_type === "audio" ? "audio" : "video");
                  await invitarALaLlamada(viva, uid, otros.map((i) => i.user_id));
                  alReintentar();
                } catch {
                  toast.error(t("messenger.enLlamada.agregar.error"));
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-success-foreground"
            >
              <RotateCcw className="h-4 w-4" /> {t("messenger.enLlamada.invitados.volverALlamar")}
            </button>
            <button
              type="button"
              onClick={alColgar}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 px-4 py-2 text-sm font-medium"
            >
              {t("messenger.enLlamada.invitados.cerrar")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!sonando.length) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-30 -translate-x-1/2">
      <div className="vidrio pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 px-4 py-1.5 text-xs">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
        {t("messenger.enLlamada.invitados.sonandoA", { names: sonando.map((i) => i.nombre || "?").join(", ") })}
      </div>
    </div>
  );
}
