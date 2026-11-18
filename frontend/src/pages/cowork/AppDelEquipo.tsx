import { useState } from "react";
import { ChevronRight, CircleHelp, Globe, Link2, MessageCircle, MonitorCheck, Smartphone, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import type { MediaState } from "@/hooks/useCoworkMediaPresence";
import type { TranslationKey } from "@/lib/i18n";
import { adopcionDe, resumenAdopcion, type AdopcionApp } from "@/lib/coworkSoloApp";
import { RUTA_GUIA_APP } from "@/lib/guiaApp";
import { cn } from "@/lib/utils";

// ¿QUIÉN YA TIENE LA APP? (Alvaro, 18/11/2026). Desde el viernes 20/11 Cowork en
// el computador va solo en la app de Maven. El supervisor ve, de la gente que
// está en sus salas, quién ya trabaja con la app y quién sigue en el navegador,
// para empujarlos uno por uno. El dato llega por la presencia de Cowork
// (enApp/equipo, lo publica cada Maven solo). Un Maven de antes no lo dice y
// sale «sin dato», nunca como «en el navegador».

const MARCA: Record<AdopcionApp, { icono: LucideIcon; clase: string; texto: TranslationKey }> = {
  app: { icono: MonitorCheck, clase: "text-success", texto: "cowork.host.app.estado.app" },
  navegador: { icono: Globe, clase: "text-warning", texto: "cowork.host.app.estado.navegador" },
  celular: { icono: Smartphone, clase: "text-muted-foreground/70", texto: "cowork.host.app.estado.celular" },
  sinDato: { icono: CircleHelp, clase: "text-muted-foreground/50", texto: "cowork.host.app.estado.sinDato" },
};

const NOMBRE_EQUIPO: Partial<Record<string, string>> = { mac: "Mac", windows: "Windows", linux: "Linux" };

/** La marquita junto al nombre: app (verde), navegador (ámbar), celular o sin dato (gris). */
export function MarcaApp({ estado }: { estado: MediaState | undefined }) {
  const { t } = useLanguage();
  const a = adopcionDe(estado);
  const m = MARCA[a];
  const equipo = estado?.equipo ? NOMBRE_EQUIPO[estado.equipo] : undefined;
  const titulo = a === "app" && equipo ? `${t(m.texto)} · ${equipo}` : t(m.texto);
  return (
    <span role="img" aria-label={titulo} title={titulo} data-adopcion={a} className="inline-flex shrink-0">
      <m.icono className={cn("h-3 w-3", m.clase)} aria-hidden />
    </span>
  );
}

interface ResumenProps {
  /** La gente que está en las salas ahora. */
  uids: string[];
  mediaStates: Record<string, MediaState | undefined>;
  nombreDe: (uid: string) => string;
  avatares: Record<string, { src?: string | null; seed?: string | null } | undefined>;
  onEscribir: (uid: string) => void;
}

/** La tarjeta del panel: «Con la app 5/9», la barrita y quién falta. */
export function ResumenAppDelEquipo({ uids, mediaStates, nombreDe, avatares, onEscribir }: ResumenProps) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const r = resumenAdopcion(uids, mediaStates);
  // Nadie en un computador (vacío o todos en el celular): nada que empujar.
  if (r.total === 0) return null;

  const faltan = r.navegador.length + r.sinDato.length;
  const porcentaje = Math.round((r.conApp.length / r.total) * 100);
  const detalle = [
    r.navegador.length ? t("cowork.host.app.enNavegadorN", { n: r.navegador.length }) : null,
    r.sinDato.length ? t("cowork.host.app.sinDatoN", { n: r.sinDato.length }) : null,
    r.celular.length ? t("cowork.host.app.celularN", { n: r.celular.length }) : null,
  ].filter(Boolean).join(" · ");
  const porNombre = (a: string, b: string) => nombreDe(a).localeCompare(nombreDe(b));

  const copiarGuia = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${RUTA_GUIA_APP}`);
      toast.success(t("cowork.host.app.guiaCopiada"));
    } catch {
      toast.error(t("cowork.host.app.copiarError"));
    }
  };

  const grupo = (titulo: TranslationKey, ids: string[]) => ids.length > 0 && (
    <div>
      <p className="px-1 text-[11px] font-medium text-muted-foreground">{t(titulo)}</p>
      <ul className="mt-1 space-y-1">
        {[...ids].sort(porNombre).map((uid) => (
          <li key={uid} className="flex items-center gap-2 rounded-xl bg-muted/30 px-2 py-1">
            <UserAvatar name={nombreDe(uid)} src={avatares[uid]?.src} seed={avatares[uid]?.seed} size="sm" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{nombreDe(uid)}</span>
            <MarcaApp estado={mediaStates[uid]} />
            <button
              type="button"
              onClick={() => onEscribir(uid)}
              title={t("cowork.host.messageOnMessenger")}
              aria-label={t("cowork.host.messageOnMessenger")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="mx-3 mt-3 space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3" aria-labelledby="hub-app-del-equipo">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-success/15 text-success"><MonitorCheck className="h-3.5 w-3.5" /></span>
        <h3 id="hub-app-del-equipo" className="text-xs font-semibold text-foreground">{t("cowork.host.app.titulo")}</h3>
        <button
          type="button"
          onClick={() => void copiarGuia()}
          title={t("cowork.host.app.copiarGuia")}
          aria-label={t("cowork.host.app.copiarGuia")}
          className="ml-auto grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="rounded-xl bg-muted/30 px-2.5 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{t("cowork.host.app.conApp")}</span>
          <span className="font-display text-base font-semibold tabular-nums text-foreground" data-testid="app-del-equipo-cuenta">
            {r.conApp.length}<span className="text-muted-foreground">/{r.total}</span>
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t("cowork.host.app.conApp")}
          aria-valuemin={0}
          aria-valuemax={r.total}
          aria-valuenow={r.conApp.length}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10"
        >
          <span className="block h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${porcentaje}%` }} />
        </div>
        {faltan === 0
          ? <p className="mt-1.5 text-[10px] text-success">{t("cowork.host.app.todos")}</p>
          : detalle && <p className="mt-1.5 text-[10px] text-muted-foreground">{detalle}</p>}
      </div>

      {faltan > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex w-full items-center gap-1 rounded-lg px-1 py-0.5 text-left text-[11px] font-medium text-primary hover:underline"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", abierto && "rotate-90")} />
          {abierto ? t("cowork.host.app.ocultarFaltan") : t("cowork.host.app.verFaltan", { n: faltan })}
        </button>
      )}
      {abierto && faltan > 0 && (
        <div className="space-y-2">
          {grupo("cowork.host.app.grupoNavegador", r.navegador)}
          {grupo("cowork.host.app.grupoSinDato", r.sinDato)}
        </div>
      )}
    </section>
  );
}
