import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

const NET_FACTOR = 0.80;

const categories = [
  { key: "all", label: "All", field: "total_earnings_gross" },
  { key: "subscriptions", label: "Subscriptions", field: "subscription_gross" },
  { key: "tips", label: "Tips", field: "tips_gross" },
  { key: "posts", label: "Posts", field: null },
  { key: "messages", label: "Messages", field: "message_gross" },
  { key: "referrals", label: "Referrals", field: null },
  { key: "streams", label: "Streams", field: null },
] as const;

type CategoryKey = (typeof categories)[number]["key"];

interface Props {
  rows: EarningsRow[];
  earningsMode: EarningsMode;
}

const CreatorEarningsChart = ({ rows, earningsMode }: Props) => {
  const [active, setActive] = useState<CategoryKey>("all");
  const factor = earningsMode === "net" ? NET_FACTOR : 1;

  const data = useMemo(() => {
    const cat = categories.find((c) => c.key === active)!;
    const field = cat.field as keyof EarningsRow | null;

    const grouped = new Map<string, number>();
    for (const r of rows) {
      const day = r.effective_date;
      const val = field ? ((r[field] as number | null) ?? 0) * factor : 0;
      grouped.set(day, (grouped.get(day) ?? 0) + val);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, earnings]) => ({
        label: format(new Date(date + "T12:00:00"), "MMM d"),
        earnings: Math.round(earnings * 100) / 100,
      }));
  }, [rows, active, factor]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Earnings ({earningsMode === "net" ? "Net" : "Gross"})</h3>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 w-fit">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActive(cat.key)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              active === cat.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div className="h-64">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", color: "hsl(var(--foreground))", fontSize: 12 }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, "Earnings"]}
              />
              <Bar dataKey="earnings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default CreatorEarningsChart;
