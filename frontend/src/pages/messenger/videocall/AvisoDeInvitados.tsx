// Lo que quien llama necesita saber (Alvaro, 18/11/2026): a quién le está
// sonando, quién rechazó y quién no contestó. Antes la pestaña no escuchaba
// nada de eso y uno se quedaba solo en la sala, esperando.
import { useEffect, useRef, useState } from "react";
import { Phone, PhoneMissed, PhoneOff, RotateCcw, Video } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { ESPERA, sonar } from "@/lib/tonosDeLlamada";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import type { Invitado } from "@/hooks/useInvitadosDeLaLlamada";
import { asegurarLlamada, estaViva, invitarALaLlamada, type LlamadaViva } from "@/lib/llamadaInvitar";

/** Cuánto se espera a que el Maven del otro diga «me está sonando». */
export const ESPERA_ACUSE_MS = 4_000;

type Traducir = (clave: string, vars?: Record<string, string | number>) => string;

/** La línea de abajo del nombre: dónde le está sonando. */
export function dondeSuena(sonando: Invitado[], yaEsperamos: boolean, t: Traducir): string {
  const enMaven = sonando.filter((i) => i.enMaven).length;
  if (sonando.length === 1) {
    if (enMaven === 1) return t("messenger.enLlamada.llamando.enSuMaven");
    return yaEsperamos ? t("messenger.enLlamada.llamando.soloNotificacion") : t("messenger.enLlamada.llamando.sonando");
  }
  if (!yaEsperamos && enMaven === 0) return t("messenger.enLlamada.llamando.sonando");
  return t("messenger.enLlamada.llamando.grupoEnMaven", { n: enMaven, total: sonando.length });
}

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
  // LLAMANDO, COMO EN SKYPE (Alvaro, 18/11/2026: «no suena que estoy llamando…
  // está todo abultado arriba»). Mientras le suena a alguien y nadie entró
  // todavía, quien llama ve a quién llama en grande y oye el tono de espera.
  const alguienEntro = otros.some((i) => i.status === "accepted");
  const llamando = sonando.length > 0 && !alguienEntro && !!llamada && estaViva(llamada);
  useEffect(() => {
    if (!llamando) return;
    return sonar(ESPERA);
  }, [llamando]);
  // ¿Dónde le suena? (Alvaro, 18/11/2026: «no sé si le suena o no»). Si su Maven
  // mostró el cartel, lo anota (sonando_en_maven_at). Si a los pocos segundos
  // no lo anotó, no tiene Maven abierto: solo le llegó la notificación.
  const [sinRespuestaDeMaven, setSinRespuestaDeMaven] = useState(false);
  useEffect(() => {
    if (!llamando) { setSinRespuestaDeMaven(false); return; }
    const id = window.setTimeout(() => setSinRespuestaDeMaven(true), ESPERA_ACUSE_MS);
    return () => window.clearTimeout(id);
  }, [llamando]);

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

  if (llamando) {
    const primero = sonando[0];
    const esVoz = llamada?.call_type === "audio";
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/90 p-6 backdrop-blur-xl">
        <div className="sube flex w-full max-w-sm flex-col items-center text-center">
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            {esVoz ? <Phone className="h-3 w-3" /> : <Video className="h-3 w-3" />}
            {t(esVoz ? "messenger.enLlamada.llamando.voz" : "messenger.enLlamada.llamando.video")}
          </div>
          <div className="relative mt-10 mb-8">
            {/* Las ondas que salen de la foto mientras suena. */}
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping motion-reduce:animate-none" />
            <span className="absolute -inset-3 rounded-full border border-primary/25" />
            <span className="absolute -inset-7 rounded-full border border-primary/10" />
            <UserAvatar name={primero.nombre || "?"} src={primero.foto} seed={primero.seed} size="xl" className="relative h-28 w-28 text-3xl" />
          </div>
          <p className="text-xl font-semibold text-foreground [text-wrap:balance]">
            {sonando.length > 1
              ? t("messenger.enLlamada.llamando.varios", { name: primero.nombre || "?", n: sonando.length - 1 })
              : t("messenger.enLlamada.llamando.uno", { name: primero.nombre || "?" })}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground" aria-live="polite">
            {dondeSuena(sonando, sinRespuestaDeMaven, t)}
          </p>
          {sonando.length > 1 && (
            <div className="mt-4 flex -space-x-2">
              {sonando.slice(1, 6).map((i) => (
                <UserAvatar key={i.user_id} name={i.nombre || "?"} src={i.foto} seed={i.seed} size="sm" className="ring-2 ring-background" />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={alColgar}
            className="mt-12 flex flex-col items-center gap-2 text-xs text-muted-foreground"
            aria-label={t("messenger.enLlamada.llamando.colgar")}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-transform hover:scale-105">
              <PhoneOff className="h-6 w-6" />
            </span>
            {t("messenger.enLlamada.llamando.colgar")}
          </button>
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
