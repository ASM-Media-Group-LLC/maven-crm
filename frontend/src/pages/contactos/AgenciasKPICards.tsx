import { Building2, Search, Loader, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  total: number;
  discovery: number;
  enProceso: number;
  completadas: number;
}

const AgenciasKPICards = ({ total, discovery, enProceso, completadas }: Props) => {
  const cards = [
    { label: "Total Agencias", count: total, subtitle: "Registradas", icon: Building2, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20" },
    { label: "Discovery", count: discovery, subtitle: "En exploración", icon: Search, colorClass: "text-blue-400", bgClass: "bg-blue-500/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-blue-500/15 hover:to-transparent hover:border-blue-500/40" },
    { label: "En Proceso", count: enProceso, subtitle: "Negociando", icon: Loader, colorClass: "text-orange-400", bgClass: "bg-orange-500/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-orange-500/15 hover:to-transparent hover:border-orange-500/40" },
    { label: "Completadas", count: completadas, subtitle: "Finalizadas", icon: CheckCircle, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className={`transition-all duration-200 ${card.hoverClass}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-md ${card.bgClass}`}>
                <card.icon className={`h-4 w-4 ${card.colorClass}`} />
              </div>
            </div>
            <p className={`mt-2 text-2xl font-bold ${card.colorClass}`}>{card.count}</p>
            <p className="text-xs text-muted-foreground">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AgenciasKPICards;
