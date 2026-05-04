import { LucideIcon } from "lucide-react";
import { Users } from "lucide-react";

interface AnalyticsSectionBannerProps {
  title: string;
  subtitle: string;
  count?: number;
  countLabel?: string;
  icon?: LucideIcon;
}

const AnalyticsSectionBanner = ({
  title,
  subtitle,
  count,
  countLabel = "Agentes Activos",
  icon: Icon = Users,
}: AnalyticsSectionBannerProps) => {
  return (
    <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
      <div className="p-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-primary">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {count !== undefined && (
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">{count}</p>
              <p className="text-xs text-muted-foreground">{countLabel}</p>
            </div>
          )}
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsSectionBanner;
