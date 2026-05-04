import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricColor = "primary" | "accent" | "success" | "warning" | "destructive" | "muted";

interface DashboardMetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  subtitle?: string;
  color?: MetricColor;
}

const colorConfig: Record<MetricColor, { hover: string; icon: string; value: string }> = {
  primary: {
    hover: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40",
    icon: "bg-primary/10 text-primary",
    value: "text-primary",
  },
  accent: {
    hover: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:to-transparent hover:border-accent/40",
    icon: "bg-accent/10 text-accent-foreground",
    value: "text-accent-foreground",
  },
  success: {
    hover: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40",
    icon: "bg-success/10 text-success",
    value: "text-success",
  },
  warning: {
    hover: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40",
    icon: "bg-warning/10 text-warning",
    value: "text-warning",
  },
  destructive: {
    hover: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40",
    icon: "bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
  muted: {
    hover: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted/15 hover:to-transparent hover:border-muted-foreground/40",
    icon: "bg-muted text-muted-foreground",
    value: "",
  },
};

const DashboardMetricCard = ({ label, value, icon: MetricIcon, subtitle, color = "muted" }: DashboardMetricCardProps) => {
  const config = colorConfig[color];

  return (
    <Card className={cn("transition-all duration-200 cursor-default min-w-0 overflow-hidden", config.hover)}>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", config.icon)}>
          <MetricIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className={cn("text-xl font-bold tracking-tight", config.value)}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardMetricCard;
