// Los minutos de gracia en la barra de Cowork, al lado del reloj (Alvaro, 16/11/2026).
// La persona ve cuánto le queda sin pantalla y sin cámara, y al tocar, cuánto se
// conectó, cuánto se le paga y cuánto se le descuenta. Ver lib/gracia.ts.
import { Hourglass } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { useMiGracia } from "@/hooks/useGracia";
import { formatoMinutos, resumenGracia, tonoGracia, type GraciaTurno, type ResumenGracia, type UsoGracia } from "@/lib/gracia";

const TONO_PILDORA = {
  bien: "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground",
  poca: "border-warning/30 bg-warning/10 text-warning",
  descuento: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

export default function GraciaCowork({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  const { gracia } = useMiGracia();
  if (!gracia || !gracia.inicio) return null; // sin turno, admin o exonerado: no se muestra
  return <PildoraGracia gracia={gracia} compacto={compacto} className={className} />;
}

/** La píldora con su detalle, sin leer la base (la usa también el banco de pruebas). */
export function PildoraGracia({ gracia, compacto = false, className, abierta }: { gracia: GraciaTurno; compacto?: boolean; className?: string; abierta?: boolean }) {
  const { t } = useLanguage();
  const r = resumenGracia(gracia);
  const tono = tonoGracia(r);
  const texto = r.descuento > 0
    ? t(compacto ? "cowork.gracia.descuentoCorto" : "cowork.gracia.descuento", { d: formatoMinutos(r.descuento) })
    : compacto
    ? t("cowork.gracia.quedanCorto", { p: r.pantalla.queda, c: r.camara.queda })
    : t("cowork.gracia.quedan", { p: r.pantalla.queda, c: r.camara.queda });

  return (
    <Popover defaultOpen={abierta}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("cowork.gracia.abrir")}
          title={t("cowork.gracia.abrir")}
          data-testid="gracia-cowork"
          data-tono={tono}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7 text-[11px] font-medium tabular-nums shrink-0 transition-colors",
            TONO_PILDORA[tono],
            className,
          )}
        >
          <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{texto}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-4">
        <DetalleGracia
          r={r}
          gp={(gracia.gracia_pantalla_min ?? 0) - (gracia.extra_pantalla_min ?? 0)}
          gc={(gracia.gracia_camara_min ?? 0) - (gracia.extra_camara_min ?? 0)}
        />
      </PopoverContent>
    </Popover>
  );
}

function DetalleGracia({ r, gp, gc }: { r: ResumenGracia; gp: number; gc: number }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-sm font-semibold tracking-tight">{t("cowork.gracia.titulo")}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("cowork.gracia.regla", { gp, gc })}
        </p>
        {r.ensayo && (
          <span className="mt-1 inline-flex w-fit items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            {t("cowork.gracia.ensayo")}
          </span>
        )}
      </div>

      <BarraGracia etiqueta={t("cowork.gracia.sinPantalla")} uso={r.pantalla} />
      <BarraGracia etiqueta={t("cowork.gracia.sinCamara")} uso={r.camara} />

      <dl className="grid grid-cols-2 gap-2">
        <Cifra etiqueta={t("cowork.gracia.conectado")} valor={formatoMinutos(r.conectado)} />
        <Cifra etiqueta={t("cowork.gracia.pausa")} valor={formatoMinutos(r.pausa)} />
        <Cifra etiqueta={t("cowork.gracia.aPagar")} valor={formatoMinutos(r.aPagar)} tono="text-success" />
        <Cifra etiqueta={t("cowork.gracia.descontado")} valor={formatoMinutos(r.descuento)} tono={r.descuento > 0 ? "text-destructive" : undefined} />
      </dl>

      {r.devueltos > 0 && <p className="text-xs text-foreground/80">{t("cowork.gracia.devueltos", { n: r.devueltos })}</p>}
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t("cowork.gracia.correo")} {t("cowork.gracia.ayuda")}</p>
    </div>
  );
}

function BarraGracia({ etiqueta, uso }: { etiqueta: string; uso: UsoGracia }) {
  const { t } = useLanguage();
  const pct = uso.gracia > 0 ? Math.min(100, (uso.usados / uso.gracia) * 100) : 100;
  const color = uso.exceso > 0 ? "bg-destructive" : uso.queda <= 5 ? "bg-warning" : "bg-primary/70";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-foreground/90">{etiqueta}</span>
        <span className={cn("tabular-nums font-medium", uso.exceso > 0 ? "text-destructive" : "text-muted-foreground")}>
          {t("cowork.gracia.deGracia", { u: uso.usados, g: uso.gracia })}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
      </div>
      {uso.agotada && uso.gracia > 0 && <span className="text-[11px] text-destructive">{t("cowork.gracia.agotada")}</span>}
    </div>
  );
}

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("font-display text-sm font-semibold tabular-nums", tono)}>{valor}</dd>
    </div>
  );
}
