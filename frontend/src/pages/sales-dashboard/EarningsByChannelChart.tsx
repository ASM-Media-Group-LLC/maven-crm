import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
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

const CHANNELS = [
  { key: "subscription_gross" as const, label: "Subscriptions", color: "hsl(211, 100%, 50%)" },
  { key: "tips_gross" as const, label: "Tips", color: "hsl(145, 63%, 42%)" },
  { key: "message_gross" as const, label: "Messages", color: "hsl(25, 95%, 53%)" },
  { key: "other" as const, label: "Other", color: "hsl(300, 70%, 50%)" },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

const buildChannelData = (rows: EarningsRow[], mode: EarningsMode) => {
  const factor = mode === "net" ? NET_FACTOR : 1;
  const dailyMap = new Map<string, Record<ChannelKey, number>>();
  const totals: Record<ChannelKey, number> = {
    subscription_gross: 0,
    tips_gross: 0,
    message_gross: 0,
    other: 0,
  };

  for (const r of rows) {
    const day = r.effective_date;
    if (!dailyMap.has(day)) {
      dailyMap.set(day, { subscription_gross: 0, tips_gross: 0, message_gross: 0, other: 0 });
    }
    const entry = dailyMap.get(day)!;
    const sub = (r.subscription_gross ?? 0) * factor;
    const tips = (r.tips_gross ?? 0) * factor;
    const msg = (r.message_gross ?? 0) * factor;
    const total = (r.total_earnings_gross ?? 0) * factor;
    const other = Math.max(0, total - sub - tips - msg);

    entry.subscription_gross += sub;
    entry.tips_gross += tips;
    entry.message_gross += msg;
    entry.other += other;

    totals.subscription_gross += sub;
    totals.tips_gross += tips;
    totals.message_gross += msg;
    totals.other += other;
  }

  const sorted = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      label: format(new Date(date + "T12:00:00"), "MMM d"),
      ...vals,
    }));

  const gt = totals.subscription_gross + totals.tips_gross + totals.message_gross + totals.other;

  return { chartData: sorted, channelTotals: totals, grandTotal: gt };
};

const EarningsByChannelChart = ({ rows, comparedRows, earningsMode }: Props) => {
  const { chartData, channelTotals, grandTotal } = useMemo(() => buildChannelData(rows, earningsMode), [rows, earningsMode]);
  const compData = useMemo(() => comparedRows ? buildChannelData(comparedRows, earningsMode) : null, [comparedRows, earningsMode]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ganancias por Canal
      </h3>
      <div className="flex gap-6">
        <div className="flex-1 h-72">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sin datos para el período seleccionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
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
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                    color: "hsl(var(--foreground))",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]}
                />
                {CHANNELS.map((ch) => (
                  <Line
                    key={ch.key}
                    type="monotone"
                    dataKey={ch.key}
                    name={ch.label}
                    stroke={ch.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="w-52 shrink-0 space-y-3 pt-2">
          {CHANNELS.map((ch) => {
            const total = channelTotals[ch.key];
            const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
            return (
              <div key={ch.key} className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ch.color }}
                  />
                  <span className="text-muted-foreground flex-1 truncate">{ch.label}</span>
                  <span className="text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                  <span className="font-medium text-foreground tabular-nums">
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
                {compData && (
                  <div className="flex items-center gap-2 text-[10px] pl-[18px]">
                    <span className="text-muted-foreground">B:</span>
                    <span className="text-muted-foreground tabular-nums">
                      ${compData.channelTotals[ch.key].toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EarningsByChannelChart;
