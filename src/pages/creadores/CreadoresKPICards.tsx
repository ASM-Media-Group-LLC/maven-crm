import { TrendingUp, UserPlus, Pause, UserMinus, UserX, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StatusCounts } from "./useCreadores";

interface Props {
  counts: StatusCounts;
}

const CreadoresKPICards = ({ counts }: Props) => {
  const activePercent = counts.total > 0 ? Math.round((counts.active / counts.total) * 100) : 0;

  const cards = [
    { label: "Activas", count: counts.active, subtitle: `${activePercent}% del total`, icon: TrendingUp, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:bg-success/10 hover:border-success/40" },
    { label: "Onboarding", count: counts.onboarding, subtitle: "En proceso", icon: UserPlus, colorClass: "text-primary", bgClass: "bg-primary/20", hoverClass: "hover:bg-primary/10 hover:border-primary/40" },
    { label: "Pausadas", count: counts.paused, subtitle: "Temporales", icon: Pause, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: "hover:bg-warning/10 hover:border-warning/40" },
    { label: "Retiros", count: counts.leaving, subtitle: "Próximas salidas", icon: UserMinus, colorClass: "text-destructive", bgClass: "bg-destructive/20", hoverClass: "hover:bg-destructive/10 hover:border-destructive/40" },
    { label: "Terminadas", count: counts.terminated, subtitle: "Inactivas", icon: UserX, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: "hover:bg-muted-foreground/5 hover:border-muted-foreground/20" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className={`transition-all duration-200 ${card.hoverClass}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${card.bgClass}`}>
                  <card.icon className={`h-4 w-4 ${card.colorClass}`} />
                </div>
              </div>
              <p className={`mt-2 text-2xl font-bold ${card.colorClass}`}>{card.count}</p>
              <p className="text-xs text-muted-foreground">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="w-fit">
        <CardContent className="flex items-center gap-3 px-4 py-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Total de Creadoras</p>
            <p className="text-lg font-bold">{counts.total}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreadoresKPICards;
