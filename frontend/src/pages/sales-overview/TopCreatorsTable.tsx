import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

interface CreatorRow {
  creatorKey: string;
  artisticName: string;
  currentEarnings: number;
  changePercent: number;
}

interface Props {
  creators: CreatorRow[];
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const TopCreatorsTable = ({ creators }: Props) => {
  const navigate = useNavigate();
  const top5 = creators.slice(0, 5);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Top 5 Creadoras del Período
        </h3>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/sales-overview/top10")}>
          Ver todas <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      {top5.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Sin datos para el período</p>
      ) : (
        <div className="space-y-2">
          {top5.map((c, i) => {
            const isPositive = c.changePercent >= 0;
            return (
              <div key={c.creatorKey} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate font-medium text-foreground">{c.artisticName || "—"}</span>
                <span className="font-semibold text-foreground tabular-nums">{fmt(c.currentEarnings)}</span>
                <Badge
                  variant="outline"
                  className={`text-xs px-2 py-0.5 gap-1 ${isPositive ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}
                >
                  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {isPositive ? "+" : ""}{c.changePercent.toFixed(0)}%
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TopCreatorsTable;
