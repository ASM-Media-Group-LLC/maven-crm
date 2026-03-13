import { Inbox, UserCheck, MessageSquare, CheckCircle, Trophy, DollarSign, TrendingUp } from "lucide-react";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
  leadsDisponibles?: number;
}

const ClosersKPICards = ({ creators, leadsDisponibles }: Props) => {
  const asignadas = creators.filter((c) => c.stage === "Asignada").length;
  const enNegociacion = creators.filter((c) => ["En negociación", "Formulario enviado", "Acuerdo enviado"].includes(c.stage)).length;
  const confirmadas = creators.filter((c) => c.stage === "Confirmada").length;
  const completadas = creators.filter((c) => c.stage === "Completada").length;

  const monetizacionTotal = creators
    .filter((c) => !["No interesada"].includes(c.stage))
    .reduce((sum, c) => sum + Number(c.estimated_monetization || 0), 0);

  const revenueAgencia = creators
    .filter((c) => ["Confirmada", "Completada"].includes(c.stage))
    .reduce((sum, c) => sum + Number(c.estimated_monetization || 0) * (Number(c.agency_commission || 0) / 100), 0);

  const cards = [
    { label: "Leads Disponibles", value: (leadsDisponibles ?? 0).toString(), subtitle: "Sin reclamar", icon: Inbox, color: "accent" as const },
    { label: "Asignadas", value: asignadas.toString(), subtitle: "Pendientes de contacto", icon: UserCheck, color: "primary" as const },
    { label: "En Negociación", value: enNegociacion.toString(), subtitle: "En proceso activo", icon: MessageSquare, color: "accent" as const },
    { label: "Confirmadas", value: confirmadas.toString(), subtitle: "Listas para onboarding", icon: CheckCircle, color: "success" as const },
    { label: "Completadas", value: completadas.toString(), subtitle: "Proceso finalizado", icon: Trophy, color: "success" as const },
    { label: "Monetización Est.", value: `$${monetizacionTotal.toLocaleString()}`, subtitle: "Total estimado", icon: DollarSign, color: "warning" as const },
    { label: "Revenue Agencia", value: `$${revenueAgencia.toLocaleString()}`, subtitle: "Confirmadas + Completadas", icon: TrendingUp, color: "primary" as const },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
