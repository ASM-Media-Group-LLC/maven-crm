import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const categories = [
  { name: "A+", color: "bg-primary", borderColor: "border-primary" },
  { name: "A", color: "bg-success", borderColor: "border-success" },
  { name: "B+", color: "bg-warning", borderColor: "border-warning" },
  { name: "B", color: "bg-warning/60", borderColor: "border-warning/60" },
  { name: "C", color: "bg-muted-foreground", borderColor: "border-muted-foreground" },
  { name: "Total", color: "bg-destructive", borderColor: "border-destructive" },
  { name: "QA", color: "bg-destructive/70", borderColor: "border-destructive/70" },
];

const LeadGenCantidadCard = () => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Cantidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {categories.map((cat) => (
          <div
            key={cat.name}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 border-l-[3px] ${cat.borderColor}`}
          >
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">{cat.name}</span>
            <span className="text-sm font-semibold tabular-nums">0</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default LeadGenCantidadCard;
