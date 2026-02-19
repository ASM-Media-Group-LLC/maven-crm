import { TrendingUp, Circle, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Lead = { status: string; notas?: string | null };

interface Props {
  leads: Lead[];
}

const LeadGenEstadosCard = ({ leads = [] }: Props) => {
  const respondieron = leads.filter(
    (l) => l.status === "contactado" || l.status === "respondio"
  ).length;
  const interesadas = leads.filter((l) => l.status === "interesado").length;
  const noInteresadas = leads.filter((l) => l.status === "no_interesado").length;
  const conTelefono = leads.filter(
    (l) => l.notas && /\+?\d[\d\s\-().]{7,}/.test(l.notas)
  ).length;
  const knownStatuses = new Set(["nuevo", "contactado", "respondio", "interesado", "no_interesado"]);
  const otros = leads.filter((l) => !knownStatuses.has(l.status)).length;

  const estados = [
    { name: "Respondieron", icon: TrendingUp, iconClass: "text-primary", count: respondieron },
    { name: "Interesadas", icon: Circle, iconClass: "text-success fill-success", count: interesadas },
    { name: "No interesadas", icon: Circle, iconClass: "text-destructive fill-destructive", count: noInteresadas },
    { name: "Otros", icon: Circle, iconClass: "text-success/60 fill-success/60", count: otros },
    { name: "Con Teléfono", icon: Phone, iconClass: "text-muted-foreground", count: conTelefono },
  ];

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
            <span className="text-sm font-semibold tabular-nums">{estado.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default LeadGenEstadosCard;
