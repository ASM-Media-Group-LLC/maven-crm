import { useMemo } from "react";
import { Users, MessageCircle, DollarSign, RotateCcw, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

interface Props {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
  earningsMode: EarningsMode;
  dateFrom?: Date;
  dateTo?: Date;
}

const fmt = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NET_FACTOR = 0.80;

const calcStats = (rows: EarningsRow[], mode: EarningsMode) => {
  const factor = mode === "net" ? NET_FACTOR : 1;
  const creatorSet = new Set<string>();
  let messageEarnings = 0;
  let totalEarnings = 0;

  for (const r of rows) {
    const key = r.creator_id || r.pending_creator || r.id;
    creatorSet.add(key);
    messageEarnings += (r.message_gross ?? 0) * factor;
    totalEarnings += (r.total_earnings_gross ?? 0) * factor;
  }

  return { creators: creatorSet.size, messageEarnings, totalEarnings };
};

const calcVariation = (a: number, b: number) => {
  if (b === 0) return a > 0 ? "Nuevo" : "0.0%";
  const pct = ((a - b) / b) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

const CreatorStatsCards = ({ rows, comparedRows, earningsMode }: Props) => {
  const current = useMemo(() => calcStats(rows, earningsMode), [rows, earningsMode]);
  const compared = useMemo(() => comparedRows ? calcStats(comparedRows, earningsMode) : null, [comparedRows, earningsMode]);

  const stats = [
    { label: "Creadoras", value: String(current.creators), raw: current.creators, compRaw: compared?.creators, icon: Users, color: "text-success" },
    { label: "Ganancias por mensajes", value: fmt(current.messageEarnings), raw: current.messageEarnings, compRaw: compared?.messageEarnings, icon: MessageCircle, color: "text-accent" },
    { label: "Ganancias totales", value: fmt(current.totalEarnings), raw: current.totalEarnings, compRaw: compared?.totalEarnings, icon: DollarSign, color: "text-success" },
    { label: "Reembolsos", value: "$0.00", raw: 0, compRaw: compared ? 0 : undefined, icon: RotateCcw, color: "text-instagram-pink" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Estadísticas de Creadoras
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          El cambio porcentual se calcula comparando el valor del período seleccionado contra el período inmediatamente anterior.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-4"
          >
            <div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              {stat.compRaw !== undefined && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    B: {typeof stat.compRaw === "number" && stat.label.includes("$") ? fmt(stat.compRaw) : stat.compRaw}
                  </span>
                  <span className={cn(
                    "text-xs font-medium",
                    stat.raw >= stat.compRaw ? "text-success" : "text-destructive"
                  )}>
                    {calcVariation(stat.raw, stat.compRaw)}
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-muted p-2">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreatorStatsCards;
