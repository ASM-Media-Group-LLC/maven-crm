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
  const cards = [
    {
      id: "gross",
      title: "Ingresos Brutos",
      value: fmt(data.totalCurrent),
      change: data.totalChangePercent,
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
      progress: 100,
      clickable: false,
    },
    {
      id: "net",
      title: "Net Earnings",
      value: fmt(data.totalCurrent * 0.8),
      change: data.totalChangePercent,
      icon: Wallet,
      color: "text-success",
      bgColor: "bg-success/10",
      progress: 80,
      clickable: false,
    },
    {
      id: "creators",
      title: "Creadoras Activas",
      value: data.activeCreators.toString(),
      change: 0,
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/10",
      progress: Math.min((data.activeCreators / Math.max(data.creators.length, 1)) * 100, 100),
      clickable: false,
    },
    {
      id: "rising",
      title: "Subiendo",
      value: data.rising.length.toString(),
      change: 0,
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10",
      progress: Math.min((data.rising.length / Math.max(data.activeCreators, 1)) * 100, 100),
      clickable: true,
    },
    {
      id: "at_risk",
      title: "En Riesgo",
      value: data.atRisk.length.toString(),
      change: 0,
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      progress: Math.min((data.atRisk.length / Math.max(data.activeCreators, 1)) * 100, 100),
      clickable: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card
          key={card.id}
          className={`transition-all duration-200 ${card.clickable ? "cursor-pointer hover:scale-[1.03] hover:shadow-lg" : ""}`}
          onClick={() => card.clickable && onCardClick(card.id)}
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
              <div className={`p-1.5 rounded-md ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <div className="space-y-1">
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              {card.change !== 0 && (
                <p className={`text-xs ${card.change >= 0 ? "text-success" : "text-destructive"}`}>
                  {card.change >= 0 ? "+" : ""}{card.change.toFixed(1)}% vs periodo anterior
                </p>
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
