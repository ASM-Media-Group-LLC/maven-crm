import { useMemo } from "react";
import { Users, MessageCircle, DollarSign, RotateCcw } from "lucide-react";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
}

const fmt = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CreatorStatsCards = ({ rows }: Props) => {
  const stats = useMemo(() => {
    const creatorSet = new Set<string>();
    let messageEarnings = 0;
    let totalEarnings = 0;

    for (const r of rows) {
      const key = r.creator_id || r.pending_creator || r.id;
      creatorSet.add(key);
      messageEarnings += r.message_gross ?? 0;
      totalEarnings += r.total_earnings_gross ?? 0;
    }

    return [
      { label: "Creadoras", value: String(creatorSet.size), icon: Users, color: "text-success" },
      { label: "Ganancias por mensajes", value: fmt(messageEarnings), icon: MessageCircle, color: "text-accent" },
      { label: "Ganancias totales", value: fmt(totalEarnings), icon: DollarSign, color: "text-success" },
      { label: "Reembolsos", value: "$0.00", icon: RotateCcw, color: "text-instagram-pink" },
    ];
  }, [rows]);

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
