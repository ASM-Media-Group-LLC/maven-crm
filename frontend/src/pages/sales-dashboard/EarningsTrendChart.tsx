import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";
import { NET_FACTOR } from "@/lib/earnings";

interface Props {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
  earningsMode: EarningsMode;
}

const groupByDay = (rows: EarningsRow[], mode: EarningsMode) => {
  const factor = mode === "net" ? NET_FACTOR : 1;
  const grouped = new Map<string, number>();
  for (const r of rows) {
    const day = r.effective_date;
    grouped.set(day, (grouped.get(day) ?? 0) + (r.total_earnings_gross ?? 0) * factor);
  }
  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, earnings], i) => ({
      date,
      label: format(new Date(date + "T12:00:00"), "MMM d"),
      earnings: Math.round(earnings * 100) / 100,
      dayIndex: i,
    }));
};

const EarningsTrendChart = ({ rows, comparedRows, earningsMode }: Props) => {
  const data = useMemo(() => {
    const currentData = groupByDay(rows, earningsMode);

    if (!comparedRows || comparedRows.length === 0) {
      return currentData.map((d) => ({ label: d.label, "Periodo A": d.earnings }));
    }

    const compData = groupByDay(comparedRows, earningsMode);
    const maxLen = Math.max(currentData.length, compData.length);
    const merged = [];

    for (let i = 0; i < maxLen; i++) {
      merged.push({
        label: currentData[i]?.label ?? compData[i]?.label ?? `Día ${i + 1}`,
        "Periodo A": currentData[i]?.earnings ?? 0,
        "Periodo B": compData[i]?.earnings ?? 0,
      });
    }

    return merged;
  }, [rows, comparedRows, earningsMode]);

  const hasComparison = comparedRows && comparedRows.length > 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tendencias de Ganancias
      </h3>
      <div className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sin datos para el período seleccionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={hasComparison ? 20 : 40}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border)/0.4)"
                vertical={false}
                fill="none"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                }
              />
              <Tooltip
                cursor={false}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  color: "hsl(var(--foreground))",
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
              />
              {hasComparison && <Legend />}
              <Bar
                dataKey="Periodo A"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              {hasComparison && (
                <Bar
                  dataKey="Periodo B"
                  fill="hsl(var(--muted-foreground))"
                  radius={[4, 4, 0, 0]}
                  opacity={0.5}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default EarningsTrendChart;
