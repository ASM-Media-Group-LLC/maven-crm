import { Users, UserPlus, CheckSquare, Inbox } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";

interface Props {
  total: number;
  nuevos: number;
  convertidos: number;
  sinContactar: number;
  onClick?: (key: "total" | "nuevos" | "convertidos" | "sinContactar") => void;
}

// KPI cards usando el componente shared <KpiCard>. Antes había JSX
// custom con shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] que se
// desbordaba sobre las cards hermanas y al hover sus glows tocaban
// los bordes vecinos creando un jitter visual molesto. El KpiCard
// shared no tiene ese glow extra y centraliza el estilo.
const ContactosKPICards = ({ total, nuevos, convertidos, sinContactar, onClick }: Props) => {
  const cards = [
    {
      key: "total" as const,
      label: "Total Contactos",
      value: total,
      subtitle: "Registrados en directorio",
      icon: Users,
      color: "bg-blue-500",
    },
    {
      key: "nuevos" as const,
      label: "Nuevos",
      value: nuevos,
      subtitle: "Ingresados últimos 30 días",
      icon: UserPlus,
      color: "bg-emerald-500",
    },
    {
      key: "convertidos" as const,
      label: "Convertidos",
      value: convertidos,
      subtitle: "Pasaron a creadores",
      icon: CheckSquare,
      color: "bg-violet-500",
    },
    {
      key: "sinContactar" as const,
      label: "Sin contactar",
      value: sinContactar,
      subtitle: "Leads sin tocar todavía",
      icon: Inbox,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value.toLocaleString("es")}
          subtitle={card.subtitle}
          icon={card.icon}
          color={card.color}
          onClick={onClick ? () => onClick(card.key) : undefined}
        />
      ))}
    </div>
  );
};

export default ContactosKPICards;
