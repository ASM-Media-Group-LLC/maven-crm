import { Inbox, UserCheck, MessageSquare, CheckCircle, Trophy, Users, Handshake } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  statusCounts: Record<string, number>;
}

const ClosersKPICards = ({ statusCounts }: Props) => {
  const sinContactar = statusCounts["no_response"] || 0;
  const contactados = (statusCounts["contactado"] || 0) + (statusCounts["replied"] || 0);
  const interesadas = statusCounts["interested"] || 0;
  const enNegociacion = statusCounts["meeting_set"] || 0;
  const confirmadas = statusCounts["confirmed"] || 0;
  const completadas = statusCounts["completed"] || 0;
  const noInteresadas = statusCounts["not_interested"] || 0;

  const total = sinContactar + contactados + interesadas + enNegociacion + confirmadas + completadas + noInteresadas;

  const cards = [
    { label: "Total Leads", count: total, subtitle: "Registrados", icon: Users, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20" },
    { label: "Sin Contactar", count: sinContactar, subtitle: "Pendientes", icon: Inbox, colorClass: "text-primary", bgClass: "bg-primary/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40" },
    { label: "Contactados", count: contactados, subtitle: "Respondieron", icon: UserCheck, colorClass: "text-accent-foreground", bgClass: "bg-accent/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:to-transparent hover:border-accent-foreground/20" },
    { label: "Interesadas", count: interesadas, subtitle: "Con interés", icon: MessageSquare, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40" },
    { label: "En Negociación", count: enNegociacion, subtitle: "En proceso", icon: Handshake, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40" },
    { label: "Confirmadas", count: confirmadas, subtitle: "Listas", icon: CheckCircle, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40" },
    { label: "Completadas", count: completadas, subtitle: "Finalizadas", icon: Trophy, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40" },
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
            <p className={`mt-2 text-2xl font-bold ${card.colorClass}`}>{card.count.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ClosersKPICards;
