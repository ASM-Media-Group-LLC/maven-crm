import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

const NET_FACTOR = 0.80;

const SEGMENTS = [
  { key: "subscription_gross", label: "Subscriptions", color: "hsl(25, 95%, 53%)" },
  { key: "tips_gross", label: "Tips", color: "hsl(211, 100%, 50%)" },
  { key: "message_gross", label: "Messages", color: "hsl(0, 84%, 60%)" },
  { key: "posts", label: "Posts", color: "hsl(145, 63%, 32%)" },
  { key: "referrals", label: "Referrals", color: "hsl(271, 91%, 50%)" },
  { key: "streams", label: "Streams", color: "hsl(40, 96%, 40%)" },
] as const;

interface Props {
  rows: EarningsRow[];
  earningsMode: EarningsMode;
}

const EarningsBreakdownChart = ({ rows, earningsMode }: Props) => {
  const factor = earningsMode === "net" ? NET_FACTOR : 1;

  const { data, total } = useMemo(() => {
    const sums: Record<string, number> = {};
    for (const seg of SEGMENTS) sums[seg.key] = 0;

    for (const r of rows) {
      sums["subscription_gross"] += (r.subscription_gross ?? 0) * factor;
      sums["tips_gross"] += (r.tips_gross ?? 0) * factor;
      sums["message_gross"] += (r.message_gross ?? 0) * factor;
    }

    const total = Object.values(sums).reduce((a, b) => a + b, 0);
    const data = SEGMENTS.map((s) => ({
      ...s,
      value: Math.round((sums[s.key] ?? 0) * 100) / 100,
      pct: total > 0 ? ((sums[s.key] ?? 0) / total) * 100 : 0,
    })).filter((d) => d.value > 0);

    return { data, total };
  }, [rows, factor]);

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Earnings breakdown ({earningsMode === "net" ? "Net" : "Gross"})</h3>
      <div className="flex items-start gap-6">
        <div className="h-48 w-48 shrink-0">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", color: "hsl(var(--foreground))", fontSize: 12 }}
                  formatter={(value: number, _: string, entry: any) => [`$${value.toLocaleString()}`, entry.payload.label]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex-1 space-y-2">
          {SEGMENTS.map((s) => {
            const item = data.find((d) => d.key === s.key);
            return (
              <div key={s.key} className="flex items-center gap-3 text-xs">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-muted-foreground">{s.label}</span>
                <span className="font-medium text-foreground">${(item?.value ?? 0).toLocaleString()}</span>
                <span className="text-muted-foreground w-12 text-right">{(item?.pct ?? 0).toFixed(1)}%</span>
              </div>
            );
          })}
          <div className="border-t border-border pt-2 flex items-center gap-3 text-xs font-semibold">
            <span className="h-2.5 w-2.5" />
            <span className="flex-1 text-foreground">Total</span>
            <span className="text-foreground">${Math.round(total).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarningsBreakdownChart;
