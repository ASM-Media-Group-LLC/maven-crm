import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart3, Trophy, TrendingUp, TrendingDown, Zap,
  AlertTriangle, Bell, CalendarDays, Bot, LayoutGrid,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { PeriodComparisonResult } from "./usePeriodComparison";

interface Props {
  data: PeriodComparisonResult;
  onCardClick: (type: string) => void;
  sparklineData?: { value: number }[];
  eventCount?: number;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const SalesOperationalCards = ({ data, onCardClick, sparklineData = [], eventCount = 0 }: Props) => {
  const navigate = useNavigate();

  const atRiskTotal = data.atRisk.reduce((s, c) => s + c.currentEarnings, 0);
  const alertCount = data.atRisk.length + data.falling.length;

  const cards = [
    {
      id: "comparatives",
      title: "Comparativas",
      icon: BarChart3,
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
      id: "rising",
      title: "Subiendo",
      icon: TrendingUp,
      iconColor: "text-success",
      content: (
        <div className="space-y-1">
          {data.rising.slice(0, 2).map((c) => (
            <div key={c.creatorKey} className="flex items-center justify-between text-xs">
              <span className="truncate max-w-[80px]">{c.artisticName || "—"}</span>
              <span className="text-success">+{c.changePercent.toFixed(0)}%</span>
            </div>
          ))}
          {data.rising.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
      onClick: () => navigate("/sales-overview/subiendo"),
    },
    {
      id: "falling",
      title: "Bajando",
      icon: TrendingDown,
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
      iconColor: "text-accent",
      content: (
        <p className="text-2xl font-bold text-accent">{data.highPotential.length}</p>
      ),
      onClick: () => navigate("/sales-overview/alto-potencial"),
    },
    {
      id: "at_risk",
      title: "En Riesgo",
      icon: AlertTriangle,
      iconColor: "text-destructive",
      content: (
        <p className="text-2xl font-bold text-destructive">{fmt(atRiskTotal)}</p>
      ),
      onClick: () => navigate("/sales-overview/en-riesgo"),
    },
    {
      id: "alerts",
      title: "Alertas",
      icon: Bell,
      iconColor: "text-warning",
      content: (
        <p className="text-2xl font-bold text-warning">{alertCount}</p>
      ),
    },
    {
      id: "calendar",
      title: "Calendario",
      icon: CalendarDays,
      content: (
        <p className="text-2xl font-bold text-foreground">{eventCount}</p>
      ),
    },
    {
      id: "clari_ai",
      title: "Clari AI",
      icon: Bot,
      iconColor: "text-primary",
      content: (
        <p className="text-xs text-muted-foreground">Chat con IA</p>
      ),
      onClick: () => navigate("/aisales"),
    },
    {
      id: "todas",
      title: "Todas",
      icon: LayoutGrid,
      content: (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span>Total</span><span className="font-medium">{data.creators.length}</span></div>
          <div className="flex justify-between"><span>Activas</span><span className="text-success font-medium">{data.activeCreators}</span></div>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card
          key={card.id}
          className="cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-lg"
          onClick={() => card.onClick ? card.onClick() : onCardClick(card.id)}
        >
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.iconColor || "text-muted-foreground"}`} />
              <span className="text-xs font-medium text-muted-foreground">{card.title}</span>
            </div>
            {card.content}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SalesOperationalCards;
