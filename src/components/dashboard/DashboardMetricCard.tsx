import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardMetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
}

const trendConfig = {
  up: { Icon: TrendingUp, className: "text-success" },
  down: { Icon: TrendingDown, className: "text-destructive" },
  neutral: { Icon: Minus, className: "text-muted-foreground" },
};

const DashboardMetricCard = ({ label, value, icon: MetricIcon, trend = "neutral" }: DashboardMetricCardProps) => {
  const { Icon: TrendIcon, className: trendClass } = trendConfig[trend];

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <MetricIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <TrendIcon className={cn("h-4 w-4 shrink-0", trendClass)} />
      </CardContent>
    </Card>
  );
};

export default DashboardMetricCard;
