import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatChipProps {
  label: string;
  value: ReactNode;
  /** Texto secundario compacto, p. ej. "59 activas" o "-45%". */
  hint?: ReactNode;
  /** Clase Tailwind de fondo para el puntito, p. ej. "bg-primary". */
  color?: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * Tarjeta de estadística compacta ("stat-chip"): misma información que las
 * KpiCard grandes, en mucho menos espacio. Pensada para grillas tipo
 * `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`.
 */
const StatChip = ({ label, value, hint, color, icon, className }: StatChipProps) => (
  <div className={cn("rounded-lg border bg-card p-3", className)}>
    <div className="flex items-center gap-1.5">
      {color && <span className={cn("h-2 w-2 shrink-0 rounded-sm", color)} aria-hidden />}
      <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {icon && <span className="ml-auto shrink-0 text-muted-foreground">{icon}</span>}
    </div>
    <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-2xl font-bold leading-none tabular-nums">{value}</span>
      {hint != null && <span className="min-w-0 text-xs leading-snug text-muted-foreground">{hint}</span>}
    </div>
  </div>
);

export default StatChip;
