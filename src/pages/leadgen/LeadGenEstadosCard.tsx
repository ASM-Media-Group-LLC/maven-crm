import { TrendingUp, Circle, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const estados = [
  { name: "Respondieron", icon: TrendingUp, iconClass: "text-primary" },
  { name: "Interesadas", icon: Circle, iconClass: "text-success fill-success" },
  { name: "No interesadas", icon: Circle, iconClass: "text-destructive fill-destructive" },
  { name: "Otros", icon: Circle, iconClass: "text-success/60 fill-success/60" },
  { name: "Con Telefono", icon: Phone, iconClass: "text-muted-foreground" },
];

const LeadGenEstadosCard = () => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Estados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {estados.map((estado) => (
          <div
            key={estado.name}
            className="flex items-center gap-3 rounded-md px-3 py-2.5"
          >
            <estado.icon className={`h-4 w-4 shrink-0 ${estado.iconClass}`} />
            <span className="text-sm font-medium flex-1">{estado.name}</span>
            <span className="text-sm font-semibold tabular-nums">0</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default LeadGenEstadosCard;
