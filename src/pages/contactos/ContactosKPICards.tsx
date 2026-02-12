import { Users, UserPlus, CheckSquare, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  total: number;
  nuevos: number;
  convertidos: number;
  esteMes: number;
}

const ContactosKPICards = ({ total, nuevos, convertidos, esteMes }: Props) => {
  const cards = [
    { label: "Total Contactos", count: total, subtitle: "Registrados", icon: Users, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20" },
    { label: "Nuevos", count: nuevos, subtitle: "Sin contactar", icon: UserPlus, colorClass: "text-primary", bgClass: "bg-primary/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40" },
    { label: "Convertidos", count: convertidos, subtitle: "A creadores", icon: CheckSquare, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40" },
    { label: "Este Mes", count: esteMes, subtitle: "Agregados", icon: CalendarDays, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40" },
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

export default ContactosKPICards;
