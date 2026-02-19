import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Trophy, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { PeriodComparisonResult } from "../usePeriodComparison";

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
const initials = (name: string | null) => (name ?? "?").slice(0, 2).toUpperCase();

interface Props {
  comparison: PeriodComparisonResult;
}

const RankingCards = ({ comparison }: Props) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {/* Growth leaders */}
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-success" />
          <p className="text-sm font-medium text-foreground">Mayor Crecimiento</p>
        </div>
        <div className="space-y-2">
          {comparison.rising.slice(0, 5).map((c) => (
            <div key={c.creatorKey} className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-muted">{initials(c.artisticName)}</AvatarFallback>
              </Avatar>
              <span className="text-xs truncate flex-1">{c.artisticName || "—"}</span>
              <span className="text-xs font-medium text-success">+{c.changePercent.toFixed(0)}%</span>
            </div>
          ))}
          {comparison.rising.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
        </div>
      </CardContent>
    </Card>

    {/* Top performers */}
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Top Performers</p>
        </div>
        <div className="space-y-2">
          {comparison.top10.slice(0, 5).map((c, i) => (
            <div key={c.creatorKey} className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-muted">{initials(c.artisticName)}</AvatarFallback>
              </Avatar>
              <span className="text-xs truncate flex-1">{c.artisticName || "—"}</span>
              <span className="text-xs font-medium text-foreground">{fmt(c.currentEarnings)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    {/* Attention needed */}
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <p className="text-sm font-medium text-foreground">Requieren Atención</p>
        </div>
        <div className="space-y-2">
          {[...comparison.atRisk, ...comparison.falling].slice(0, 5).map((c) => (
            <div key={c.creatorKey} className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-muted">{initials(c.artisticName)}</AvatarFallback>
              </Avatar>
              <span className="text-xs truncate flex-1">{c.artisticName || "—"}</span>
              <span className="text-xs font-medium text-destructive">{c.changePercent.toFixed(0)}%</span>
            </div>
          ))}
          {comparison.atRisk.length + comparison.falling.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
        </div>
      </CardContent>
    </Card>
  </div>
);

export default RankingCards;
