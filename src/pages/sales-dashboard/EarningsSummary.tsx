import { useMemo } from "react";
import {
  CheckCircle,
  Users,
  FileText,
  MessageCircle,
  Sparkles,
  UserPlus,
  Radio,
} from "lucide-react";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
}

const fmt = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EarningsSummary = ({ rows }: Props) => {
  const totals = useMemo(() => {
    let totalEarnings = 0;
    let subscriptions = 0;
    let messages = 0;
    let tips = 0;

    for (const r of rows) {
      totalEarnings += r.total_earnings_gross ?? 0;
      subscriptions += r.subscription_gross ?? 0;
      messages += r.message_gross ?? 0;
      tips += r.tips_gross ?? 0;
    }

    return { totalEarnings, subscriptions, messages, tips };
  }, [rows]);

  const metricCards = [
    { label: "Suscripciones", value: fmt(totals.subscriptions), icon: Users, color: "text-success" },
    { label: "Posts", value: "$0.00", icon: FileText, color: "text-primary" },
    { label: "Mensajes", value: fmt(totals.messages), icon: MessageCircle, color: "text-instagram-pink" },
    { label: "Propinas", value: fmt(totals.tips), icon: Sparkles, color: "text-warning" },
    { label: "Referidos", value: "$0.00", icon: UserPlus, color: "text-destructive" },
    { label: "Streams", value: "$0.00", icon: Radio, color: "text-accent" },
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
