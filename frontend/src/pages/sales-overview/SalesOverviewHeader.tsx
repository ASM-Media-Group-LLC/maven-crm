import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TrendingUp, TrendingDown, Users } from "lucide-react";

interface Props {
  totalEarnings: number;
  changePercent: number;
  activeCreators: number;
  from: Date | undefined;
  to: Date | undefined;
  onDateChange: (from: Date | undefined, to: Date | undefined) => void;
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const SalesOverviewHeader = ({ totalEarnings, changePercent, activeCreators, from, to, onDateChange }: Props) => {
  const isPositive = changePercent >= 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Creator Sales Overview</h1>
          <p className="text-sm text-muted-foreground">Analítica y seguimiento de ventas</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 text-sm font-semibold px-3 py-1">
            {fmt(totalEarnings)}
          </Badge>
          <Badge
            variant="outline"
            className={`gap-1 text-sm px-3 py-1 ${isPositive ? "text-success border-success/30" : "text-destructive border-destructive/30"}`}
          >
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {isPositive ? "+" : ""}{changePercent.toFixed(1)}%
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {activeCreators}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Reporte / IA Ventas vivían acá como botones, pero ya son subtabs (VentasSubtabs) → redundantes, removidos. */}
        <DateRangePicker from={from} to={to} onApply={onDateChange} />
      </div>
    </div>
  );
};

export default SalesOverviewHeader;
