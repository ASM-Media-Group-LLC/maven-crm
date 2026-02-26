import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from "recharts";
import { format } from "date-fns";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

interface Props {
  rows: EarningsRow[];
  earningsMode: EarningsMode;
}

const ChargebacksChart = ({ rows, earningsMode }: Props) => {
  const data = useMemo(() => {
    const dates = new Set<string>();
    for (const r of rows) dates.add(r.effective_date);
    return Array.from(dates)
      .sort()
      .map((d) => ({
        label: format(new Date(d + "T12:00:00"), "MMM d"),
        chargebacks: 0,
      }));
  }, [rows]);

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Chargebacks</h3>
      <div className="h-48">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", color: "hsl(var(--foreground))", fontSize: 12 }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, "Chargebacks"]}
              />
              <Line type="monotone" dataKey="chargebacks" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--destructive))" }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default ChargebacksChart;
