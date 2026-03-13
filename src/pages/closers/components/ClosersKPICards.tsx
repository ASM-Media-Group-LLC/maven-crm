import { Inbox, UserCheck, MessageSquare, CheckCircle, Trophy, XCircle, Users } from "lucide-react";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

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
    { label: "Total Leads", value: total.toLocaleString(), subtitle: "En el sistema", icon: Users, color: "muted" as const },
    { label: "Sin Contactar", value: sinContactar.toLocaleString(), subtitle: "Pendientes", icon: Inbox, color: "accent" as const },
    { label: "Contactados", value: contactados.toLocaleString(), subtitle: "En seguimiento", icon: UserCheck, color: "primary" as const },
    { label: "Interesadas", value: interesadas.toLocaleString(), subtitle: "Con interés", icon: MessageSquare, color: "accent" as const },
    { label: "En Negociación", value: enNegociacion.toLocaleString(), subtitle: "En proceso", icon: MessageSquare, color: "warning" as const },
    { label: "Confirmadas", value: confirmadas.toLocaleString(), subtitle: "Listas", icon: CheckCircle, color: "success" as const },
    { label: "Completadas", value: completadas.toLocaleString(), subtitle: "Finalizadas", icon: Trophy, color: "success" as const },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
      {cards.map((card) => (
        <DashboardMetricCard
          key={card.label}
          label={card.label}
          value={card.value}
          subtitle={card.subtitle}
          icon={card.icon}
          color={card.color}
        />
      ))}
    </div>
  );
};

export default ClosersKPICards;
