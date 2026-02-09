import { TrendingUp, UserPlus, Pause, UserMinus, UserX, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StatusCounts } from "./useCreadores";

interface KPICardProps {
  label: string;
  count: number;
  icon: React.ElementType;
  colorClass: string;
}

const KPICard = ({ label, count, icon: Icon, colorClass }: KPICardProps) => (
  <Card>
    <CardContent className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{count}</p>
      </div>
      <Icon className={`h-8 w-8 ${colorClass} opacity-40`} />
    </CardContent>
  </Card>
);

interface Props {
  counts: StatusCounts;
}

const cards: Omit<KPICardProps, "count">[] = [
  { label: "Activas", icon: TrendingUp, colorClass: "text-success" },
  { label: "Onboarding", icon: UserPlus, colorClass: "text-primary" },
  { label: "Pausadas", icon: Pause, colorClass: "text-warning" },
  { label: "Retiros", icon: UserMinus, colorClass: "text-destructive" },
  { label: "Terminadas", icon: UserX, colorClass: "text-muted-foreground" },
  { label: "Total", icon: Users, colorClass: "text-secondary-foreground" },
];

const statusKeys: (keyof StatusCounts)[] = ["active", "onboarding", "paused", "leaving", "terminated", "total"];

const CreadoresKPICards = ({ counts }: Props) => (
  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
    {cards.map((card, i) => (
      <KPICard key={card.label} {...card} count={counts[statusKeys[i]]} />
    ))}
  </div>
);

export default CreadoresKPICards;
