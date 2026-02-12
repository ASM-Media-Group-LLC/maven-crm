import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";
import { TrendingUp, Crown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
}

const filterTabs = [
  { key: "all", label: "Ver Todas", icon: null },
  { key: "top20", label: "Ver Top 20%", icon: Crown },
  { key: "bottom80", label: "Ver Bottom 80%", icon: Users },
] as const;

type FilterKey = (typeof filterTabs)[number]["key"];

const buildLorenz = (rows: EarningsRow[]) => {
  const grouped = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const key = r.creator_id || r.pending_creator || r.id;
    grouped.set(key, (grouped.get(key) ?? 0) + (r.total_earnings_gross ?? 0));
    total += r.total_earnings_gross ?? 0;
  }
  if (total === 0 || grouped.size === 0) return { points: [] as { percent: string; revenue: number }[], top20Pct: 0 };

  const sorted = Array.from(grouped.values()).sort((a, b) => b - a);
  const n = sorted.length;
  let cumulative = 0;
  const points = sorted.map((earnings, i) => {
    cumulative += earnings;
    return { percent: `${Math.round(((i + 1) / n) * 100)}%`, revenue: Math.round((cumulative / total) * 100) };
  });

  const top20Count = Math.max(1, Math.ceil(n * 0.2));
  const top20Revenue = sorted.slice(0, top20Count).reduce((sum, v) => sum + v, 0);
  return { points, top20Pct: Math.round((top20Revenue / total) * 100) };
};

const ConcentrationChart = ({ rows, comparedRows }: Props) => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const currentLorenz = useMemo(() => buildLorenz(rows), [rows]);
  const compLorenz = useMemo(() => comparedRows ? buildLorenz(comparedRows) : null, [comparedRows]);

  const hasComparison = compLorenz && compLorenz.points.length > 0;

  // Merge points for dual display
  const mergedPoints = useMemo(() => {
    if (!hasComparison) return currentLorenz.points.map((p) => ({ ...p, revenueB: undefined as number | undefined }));
    const maxLen = Math.max(currentLorenz.points.length, compLorenz.points.length);
    const merged = [];
    for (let i = 0; i < maxLen; i++) {
      merged.push({
        percent: currentLorenz.points[i]?.percent ?? compLorenz.points[i]?.percent ?? `${i}%`,
        revenue: currentLorenz.points[i]?.revenue ?? 0,
        revenueB: compLorenz.points[i]?.revenue ?? 0,
      });
    }
    return merged;
  }, [currentLorenz, compLorenz, hasComparison]);

  const insight = currentLorenz.points.length > 0
    ? `El 20% de las creadoras genera el ${currentLorenz.top20Pct}% de los ingresos`
    : "Sin datos disponibles";

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Análisis de Concentración</h3>
            <p className="text-xs text-muted-foreground">Distribución de ingresos por creadora</p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeFilter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Insight */}
      <div className="rounded-lg bg-muted px-4 py-2.5 text-sm text-foreground">{insight}</div>

      {/* Chart */}
      <div className="h-72">
        {mergedPoints.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sin datos para el período seleccionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mergedPoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="percent"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                label={{ value: "% Creators", position: "insideBottom", offset: -5, fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                label={{ value: "% Revenue", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  color: "hsl(var(--foreground))",
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [`${value}%`, name === "revenueB" ? "Periodo B" : "Periodo A"]}
              />
              {hasComparison && <Legend formatter={(v) => (v === "revenueB" ? "Periodo B" : "Periodo A")} />}
              <ReferenceLine y={currentLorenz.top20Pct} stroke="hsl(var(--destructive))" strokeDasharray="6 6" strokeWidth={1.5} />
              <ReferenceLine x="20%" stroke="hsl(var(--primary))" strokeDasharray="6 6" strokeWidth={1.5} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary) / 0.1)" name="revenue" />
              {hasComparison && (
                <Area type="monotone" dataKey="revenueB" stroke="hsl(var(--muted-foreground))" strokeWidth={2} fill="hsl(var(--muted-foreground) / 0.08)" strokeDasharray="5 5" name="revenueB" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ConcentrationChart;
