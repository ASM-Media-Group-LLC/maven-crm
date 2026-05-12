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
import type { EarningsMode } from "./DashboardFilters";

interface Props {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
  earningsMode: EarningsMode;
}

const filterTabs = [
  { key: "all", label: "Ver Todas", icon: null },
  { key: "top20", label: "Ver Top 20%", icon: Crown },
  { key: "bottom80", label: "Ver Bottom 80%", icon: Users },
] as const;

type FilterKey = (typeof filterTabs)[number]["key"];

const NET_FACTOR = 0.80;

const groupByCreator = (rows: EarningsRow[], mode: EarningsMode) => {
  const factor = mode === "net" ? NET_FACTOR : 1;
  const grouped = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const key = r.creator_id || r.pending_creator || r.id;
    const val = (r.total_earnings_gross ?? 0) * factor;
    grouped.set(key, (grouped.get(key) ?? 0) + val);
    total += val;
  }
  const sorted = Array.from(grouped.values()).sort((a, b) => b - a);
  return { sorted, total, creatorCount: grouped.size };
};

const buildCurve = (values: number[]) => {
  if (values.length === 0) return [];
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return [];
  let cum = 0;
  return values.map((v, i) => {
    cum += v;
    return {
      percent: `${Math.round(((i + 1) / values.length) * 100)}%`,
      revenue: Math.round((cum / total) * 100),
    };
  });
};

const formatCurrency = (v: number) => {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};

const ConcentrationChart = ({ rows, comparedRows, earningsMode }: Props) => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const currentData = useMemo(() => groupByCreator(rows, earningsMode), [rows, earningsMode]);
  const compData = useMemo(() => comparedRows ? groupByCreator(comparedRows, earningsMode) : null, [comparedRows, earningsMode]);

  const getSegment = (sorted: number[], filter: FilterKey) => {
    const cutoff = Math.max(1, Math.ceil(sorted.length * 0.2));
    if (filter === "top20") return sorted.slice(0, cutoff);
    if (filter === "bottom80") return sorted.slice(cutoff);
    return sorted;
  };

  const segmentA = useMemo(() => getSegment(currentData.sorted, activeFilter), [currentData.sorted, activeFilter]);
  const segmentB = useMemo(() => compData ? getSegment(compData.sorted, activeFilter) : null, [compData, activeFilter]);

  const curveA = useMemo(() => buildCurve(segmentA), [segmentA]);
  const curveB = useMemo(() => segmentB ? buildCurve(segmentB) : null, [segmentB]);

  const hasComparison = curveB && curveB.length > 0;

  const mergedPoints = useMemo(() => {
    if (!hasComparison) return curveA.map(p => ({ ...p, revenueB: undefined as number | undefined }));
    const maxLen = Math.max(curveA.length, curveB!.length);
    const merged = [];
    for (let i = 0; i < maxLen; i++) {
      merged.push({
        percent: curveA[i]?.percent ?? curveB![i]?.percent ?? `${i}%`,
        revenue: curveA[i]?.revenue ?? 0,
        revenueB: curveB![i]?.revenue ?? 0,
      });
    }
    return merged;
  }, [curveA, curveB, hasComparison]);

  // Segment stats
  const segmentTotal = segmentA.reduce((s, v) => s + v, 0);
  const segmentPct = currentData.total > 0 ? Math.round((segmentTotal / currentData.total) * 100) : 0;
  const top20Count = Math.max(1, Math.ceil(currentData.sorted.length * 0.2));
  const top20Revenue = currentData.sorted.slice(0, top20Count).reduce((s, v) => s + v, 0);
  const top20Pct = currentData.total > 0 ? Math.round((top20Revenue / currentData.total) * 100) : 0;

  const insight = (() => {
    if (currentData.sorted.length === 0) return "Sin datos disponibles";
    if (activeFilter === "all") {
      return `El 20% de las creadoras genera el ${top20Pct}% de los ingresos`;
    }
    if (activeFilter === "top20") {
      const topCreator = segmentA[0] ?? 0;
      const topPct = segmentTotal > 0 ? Math.round((topCreator / segmentTotal) * 100) : 0;
      return `${segmentA.length} creadoras (top 20%) generan ${formatCurrency(segmentTotal)} — la #1 aporta ${topPct}% del segmento`;
    }
    return `${segmentA.length} creadoras (bottom 80%) generan ${formatCurrency(segmentTotal)} — distribución más uniforme`;
  })();

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
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

      {/* KPI cards */}
      {activeFilter !== "all" && segmentA.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">Creadoras</p>
            <p className="text-lg font-semibold text-foreground">{segmentA.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">Revenue Total</p>
            <p className="text-lg font-semibold text-foreground">{formatCurrency(segmentTotal)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">% del Total</p>
            <p className="text-lg font-semibold text-foreground">{segmentPct}%</p>
          </div>
        </div>
      )}

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
                label={{ value: activeFilter === "all" ? "% Creators" : `% Creators (${activeFilter === "top20" ? "Top 20%" : "Bottom 80%"})`, position: "insideBottom", offset: -5, fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                label={{ value: "% Revenue (segmento)", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
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
              {activeFilter === "all" && (
                <>
                  <ReferenceLine y={top20Pct} stroke="hsl(var(--destructive))" strokeDasharray="6 6" strokeWidth={1.5} />
                  <ReferenceLine x="20%" stroke="hsl(var(--primary))" strokeDasharray="6 6" strokeWidth={1.5} />
                </>
              )}
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
