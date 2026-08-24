import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRESET_CONFIG, type RangePreset } from "@/lib/range-presets";

interface Props {
  totalEarnings: number;
  changePercent: number;
  activeCreators: number;
  /** Los números todavía están cargando → skeletons en lugar de ocultar el header. */
  isLoading?: boolean;
  /** Contra qué se compara la variación (ej: "vs mismo período del mes anterior"). */
  comparisonLabel?: string;
  /** El rango incluye hoy → el total es parcial (BLU importa 1×/día). */
  includesToday?: boolean;
  from: Date | undefined;
  to: Date | undefined;
  onDateChange: (from: Date | undefined, to: Date | undefined) => void;
  activePreset: RangePreset | null;
  onPreset: (key: RangePreset) => void;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const SalesOverviewHeader = ({ totalEarnings, changePercent, activeCreators, isLoading, comparisonLabel, includesToday, from, to, onDateChange, activePreset, onPreset }: Props) => {
  const isPositive = changePercent >= 0;

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Creator Sales Overview</h1>
          <p className="text-sm text-muted-foreground">Analítica y seguimiento de ventas</p>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-12 rounded-full" />
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="gap-1.5 text-sm font-semibold px-3 py-1">
              {fmt(totalEarnings)}
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1 text-sm px-3 py-1 ${isPositive ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}
            >
              {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {isPositive ? "+" : ""}{changePercent.toFixed(1)}%
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {activeCreators}
            </Badge>
            {/* Comparativa a días equivalentes — deja explícito contra qué se compara
                el % (ej: ago 1-24 vs jul 1-24, no vs julio completo). */}
            {comparisonLabel && (
              <span className="text-[11px] text-muted-foreground">{comparisonLabel}</span>
            )}
            {includesToday && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80">
                <Clock className="h-3 w-3" />
                incluye hoy (parcial)
              </span>
            )}
          </div>
        )}
      </div>
      {/* Pills de presets + calendario (mismo patrón que Dashboard 2 / Panel de Control) — así
          siempre se ve de qué fecha son los números. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center rounded-lg border border-border bg-card/40 p-0.5">
          {PRESET_CONFIG.map((p) => {
            const isActive = activePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onPreset(p.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <DateRangePicker from={from} to={to} onApply={onDateChange} placeholder="Seleccionar fechas" />
      </div>
    </div>
  );
};

export default SalesOverviewHeader;
