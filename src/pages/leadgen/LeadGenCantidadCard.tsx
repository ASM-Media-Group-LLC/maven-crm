import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Lead = { categoria: string; evidence_urls?: string[] | null };

interface ActiveFilter {
  type: "categoria" | "status" | null;
  value: string | null;
}

interface Props {
  leads: Lead[];
  activeFilter?: ActiveFilter;
  onFilterChange?: (filter: ActiveFilter) => void;
}

const categoryConfig = [
  { key: "a+", label: "A+", activeClass: "bg-primary/15 border-primary text-primary", dotClass: "bg-primary" },
  { key: "a",  label: "A",  activeClass: "bg-success/15 border-success text-success", dotClass: "bg-success" },
  { key: "b+", label: "B+", activeClass: "bg-warning/15 border-warning text-warning", dotClass: "bg-warning" },
  { key: "b",  label: "B",  activeClass: "bg-warning/10 border-warning/50 text-warning/80", dotClass: "bg-warning/60" },
  { key: "c",  label: "C",  activeClass: "bg-muted border-muted-foreground/50 text-muted-foreground", dotClass: "bg-muted-foreground" },
];

const LeadGenCantidadCard = ({ leads = [], activeFilter, onFilterChange }: Props) => {
  const total = leads.length;

  const counts: Record<string, number> = {
    "a+": leads.filter((l) => l.categoria?.toLowerCase() === "a+").length,
    a:   leads.filter((l) => l.categoria?.toLowerCase() === "a").length,
    "b+": leads.filter((l) => l.categoria?.toLowerCase() === "b+").length,
    b:   leads.filter((l) => l.categoria?.toLowerCase() === "b").length,
    c:   leads.filter((l) => l.categoria?.toLowerCase() === "c").length,
  };
  const qa = leads.filter((l) => (l.evidence_urls?.length ?? 0) > 0).length;

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Cantidad
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Category chips grid */}
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
                  "flex flex-col items-center gap-0.5 rounded-lg border p-2 transition-all",
                  "hover:bg-muted/60 cursor-pointer",
                  active
                    ? cat.activeClass
                    : "border-border bg-card text-foreground"
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

        {/* Total & QA row */}
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
