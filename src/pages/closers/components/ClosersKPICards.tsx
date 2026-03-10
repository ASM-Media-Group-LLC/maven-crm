import { Card, CardContent } from "@/components/ui/card";
import { CloserCreator } from "../useCloserCreators";

interface Props {
  creators: CloserCreator[];
}

const ClosersKPICards = ({ creators }: Props) => {
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
    { label: "Asignadas", value: asignadas.toString(), sub: "Pendientes de contacto", color: "border-t-primary" },
    { label: "En Negociación", value: enNegociacion.toString(), sub: "En proceso activo", color: "border-t-accent" },
    { label: "Confirmadas", value: confirmadas.toString(), sub: "Listas para onboarding", color: "border-t-[hsl(var(--success,142_71%_45%))]" },
    { label: "Completadas", value: completadas.toString(), sub: "Proceso finalizado", color: "border-t-[hsl(var(--success,142_71%_45%))]" },
    { label: "Monetización Est.", value: `$${monetizacionTotal.toLocaleString()}`, sub: "Total estimado", color: "border-t-primary" },
    { label: "Revenue Agencia", value: `$${revenueAgencia.toLocaleString()}`, sub: "Confirmadas + Completadas", color: "border-t-accent" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className={`border-t-[3px] ${card.color}`}>
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ClosersKPICards;
