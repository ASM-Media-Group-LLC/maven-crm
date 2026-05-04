import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { PeriodComparisonResult } from "../usePeriodComparison";

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

interface Props {
  comparison: PeriodComparisonResult;
  todayVsYesterday: { today: number; yesterday: number; changePercent: number };
}

const ComparativasKPIs = ({ comparison, todayVsYesterday }: Props) => {
  const changeIsPositive = comparison.totalChangePercent >= 0;
  const todayIsPositive = todayVsYesterday.changePercent >= 0;
  const progressValue = comparison.totalPrevious > 0
    ? Math.min((comparison.totalCurrent / comparison.totalPrevious) * 100, 100)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Current vs Previous */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Mes Actual vs Anterior</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold text-foreground">{fmt(comparison.totalCurrent)}</p>
              <p className="text-xs text-muted-foreground">vs {fmt(comparison.totalPrevious)}</p>
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${changeIsPositive ? "text-success" : "text-destructive"}`}>
              {changeIsPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(comparison.totalChangePercent).toFixed(1)}%
            </div>
          </div>
          <Progress value={progressValue} className="h-2" />
        </CardContent>
      </Card>

      {/* Today vs Yesterday */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Hoy vs Ayer</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold text-foreground">{fmt(todayVsYesterday.today)}</p>
              <p className="text-xs text-muted-foreground">Ayer: {fmt(todayVsYesterday.yesterday)}</p>
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${todayIsPositive ? "text-success" : "text-destructive"}`}>
              {todayIsPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(todayVsYesterday.changePercent).toFixed(1)}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trends */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Tendencias</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              <div>
                <p className="text-2xl font-bold text-foreground">{comparison.rising.length}</p>
                <p className="text-xs text-muted-foreground">Subiendo</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold text-foreground">{comparison.falling.length + comparison.atRisk.length}</p>
                <p className="text-xs text-muted-foreground">Bajando</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComparativasKPIs;
