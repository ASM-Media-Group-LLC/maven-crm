import { DollarSign, Wallet, Users, TrendingUp, AlertTriangle } from "lucide-react";
import type { PeriodComparisonResult } from "./usePeriodComparison";

interface Props {
  data: PeriodComparisonResult;
  onCardClick: (type: string) => void;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

// KPI cards estilo Panel de Control / Dashboard v2 — gradient corner
// + icono cuadrado coloreado + hover lift. Todos los clicks abren el
// modal CardDetailModal, ya no navegan a otras rutas.
const SalesKPICards = ({ data, onCardClick }: Props) => {
  const cards = [
    {
      id: "gross",
      title: "Ingresos Total",
      value: fmt(data.totalCurrent),
      change: data.totalChangePercent,
      previousValue: fmt(data.totalPrevious),
      subtitle: null,
      icon: DollarSign,
      bg: "bg-blue-500",
    },
    {
      id: "net",
      title: "Net Earnings",
      value: fmt(data.totalCurrent * 0.8),
      change: data.totalChangePercent,
      previousValue: fmt(data.totalPrevious * 0.8),
      subtitle: null,
      icon: Wallet,
      bg: "bg-emerald-500",
    },
    {
      id: "creators",
      title: "Creadoras",
      value: data.creators.length.toString(),
      change: 0,
      previousValue: null,
      subtitle: `${data.activeCreators} activas`,
      icon: Users,
      bg: "bg-violet-500",
    },
    {
      id: "rising",
      title: "Subiendo",
      value: data.rising.length.toString(),
      change: 0,
      previousValue: null,
      subtitle: "crecimiento positivo",
      icon: TrendingUp,
      bg: "bg-success",
    },
    {
      id: "at_risk",
      title: "En Riesgo",
      value: data.atRisk.length.toString(),
      change: 0,
      previousValue: null,
      subtitle: "necesitan atención",
      icon: AlertTriangle,
      bg: "bg-destructive",
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
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">{card.title}</p>
              <p className="text-3xl font-bold tabular-nums leading-tight">{card.value}</p>
              {card.change !== 0 && (
                <p className={`text-[10px] mt-1 ${card.change >= 0 ? "text-success" : "text-destructive"}`}>
                  {card.change >= 0 ? "+" : ""}{card.change.toFixed(1)}% vs anterior
                </p>
              )}
              {card.previousValue && card.change === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">Anterior: {card.previousValue}</p>
              )}
              {card.subtitle && (
                <p className="text-[10px] text-muted-foreground mt-1">{card.subtitle}</p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SalesKPICards;
