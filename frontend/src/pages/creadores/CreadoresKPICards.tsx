import { TrendingUp, UserPlus, Pause, UserMinus, UserX, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StatusCounts } from "./useCreadores";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  counts: StatusCounts;
  isCloser?: boolean;
}

const CreadoresKPICards = ({ counts, isCloser = false }: Props) => {
  const { t } = useLanguage();
  const activePercent = counts.total > 0 ? Math.round((counts.active / counts.total) * 100) : 0;

  const cards = [
    { id: "total", label: t("creadores.kpi.total"), count: counts.total, subtitle: t("creadores.kpi.totalSub"), icon: Users, colorClass: "text-foreground", bgClass: "bg-muted", hoverClass: " hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20" },
    { id: "active", label: t("creadores.kpi.active"), count: counts.active, subtitle: t("cr.pctOfTotal", { p: activePercent }), icon: TrendingUp, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: " hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40" },
    { id: "onboarding", label: t("creadores.kpi.onboarding"), count: counts.onboarding + counts.pendiente + counts.pendiente_verificacion, subtitle: t("creadores.kpi.onboardingSub"), icon: UserPlus, colorClass: "text-primary", bgClass: "bg-primary/20", hoverClass: " hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40" },
    { id: "paused", label: t("creadores.kpi.paused"), count: counts.paused, subtitle: t("creadores.kpi.pausedSub"), icon: Pause, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: " hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40" },
    { id: "leaving", label: t("creadores.kpi.leaving"), count: counts.leaving, subtitle: t("creadores.kpi.leavingSub"), icon: UserMinus, colorClass: "text-destructive", bgClass: "bg-destructive/20", hoverClass: " hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40" },
    { id: "terminated", label: t("creadores.kpi.terminated"), count: counts.terminated, subtitle: t("creadores.kpi.terminatedSub"), icon: UserX, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: " hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20" },
  ].filter(card => !(isCloser && card.id === "onboarding"));

  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${isCloser ? 'lg:grid-cols-5' : 'lg:grid-cols-6'}`}>
      {cards.map((card) => (
        <Card key={card.id} className={`transition-all duration-200 ${card.hoverClass}`}>
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
  );
};

export default CreadoresKPICards;
