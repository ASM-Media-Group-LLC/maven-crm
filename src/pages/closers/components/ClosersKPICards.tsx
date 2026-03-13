import { Inbox, UserCheck, MessageSquare, CheckCircle, Trophy, Users } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const cards: { label: string; value: number; icon: LucideIcon; iconClass: string }[] = [
    { label: "Total Leads", value: total, icon: Users, iconClass: "text-muted-foreground" },
    { label: "Sin Contactar", value: sinContactar, icon: Inbox, iconClass: "text-accent-foreground" },
    { label: "Contactados", value: contactados, icon: UserCheck, iconClass: "text-primary" },
    { label: "Interesadas", value: interesadas, icon: MessageSquare, iconClass: "text-accent-foreground" },
    { label: "En Negociación", value: enNegociacion, icon: MessageSquare, iconClass: "text-warning" },
    { label: "Confirmadas", value: confirmadas, icon: CheckCircle, iconClass: "text-success" },
    { label: "Completadas", value: completadas, icon: Trophy, iconClass: "text-success" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
        >
          <card.icon className={cn("h-5 w-5 shrink-0", card.iconClass)} />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{card.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground truncate">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ClosersKPICards;
