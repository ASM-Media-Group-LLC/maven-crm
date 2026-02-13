import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardMetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  subtitle?: string;
  valueColor?: string;
}

const DashboardMetricCard = ({ label, value, icon: MetricIcon, subtitle, valueColor }: DashboardMetricCardProps) => {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <MetricIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={cn("text-2xl font-bold tracking-tight", valueColor)}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardMetricCard;
