import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart3, Trophy, TrendingDown, Zap, Bell, ChevronRight,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { PeriodComparisonResult } from "./usePeriodComparison";

interface Props {
  data: PeriodComparisonResult;
  onCardClick: (type: string) => void;
  sparklineData?: { value: number }[];
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const SalesOperationalCards = ({ data, onCardClick, sparklineData = [] }: Props) => {
  const navigate = useNavigate();

  const atRiskTotal = data.atRisk.reduce((s, c) => s + c.currentEarnings, 0);
  const alertCount = data.atRisk.length + data.falling.length;

  const cards = [
    {
      id: "comparatives",
      title: "Comparativas",
      icon: BarChart3,
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40",
      iconColor: "text-primary",
      content: (
        <div className="h-10 w-full">
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
      onClick: () => navigate("/sales-overview/comparativas"),
    },
    {
      id: "top10",
      title: "Top 10",
      icon: Trophy,
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:to-transparent hover:border-accent/40",
      iconColor: "text-accent-foreground",
      content: (
        <div className="space-y-1">
          {data.top10.slice(0, 3).map((c, i) => (
            <div key={c.creatorKey} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[80px]">{i + 1}. {c.artisticName || "—"}</span>
              <span className="font-medium text-foreground">{fmt(c.currentEarnings)}</span>
            </div>
          ))}
        </div>
      ),
      onClick: () => navigate("/sales-overview/top10"),
    },
    {
      id: "falling",
      title: "Bajando",
      icon: TrendingDown,
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40",
      iconColor: "text-warning",
      content: (
        <div className="space-y-1">
          {data.falling.slice(0, 2).map((c) => (
            <div key={c.creatorKey} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[80px]">{c.artisticName || "—"}</span>
              <span className="text-warning">{c.changePercent.toFixed(0)}%</span>
            </div>
          ))}
          {data.falling.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
      onClick: () => navigate("/sales-overview/bajando"),
    },
    {
      id: "high_potential",
      title: "Alto Potencial",
      icon: Zap,
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:to-transparent hover:border-accent/40",
      iconColor: "text-accent-foreground",
      content: (
        <p className="text-2xl font-bold text-accent-foreground">{data.highPotential.length}</p>
      ),
      onClick: () => navigate("/sales-overview/alto-potencial"),
    },
    {
      id: "alerts",
      title: "Alertas",
      icon: Bell,
      hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40",
      iconColor: "text-warning",
      content: (
        <p className="text-2xl font-bold text-warning">{alertCount}</p>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card
          key={card.id}
          className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${card.hoverClass}`}
          onClick={() => card.onClick ? card.onClick() : onCardClick(card.id)}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <card.icon className={`h-4 w-4 ${card.iconColor || "text-muted-foreground"}`} />
                <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </div>
            {card.content}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SalesOperationalCards;
