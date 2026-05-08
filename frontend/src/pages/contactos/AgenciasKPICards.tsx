import { Building2, Search, Loader, CheckCircle } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";

interface Props {
  total: number;
  discovery: number;
  enProceso: number;
  completadas: number;
  onClick?: (key: "total" | "discovery" | "enProceso" | "completadas") => void;
}

const AgenciasKPICards = ({ total, discovery, enProceso, completadas, onClick }: Props) => {
  const cards = [
    { key: "total" as const, label: "Total Agencias", count: total, subtitle: "Registradas", icon: Building2, color: "bg-blue-500" },
    { key: "discovery" as const, label: "Discovery", count: discovery, subtitle: "En exploración", icon: Search, color: "bg-violet-500" },
    { key: "enProceso" as const, label: "En Proceso", count: enProceso, subtitle: "Negociando", icon: Loader, color: "bg-amber-500" },
    { key: "completadas" as const, label: "Completadas", count: completadas, subtitle: "Finalizadas", icon: CheckCircle, color: "bg-emerald-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <KpiCard
          key={card.label}
          label={card.label}
          value={card.count}
          icon={card.icon}
          color={card.color}
          subtitle={card.subtitle}
          onClick={onClick ? () => onClick(card.key) : undefined}
        />
      ))}
    </div>
  );
};

export default AgenciasKPICards;
