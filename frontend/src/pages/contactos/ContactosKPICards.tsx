import { Users, UserPlus, CheckSquare, CalendarDays } from "lucide-react";

interface Props {
  total: number;
  nuevos: number;
  convertidos: number;
  esteMes: number;
  onClick?: (key: "total" | "nuevos" | "convertidos" | "esteMes") => void;
}

// KPI cards estilo Panel de Control / Dashboard v2 — gradient corner
// accent + hover lift + colored icon square. Cuando se pase `onClick`
// las cards se vuelven botones interactivos.
const ContactosKPICards = ({ total, nuevos, convertidos, esteMes, onClick }: Props) => {
  const cards = [
    {
      key: "total" as const,
      label: "Total Contactos",
      count: total,
      subtitle: "Registrados en directorio",
      icon: Users,
      bg: "bg-blue-500",
    },
    {
      key: "nuevos" as const,
      label: "Nuevos",
      count: nuevos,
      subtitle: "Sin contactar todavía",
      icon: UserPlus,
      bg: "bg-emerald-500",
    },
    {
      key: "convertidos" as const,
      label: "Convertidos",
      count: convertidos,
      subtitle: "Pasaron a creadores",
      icon: CheckSquare,
      bg: "bg-violet-500",
    },
    {
      key: "esteMes" as const,
      label: "Este Mes",
      count: esteMes,
      subtitle: "Agregados en este mes",
      icon: CalendarDays,
      bg: "bg-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => {
        const inner = (
          <>
            <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 ${card.bg} transition-opacity group-hover:opacity-50`} />
            <div className="relative space-y-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                <card.icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{card.label}</p>
                <p className="text-3xl font-bold tabular-nums leading-tight">{card.count.toLocaleString("es")}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{card.subtitle}</p>
              </div>
            </div>
          </>
        );
        if (onClick) {
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onClick(card.key)}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
            >
              {inner}
            </button>
          );
        }
        return (
          <div
            key={card.label}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-4"
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
};

export default ContactosKPICards;
