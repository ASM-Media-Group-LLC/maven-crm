import { Users, MessageCircle, DollarSign, RotateCcw } from "lucide-react";

const stats = [
  { label: "Creadoras", value: "56", icon: Users, color: "text-success" },
  { label: "Ganancias por mensajes", value: "$8,608.24", icon: MessageCircle, color: "text-accent" },
  { label: "Ganancias totales", value: "$12,066.42", icon: DollarSign, color: "text-success" },
  { label: "Reembolsos", value: "$0.00", icon: RotateCcw, color: "text-instagram-pink" },
];

const CreatorStatsCards = () => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Estadísticas de Creadoras
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          El cambio porcentual se calcula comparando el valor del período seleccionado contra el período inmediatamente anterior.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-4"
          >
            <div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreatorStatsCards;
