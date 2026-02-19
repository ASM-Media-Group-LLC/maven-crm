import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Lead = { categoria: string; evidence_urls?: string[] | null };

interface Props {
  leads: Lead[];
}

const LeadGenCantidadCard = ({ leads = [] }: Props) => {
  const total = leads.length;

  const counts = {
    "A+": leads.filter((l) => l.categoria?.toLowerCase() === "a+").length,
    A: leads.filter((l) => l.categoria?.toLowerCase() === "a").length,
    "B+": leads.filter((l) => l.categoria?.toLowerCase() === "b+").length,
    B: leads.filter((l) => l.categoria?.toLowerCase() === "b").length,
    C: leads.filter((l) => l.categoria?.toLowerCase() === "c").length,
  };

  const qa = leads.filter((l) => (l.evidence_urls?.length ?? 0) > 0).length;

  const categories = [
    { name: "A+", borderColor: "border-primary", valueColor: "text-primary", count: counts["A+"] },
    { name: "A", borderColor: "border-success", valueColor: "text-success", count: counts["A"] },
    { name: "B+", borderColor: "border-warning", valueColor: "text-warning", count: counts["B+"] },
    { name: "B", borderColor: "border-warning/60", valueColor: "text-warning/60", count: counts["B"] },
    { name: "C", borderColor: "border-muted-foreground", valueColor: "text-muted-foreground", count: counts["C"] },
    { name: "Total", borderColor: "border-destructive", valueColor: "text-destructive", count: total },
    { name: "QA", borderColor: "border-destructive/70", valueColor: "text-destructive/70", count: qa },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Cantidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {categories.map((cat) => {
          const pct = total > 0 && cat.name !== "Total" && cat.name !== "QA"
            ? Math.round((cat.count / total) * 100)
            : null;
          return (
            <div key={cat.name} className={`rounded-md px-3 py-2 border-l-[3px] ${cat.borderColor}`}>
              <div className="flex items-center gap-3 mb-1">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1">{cat.name}</span>
                <span className={`text-sm font-semibold tabular-nums ${cat.valueColor}`}>
                  {cat.count}
                </span>
                {pct !== null && (
                  <span className="text-xs text-muted-foreground w-9 text-right">{pct}%</span>
                )}
              </div>
              {pct !== null && (
                <Progress
                  value={pct}
                  className="h-1"
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default LeadGenCantidadCard;
