import { BarChart3, Trophy, TrendingDown, Zap, Bell } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { PeriodComparisonResult } from "./usePeriodComparison";

interface Props {
  data: PeriodComparisonResult;
  onCardClick: (type: string) => void;
  sparklineData?: { value: number }[];
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

// Cards operacionales estilo Panel de Control / Dashboard v2 — todas
// abren modal en lugar de navegar a /sales-overview/* (rutas eliminadas).
const SalesOperationalCards = ({ data, onCardClick, sparklineData = [] }: Props) => {
  const alertCount = data.atRisk.length + data.falling.length;

  const cards = [
    {
      id: "comparatives",
      title: "Comparativas",
      icon: BarChart3,
      bg: "bg-blue-500",
      content: (
        <div className="h-12 w-full">
          {sparklineData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <span className="text-xs text-muted-foreground">Sin datos</span>
          )}
        </div>
      ),
    },
    {
      id: "top10",
      title: "Top 10",
      icon: Trophy,
      bg: "bg-amber-500",
      content: (
        <div className="space-y-1 mt-1">
          {data.top10.slice(0, 3).map((c, i) => (
            <div key={c.creatorKey} className="flex items-center justify-between text-[11px]">
              <span className="truncate max-w-[110px] text-muted-foreground">{i + 1}. {c.artisticName || "—"}</span>
              <span className="font-medium tabular-nums">{fmt(c.currentEarnings)}</span>
            </div>
          ))}
          {data.top10.length === 0 && <span className="text-[11px] text-muted-foreground">Sin datos</span>}
        </div>
      ),
    },
    {
      id: "falling",
      title: "Bajando",
      icon: TrendingDown,
      bg: "bg-amber-500",
      content: (
        <div className="space-y-1 mt-1">
          {data.falling.slice(0, 2).map((c) => (
            <div key={c.creatorKey} className="flex items-center justify-between text-[11px]">
              <span className="truncate max-w-[110px] text-muted-foreground">{c.artisticName || "—"}</span>
              <span className="text-amber-500 tabular-nums">{c.changePercent.toFixed(0)}%</span>
            </div>
          ))}
          {data.falling.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      id: "high_potential",
      title: "Alto Potencial",
      icon: Zap,
      bg: "bg-violet-500",
      content: (
        <p className="text-3xl font-bold tabular-nums leading-tight mt-1">{data.highPotential.length}</p>
      ),
    },
    {
      id: "alerts",
      title: "Alertas",
      icon: Bell,
      bg: "bg-rose-500",
      content: (
        <p className="text-3xl font-bold tabular-nums leading-tight mt-1">{alertCount}</p>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onCardClick(card.id)}
          className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
        >
          <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 ${card.bg} transition-opacity group-hover:opacity-50`} />
          <div className="relative space-y-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
              <card.icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{card.title}</p>
              {card.content}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SalesOperationalCards;
