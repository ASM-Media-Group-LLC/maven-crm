import { Card, CardContent } from "@/components/ui/card";
import { Deal } from "./useDeals";

interface ClosersKPICardsProps {
  deals: Deal[];
}

const ClosersKPICards = ({ deals }: ClosersKPICardsProps) => {
  const total = deals.length;
  const cerrados = deals.filter((d) => d.stage === "Cerrado").length;
  const enProgreso = deals.filter(
    (d) => !["Cerrado", "Perdido"].includes(d.stage)
  ).length;
  const contactados = deals.filter(
    (d) => d.stage !== "Nuevo" && d.stage !== "Perdido"
  ).length;
  const tasaConversion = total > 0 ? ((cerrados / total) * 100).toFixed(1) : "0";

  const cards = [
    {
      label: "Tasa Conversión",
      value: `${tasaConversion}%`,
      sub: `${cerrados} cerrados de ${total}`,
      color: "border-t-accent",
    },
    {
      label: "Total Deals",
      value: total.toString(),
      sub: "Todos los deals",
      color: "border-t-primary",
    },
    {
      label: "Contactados",
      value: contactados.toString(),
      sub: total > 0 ? `${((contactados / total) * 100).toFixed(0)}% del total` : "0%",
      color: "border-t-[hsl(var(--success))]",
    },
    {
      label: "En Progreso",
      value: enProgreso.toString(),
      sub: "Deals activos",
      color: "border-t-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card
          key={card.label}
          className={`border-t-[3px] ${card.color}`}
        >
          <CardContent className="px-5 py-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ClosersKPICards;
