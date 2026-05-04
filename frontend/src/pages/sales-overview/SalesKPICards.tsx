import { useNavigate } from "react-router-dom";
import { DollarSign, Wallet, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PeriodComparisonResult } from "./usePeriodComparison";

interface Props {
  data: PeriodComparisonResult;
  onCardClick: (type: string) => void;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const SalesKPICards = ({ data, onCardClick }: Props) => {
  const navigate = useNavigate();

  const cards = [
    {
      id: "gross",
      title: "Ingresos Total",
      value: fmt(data.totalCurrent),
      change: data.totalChangePercent,
      previousValue: fmt(data.totalPrevious),
      subtitle: null,
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/20",
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40",
      progress: 100,
      route: null,
    },
    {
      id: "net",
      title: "Net Earnings",
      value: fmt(data.totalCurrent * 0.8),
      change: data.totalChangePercent,
      previousValue: fmt(data.totalPrevious * 0.8),
      subtitle: null,
      icon: Wallet,
      color: "text-success",
      bgColor: "bg-success/20",
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40",
      progress: 80,
      route: null,
    },
    {
      id: "creators",
      title: "Creadoras",
      value: data.creators.length.toString(),
      change: 0,
      previousValue: null,
      subtitle: `${data.activeCreators} activas / ${data.creators.length - data.activeCreators} inactivas`,
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/20",
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:to-transparent hover:border-accent/40",
      progress: Math.min((data.activeCreators / Math.max(data.creators.length, 1)) * 100, 100),
      route: null,
    },
    {
      id: "rising",
      title: "Subiendo",
      value: data.rising.length.toString(),
      change: 0,
      previousValue: null,
      subtitle: "crecimiento positivo",
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/20",
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40",
      progress: Math.min((data.rising.length / Math.max(data.activeCreators, 1)) * 100, 100),
      route: "/sales-overview/subiendo",
    },
    {
      id: "at_risk",
      title: "En Riesgo",
      value: data.atRisk.length.toString(),
      change: 0,
      previousValue: null,
      subtitle: "necesitan atención",
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/20",
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40",
      progress: Math.min((data.atRisk.length / Math.max(data.activeCreators, 1)) * 100, 100),
      route: "/sales-overview/en-riesgo",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card
          key={card.id}
          className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${card.hoverClass}`}
          onClick={() => card.route ? navigate(card.route) : onCardClick(card.id)}
        >
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start justify-between">
              <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-md ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
            <div className="space-y-1">
              <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
              {card.change !== 0 && (
                <p className={`text-xs ${card.change >= 0 ? "text-success" : "text-destructive"}`}>
                  {card.change >= 0 ? "+" : ""}{card.change.toFixed(1)}% vs anterior
                </p>
              )}
              {card.previousValue && (
                <p className="text-xs text-muted-foreground">Anterior: {card.previousValue}</p>
              )}
              {card.subtitle && (
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
              )}
            </div>
            <Progress value={card.progress} className="h-1" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SalesKPICards;
