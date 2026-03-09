import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeadGenEntry } from "./useLeadGen";

interface ActiveFilter {
  type: "categoria" | "status" | null;
  value: string | null;
}

interface Props {
  leads: LeadGenEntry[];
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

const LeadGenCantidadCard = ({ leads = [], activeFilter, onFilterChange }: Props) => {
  const total = leads.length;

  const counts: Record<string, number> = {
    "a+": leads.filter((l) => l.quality?.toLowerCase() === "a+").length,
    a:   leads.filter((l) => l.quality?.toLowerCase() === "a").length,
    "b+": leads.filter((l) => l.quality?.toLowerCase() === "b+").length,
    b:   leads.filter((l) => l.quality?.toLowerCase() === "b").length,
    c:   leads.filter((l) => l.quality?.toLowerCase() === "c").length,
  };
  // QA count: entries that have phone info
  const qa = leads.filter((l) => !!l.phone_raw || !!l.phone_e164).length;

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
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Cantidad
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {categoryConfig.map((cat) => {
            const count = counts[cat.key] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const active = isActive(cat.key);
            return (
              <button
                key={cat.key}
                onClick={() => handleClick(cat.key)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border p-2 transition-all duration-200 cursor-pointer",
                  active
                    ? cat.activeClass
                    : cn("border-border bg-card text-foreground", cat.hoverClass)
                )}
              >
                <span className={cn("text-[10px] font-bold uppercase tracking-wide", active ? "" : "text-muted-foreground")}>
                  {cat.label}
                </span>
                <span className="text-xl font-bold tabular-nums leading-none">{count}</span>
                <span className={cn("text-[10px] tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{total}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">QA</span>
            <span className="text-lg font-bold tabular-nums text-primary">{qa}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadGenCantidadCard;
