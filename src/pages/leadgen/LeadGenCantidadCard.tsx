import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const categories = [
  { name: "A+", borderColor: "border-primary", valueColor: "text-primary" },
  { name: "A", borderColor: "border-success", valueColor: "text-success" },
  { name: "B+", borderColor: "border-warning", valueColor: "text-warning" },
  { name: "B", borderColor: "border-warning/60", valueColor: "text-warning/60" },
  { name: "C", borderColor: "border-muted-foreground", valueColor: "" },
  { name: "Total", borderColor: "border-destructive", valueColor: "text-destructive" },
  { name: "QA", borderColor: "border-destructive/70", valueColor: "text-destructive/70" },
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
            <span className={`text-sm font-semibold tabular-nums ${cat.valueColor}`}>0</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default LeadGenCantidadCard;
