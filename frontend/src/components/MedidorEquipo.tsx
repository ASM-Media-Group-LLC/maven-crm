import { Cpu, Gauge, MemoryStick, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/hooks/useLanguage";
import { marcarDetalleAbierto, useMedidorEquipo } from "@/hooks/useMedidorEquipo";
import { escritorio } from "@/lib/escritorio";
import type { TranslationKey } from "@/lib/i18n";
import type { Cosa, Luz } from "@/lib/medidorEquipo";
import { cn } from "@/lib/utils";

// EL MEDIDOR DE LA APP (Alvaro, 18/11/2026): «que el app tenga un medidor de
// internet, de computadora y de memoria». Va en la barra de arriba, solo en la
// app de computador: tres iconitos con su color; al tocarlo, el detalle con los
// números y qué hacer si algo está en rojo. Lógica en lib/medidorEquipo.ts.

const COLOR: Record<Luz, string> = {
  verde: "text-success",
  amarillo: "text-warning",
  rojo: "text-destructive",
  sin_dato: "text-muted-foreground/60",
};
const BARRA: Record<Luz, string> = {
  verde: "bg-success",
  amarillo: "bg-warning",
  rojo: "bg-destructive",
  sin_dato: "bg-muted-foreground/40",
};
const ICONO: Record<Cosa, LucideIcon> = { internet: Wifi, computador: Cpu, memoria: MemoryStick };

function Fila({ cosa, luz, valor, detalle, lleno }: { cosa: Cosa; luz: Luz; valor: string; detalle: string; lleno: number }) {
  const { t } = useLanguage();
  const Icono = ICONO[cosa];
  return (
    <div className="grid gap-1.5 rounded-xl bg-foreground/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/[0.05]", COLOR[luz])}>
          <Icono className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-medium text-foreground">{t(`pwa.medidor.${cosa}` as TranslationKey)}</span>
        <span className={cn("font-display text-sm font-semibold tabular-nums", COLOR[luz])}>{valor}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
        <div className={cn("h-full rounded-full transition-all duration-500", BARRA[luz])} style={{ width: `${Math.max(4, Math.min(100, lleno))}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{detalle}</p>
      {(luz === "amarillo" || luz === "rojo") && (
        <p className={cn("text-xs", luz === "rojo" ? "text-destructive" : "text-warning")}>
          {t(`pwa.medidor.consejo.${cosa}.${luz}` as TranslationKey)}
        </p>
      )}
    </div>
  );
}

export function MedidorEquipo() {
  const { t } = useLanguage();
  const { muestra: m, luces } = useMedidorEquipo();
  if (!escritorio() || !m || !luces) return null;

  const usadoGb = m.equipo_gb != null && m.libre_gb != null ? Math.max(0, m.equipo_gb - m.libre_gb) : null;
  const internetValor = !m.en_linea ? t("pwa.medidor.sinConexion") : m.ping_ms != null ? `${m.ping_ms} ms` : "—";

  return (
    <Popover onOpenChange={marcarDetalleAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("pwa.medidor.titulo")}
          className="flex h-9 items-center gap-1.5 rounded-full border border-border/50 bg-foreground/[0.03] px-2.5 transition-colors hover:bg-foreground/[0.06]"
        >
          {(["internet", "computador", "memoria"] as Cosa[]).map((c) => {
            const Icono = ICONO[c];
            return <Icono key={c} className={cn("h-3.5 w-3.5", COLOR[luces[c]])} />;
          })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="vidrio w-80 rounded-[20px] border-border/60 p-3">
        <div className="mb-3 flex items-center gap-2 px-1">
          <Gauge className="h-4 w-4 text-primary" />
          <p className="flex-1 text-sm font-semibold text-foreground">{t("pwa.medidor.titulo")}</p>
          <span className="text-[11px] text-muted-foreground">{t("pwa.medidor.cada")}</span>
        </div>
        <div className="grid gap-2">
          <Fila
            cosa="internet"
            luz={luces.internet}
            valor={internetValor}
            detalle={m.bajada_mbps != null ? t("pwa.medidor.internetDetalle", { mbps: m.bajada_mbps }) : t("pwa.medidor.internetDetalleSin")}
            lleno={!m.en_linea ? 100 : Math.round(((m.ping_ms ?? 0) / 600) * 100)}
          />
          <Fila
            cosa="computador"
            luz={luces.computador}
            valor={m.cpu_equipo_pct != null ? `${m.cpu_equipo_pct}%` : "—"}
            detalle={t("pwa.medidor.computadorDetalle", { app: m.cpu_app_pct ?? 0 })}
            lleno={m.cpu_equipo_pct ?? 0}
          />
          <Fila
            cosa="memoria"
            luz={luces.memoria}
            valor={m.libre_gb != null ? t("pwa.medidor.libres", { gb: m.libre_gb }) : "—"}
            detalle={t("pwa.medidor.memoriaDetalle", { total: m.equipo_gb ?? 0, app: m.app_mb ?? 0 })}
            lleno={usadoGb != null && m.equipo_gb ? Math.round((usadoGb / m.equipo_gb) * 100) : 0}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default MedidorEquipo;
