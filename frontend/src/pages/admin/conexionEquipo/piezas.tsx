import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { inicial } from "@/lib/conexionEquipo/resumen";

// Piezas de Conectar tu plataforma, con el lenguaje de Costos (vidrio, un solo
// acento, cifras en cuadros): cada sección dice en una línea para qué sirve.

export function Bloque({ id, icono: Icono, titulo, para, derecha, children }: {
  id?: string; icono: LucideIcon; titulo: string; para: string; derecha?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} aria-label={titulo} className="vidrio sube flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Icono className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">{titulo}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{para}</p>
          </div>
        </div>
        {derecha}
      </header>
      {children}
    </section>
  );
}

/** Un fallo dicho como fallo, con Reintentar. Nunca «no hay nada». */
export function Fallo({ onReintentar, detalle }: { onReintentar: () => void; detalle?: string | null }) {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">
        {t("conexionEquipo.fallo")}
        {detalle && <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{detalle}</span>}
      </span>
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={onReintentar}>
        <RefreshCw className="h-3.5 w-3.5" />{t("common.retry")}
      </Button>
    </div>
  );
}

export const Cargando = () => (
  <div className="flex items-center justify-center py-6" aria-busy="true">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

/** Una cifra en su cuadro: el número grande y qué es, debajo. */
export function Cifra({ valor, etiqueta, tono = "normal" }: {
  valor: ReactNode; etiqueta: string; tono?: "normal" | "bien" | "ojo" | "mal" | "apagado";
}) {
  const color = {
    normal: "text-foreground",
    bien: "text-success",
    ojo: "text-warning",
    mal: "text-destructive",
    apagado: "text-muted-foreground",
  }[tono];
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-panel border border-border/50 bg-background/40 p-3">
      <span className={cn("font-display text-2xl font-semibold leading-none tabular-nums", color)}>{valor}</span>
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
    </div>
  );
}

/** El avatar de UNA letra. */
export function Letra({ de, className }: { de: string | null | undefined; className?: string }) {
  return (
    <span aria-hidden className={cn(
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/60 text-sm font-semibold text-foreground/80",
      className,
    )}>
      {inicial(de)}
    </span>
  );
}

/** Un aviso dentro de una sección: bien (verde), ojo (amarillo) o informativo. */
export function Nota({ tono = "info", children }: { tono?: "bien" | "ojo" | "info"; children: ReactNode }) {
  const Icono = tono === "bien" ? CheckCircle2 : tono === "ojo" ? AlertTriangle : Info;
  return (
    <div role="status" className={cn(
      "flex items-start gap-2.5 rounded-panel border p-3 text-sm",
      tono === "bien" && "border-success/30 bg-success/5",
      tono === "ojo" && "border-warning/40 bg-warning/5",
      tono === "info" && "border-border/60 bg-background/40",
    )}>
      <Icono className={cn("mt-0.5 h-4 w-4 shrink-0",
        tono === "bien" ? "text-success" : tono === "ojo" ? "text-warning" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

/** Una etiqueta chica (rol, equipo, jefe…). */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}
