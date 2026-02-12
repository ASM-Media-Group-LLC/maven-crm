import { useMemo } from "react";
import {
  CheckCircle,
  Users,
  FileText,
  MessageCircle,
  Sparkles,
  UserPlus,
  Radio,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
}

const fmt = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const calcVariation = (a: number, b: number) => {
  if (b === 0) return a > 0 ? "Nuevo" : "0.0%";
  const pct = ((a - b) / b) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const VariationBadge = ({ a, b }: { a: number; b: number }) => {
  const label = calcVariation(a, b);
  const isPositive = a >= b;
  return (
    <span className={cn("text-xs font-medium", isPositive ? "text-success" : "text-destructive")}>
      {label}
    </span>
  );
};

const sumField = (rows: EarningsRow[], field: keyof EarningsRow) =>
  rows.reduce((s, r) => s + ((r[field] as number) ?? 0), 0);

const EarningsSummary = ({ rows, comparedRows }: Props) => {
  const totals = useMemo(() => ({
    totalEarnings: sumField(rows, "total_earnings_gross"),
    subscriptions: sumField(rows, "subscription_gross"),
    messages: sumField(rows, "message_gross"),
    tips: sumField(rows, "tips_gross"),
  }), [rows]);

  const compTotals = useMemo(() => {
    if (!comparedRows) return null;
    return {
      totalEarnings: sumField(comparedRows, "total_earnings_gross"),
      subscriptions: sumField(comparedRows, "subscription_gross"),
      messages: sumField(comparedRows, "message_gross"),
      tips: sumField(comparedRows, "tips_gross"),
    };
  }, [comparedRows]);

  const metricCards = [
    { label: "Suscripciones", value: fmt(totals.subscriptions), raw: totals.subscriptions, compRaw: compTotals?.subscriptions, icon: Users, color: "text-success" },
    { label: "Posts", value: "$0.00", raw: 0, compRaw: compTotals ? 0 : undefined, icon: FileText, color: "text-primary" },
    { label: "Mensajes", value: fmt(totals.messages), raw: totals.messages, compRaw: compTotals?.messages, icon: MessageCircle, color: "text-instagram-pink" },
    { label: "Propinas", value: fmt(totals.tips), raw: totals.tips, compRaw: compTotals?.tips, icon: Sparkles, color: "text-warning" },
    { label: "Referidos", value: "$0.00", raw: 0, compRaw: compTotals ? 0 : undefined, icon: UserPlus, color: "text-destructive" },
    { label: "Streams", value: "$0.00", raw: 0, compRaw: compTotals ? 0 : undefined, icon: Radio, color: "text-accent" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Resumen de ganancias</span>
        <span className="text-xs">ⓘ</span>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Total earnings */}
        <div className="flex items-center gap-4 shrink-0">
          <CheckCircle className="h-12 w-12 text-primary" />
          <div>
            <p className="text-sm text-primary font-medium">Ganancias totales</p>
            <p className="text-3xl font-bold text-foreground">{fmt(totals.totalEarnings)}</p>
            {compTotals && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">B: {fmt(compTotals.totalEarnings)}</span>
                <VariationBadge a={totals.totalEarnings} b={compTotals.totalEarnings} />
              </div>
            )}
          </div>
        </div>

        {/* Metric cards grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
          {metricCards.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div>
                <p className={`text-lg font-semibold ${metric.color}`}>
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                {metric.compRaw !== undefined && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-muted-foreground">B: {fmt(metric.compRaw)}</span>
                    <VariationBadge a={metric.raw} b={metric.compRaw} />
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-muted p-2">
                <metric.icon className={`h-4 w-4 ${metric.color}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EarningsSummary;
