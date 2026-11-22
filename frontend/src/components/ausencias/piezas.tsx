import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { TranslationKey } from "@/lib/i18n";
import { aFecha } from "@/lib/ausencias";

// Piezas chicas que comparten Mis días y Asistencia.

export const CAMPO = "h-9 rounded-lg border border-input bg-background/50 px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

/** Un fallo es un fallo: se dice y se ofrece reintentar (nunca «no hay nada»). */
export function Fallo({ texto, reintentar }: { texto: TranslationKey; reintentar: () => void }) {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">{t(texto)}</span>
      <Button variant="outline" size="sm" onClick={reintentar}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("aus.reintentar")}</Button>
    </div>
  );
}

/** «vie 12 dic» (con día de la semana si se pide). */
export function useFechaCorta() {
  const f = useFormato();
  return (s: string, conDia = false) => aFecha(s).toLocaleDateString(f.intl(), {
    day: "numeric", month: "short", timeZone: "UTC", ...(conDia ? { weekday: "short" as const } : {}),
  });
}

/** «12 dic», «12 – 15 dic», «12 dic, 08:00–10:00». */
export function useRango() {
  const { t } = useLanguage();
  const f = useFormato();
  const corto = (s: string) => aFecha(s).toLocaleDateString(f.intl(), { day: "numeric", month: "short", timeZone: "UTC" });
  return (desde: string, hasta: string, hd?: string | null, hh?: string | null) => {
    if (hd && hh) return t("aus.rango.horas", { d: corto(desde), a: hd.slice(0, 5), b: hh.slice(0, 5) });
    if (desde === hasta) return t("aus.rango.unDia", { d: corto(desde) });
    return t("aus.rango.varios", { a: corto(desde), b: corto(hasta) });
  };
}

export function Pastilla({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}

/** Segmentos (pestañas chicas) con el estilo de Maven. */
export function Segmentos<K extends string>({ opciones, valor, onCambio }: {
  opciones: Array<[K, TranslationKey, number?]>; valor: K; onCambio: (k: K) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="inline-flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-xl bg-foreground/[0.045] p-1" role="tablist">
      {opciones.map(([k, lbl, n]) => (
        <button key={k} type="button" role="tab" aria-selected={valor === k} onClick={() => onCambio(k)}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${valor === k ? "bg-background/80 text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground"}`}>
          {t(lbl)}{n ? <span className="tabular-nums opacity-60">{n}</span> : null}
        </button>
      ))}
    </div>
  );
}
