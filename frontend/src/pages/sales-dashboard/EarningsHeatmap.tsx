import { useMemo, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

const NET_FACTOR = 0.80;

interface Props {
  rows: EarningsRow[];
  earningsMode: EarningsMode;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h: number) => {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

const EarningsHeatmap = ({ rows, earningsMode }: Props) => {
  const [hover, setHover] = useState<{ date: string; hour: number } | null>(null);
  const factor = earningsMode === "net" ? NET_FACTOR : 1;

  const { grid, dates, maxVal } = useMemo(() => {
    const map = new Map<string, number>();
    const dateSet = new Set<string>();

    for (const r of rows) {
      const date = r.effective_date;
      dateSet.add(date);
      const hour = r.report_time ? parseInt(r.report_time.split(":")[0], 10) : 0;
      const key = `${date}_${hour}`;
      map.set(key, (map.get(key) ?? 0) + (r.total_earnings_gross ?? 0) * factor);
    }

    const dates = Array.from(dateSet).sort();
    let maxVal = 0;
    map.forEach((v) => { if (v > maxVal) maxVal = v; });

    return { grid: map, dates, maxVal };
  }, [rows, factor]);

  // Rampa por alpha sobre el token primario: la intensidad CRECE con el valor
  // en ambos temas (la rampa anterior, diseñada para fondo claro, hacía brillar
  // los valores BAJOS sobre el tema oscuro — auditoría dataviz #19).
  const getColor = (val: number) => {
    if (maxVal === 0 || val === 0) return "hsl(var(--muted))";
    const intensity = Math.min(val / maxVal, 1);
    return `hsl(var(--primary) / ${(0.15 + 0.85 * intensity).toFixed(3)})`;
  };

  if (dates.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Earnings heatmap</h3>
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Sin datos</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Earnings heatmap ({earningsMode === "net" ? "Net" : "Gross"})</h3>
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Hour headers */}
          <div className="flex items-center gap-0.5 mb-1 ml-20">
            {HOURS.filter((_, i) => i % 3 === 0).map((h) => (
              <span key={h} className="text-[9px] text-muted-foreground" style={{ width: `${3 * 16 + 2}px` }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>

          {/* Rows */}
          {dates.map((date) => (
            <div key={date} className="flex items-center gap-0.5 mb-0.5">
              <span className="w-20 text-[10px] text-muted-foreground text-right pr-2 shrink-0">
                {format(new Date(date + "T12:00:00"), "MMM dd")}
              </span>
              {HOURS.map((h) => {
                const key = `${date}_${h}`;
                const val = grid.get(key) ?? 0;
                const isHovered = hover?.date === date && hover?.hour === h;
                return (
                  <div
                    key={h}
                    className={cn(
                      "h-4 w-4 rounded-[2px] cursor-pointer transition-all",
                      isHovered && "ring-1 ring-foreground"
                    )}
                    style={{ backgroundColor: getColor(val) }}
                    title={`${format(new Date(date + "T12:00:00"), "MMM dd")} at ${hourLabel(h)}\nTotal sales: $${Math.round(val).toLocaleString()}`}
                    onMouseEnter={() => setHover({ date, hour: h })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </div>
          ))}

          {/* Scale bar */}
          <div className="flex items-center gap-2 mt-3 ml-20">
            <span className="text-[9px] text-muted-foreground">$0</span>
            <div className="flex gap-0.5">
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => (
                <div
                  key={p}
                  className="h-3 w-5 rounded-[2px]"
                  style={{ backgroundColor: p === 0 ? "hsl(var(--muted))" : `hsl(var(--primary) / ${0.15 + 0.85 * p})` }}
                />
              ))}
            </div>
            <span className="text-[9px] text-muted-foreground">${Math.round(maxVal).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarningsHeatmap;
