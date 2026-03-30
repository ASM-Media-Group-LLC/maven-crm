import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  { key: "a+", label: "A+", activeClass: "bg-primary/15 border-primary text-primary", hoverClass: "hover:bg-primary/10 hover:border-primary/40 hover:scale-[1.05] hover:shadow-sm" },
  { key: "a",  label: "A",  activeClass: "bg-success/15 border-success text-success",   hoverClass: "hover:bg-success/10 hover:border-success/40 hover:scale-[1.05] hover:shadow-sm" },
  { key: "b+", label: "B+", activeClass: "bg-warning/15 border-warning text-warning",   hoverClass: "hover:bg-warning/10 hover:border-warning/40 hover:scale-[1.05] hover:shadow-sm" },
  { key: "b",  label: "B",  activeClass: "bg-warning/10 border-warning/50 text-warning/80", hoverClass: "hover:bg-warning/8 hover:border-warning/30 hover:scale-[1.05] hover:shadow-sm" },
  { key: "c",  label: "C",  activeClass: "bg-muted border-muted-foreground/50 text-muted-foreground", hoverClass: "hover:bg-muted-foreground/10 hover:border-muted-foreground/40 hover:scale-[1.05] hover:shadow-sm" },
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
    <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/30">
      <CardHeader className="pb-0.5 px-3 pt-2">
        <CardTitle className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Cantidad
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          {categoryConfig.map((cat) => {
            const count = byQuality[cat.key] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const active = isActive(cat.key);
            return (
              <button
                key={cat.key}
                onClick={() => handleClick(cat.key)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border p-1.5 transition-all duration-200 cursor-pointer flex-1",
                  active
                    ? cat.activeClass
                    : cn("border-border bg-card text-foreground", cat.hoverClass)
                )}
              >
                <span className={cn("text-[10px] font-bold uppercase tracking-wide", active ? "" : "text-muted-foreground")}>
                  {cat.label}
                </span>
                <span className="text-base font-bold tabular-nums leading-none">{count}</span>
                <span className={cn("text-[10px] tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                  {pct}%
                </span>
              </button>
            );
          })}

          <div className="flex flex-col gap-1 ml-1">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1 min-w-[80px]">
              <span className="text-xs font-medium text-muted-foreground">Total</span>
              <span className="text-sm font-bold tabular-nums">{total}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1 min-w-[80px]">
              <span className="text-xs font-medium text-muted-foreground">QA</span>
              <span className="text-sm font-bold tabular-nums text-primary">{qa}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadGenCantidadCard;
