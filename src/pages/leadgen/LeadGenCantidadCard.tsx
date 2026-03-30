import { Star, TrendingUp, ArrowUpRight, ArrowRight, ArrowDownRight, Users, PhoneCall } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ActiveFilter {
  type: "categoria" | "status" | null;
  value: string | null;
}

export interface SummaryStats {
  total: number;
  qa: number;
  byQuality: Record<string, number>;
}

interface Props {
  stats: SummaryStats;
  activeFilter?: ActiveFilter;
  onFilterChange?: (filter: ActiveFilter) => void;
}

const categoryConfig = [
  { key: "a+", label: "A+", icon: Star, colorClass: "text-primary", bgClass: "bg-primary/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40", activeClass: "border-primary bg-primary/10" },
  { key: "a", label: "A", icon: TrendingUp, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40", activeClass: "border-success bg-success/10" },
  { key: "b+", label: "B+", icon: ArrowUpRight, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40", activeClass: "border-warning bg-warning/10" },
  { key: "b", label: "B", icon: ArrowRight, colorClass: "text-warning/80", bgClass: "bg-warning/15", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/10 hover:to-transparent hover:border-warning/30", activeClass: "border-warning/60 bg-warning/8" },
  { key: "c", label: "C", icon: ArrowDownRight, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20", activeClass: "border-muted-foreground/50 bg-muted" },
];

const LeadGenCantidadCard = ({ stats, activeFilter, onFilterChange }: Props) => {
  const { total, qa, byQuality } = stats;

  const handleClick = (key: string) => {
    if (!onFilterChange) return;
    if (activeFilter?.type === "categoria" && activeFilter.value === key) {
      onFilterChange({ type: null, value: null });
    } else {
      onFilterChange({ type: "categoria", value: key });
    }
  };

  const isActive = (key: string) =>
    activeFilter?.type === "categoria" && activeFilter.value === key;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
      {categoryConfig.map((cat) => {
        const count = byQuality[cat.key] ?? 0;
        const active = isActive(cat.key);
        const Icon = cat.icon;
        return (
          <Card
            key={cat.key}
            onClick={() => handleClick(cat.key)}
            className={cn(
              "cursor-pointer transition-all duration-200",
              active ? cat.activeClass : cat.hoverClass
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-sm text-muted-foreground">Cat. {cat.label}</p>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-md", cat.bgClass)}>
                  <Icon className={cn("h-4 w-4", cat.colorClass)} />
                </div>
              </div>
              <p className={cn("mt-2 text-2xl font-bold", cat.colorClass)}>{count}</p>
            </CardContent>
          </Card>
        );
      })}

      {/* Total */}
      <Card className="transition-all duration-200 hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Total</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
              <Users className="h-4 w-4 text-foreground" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold">{total}</p>
        </CardContent>
      </Card>

      {/* QA */}
      <Card className="transition-all duration-200 hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">QA</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20">
              <PhoneCall className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-primary">{qa}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadGenCantidadCard;
