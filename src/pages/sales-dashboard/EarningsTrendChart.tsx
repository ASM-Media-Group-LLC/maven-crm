import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { format } from "date-fns";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
}

const EarningsTrendChart = ({ rows }: Props) => {
  const data = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const r of rows) {
      const day = r.effective_date;
      grouped.set(day, (grouped.get(day) ?? 0) + (r.total_earnings_gross ?? 0));
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, earnings]) => ({
        date: format(new Date(date + "T12:00:00"), "MMM d"),
        earnings: Math.round(earnings * 100) / 100,
      }));
  }, [rows]);

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
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
            <BarChart data={data} barSize={40}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
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
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  color: "hsl(var(--foreground))",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, "Ganancias"]}
              />
              <Bar
                dataKey="earnings"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default EarningsTrendChart;
