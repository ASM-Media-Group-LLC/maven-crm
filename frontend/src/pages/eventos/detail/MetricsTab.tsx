import { Users, UserCheck, UserX, UserMinus, BarChart3 } from "lucide-react";
import { useEventGuestsExtended } from "../useEventoDetail";

interface Props {
  eventId: string;
}

const MetricsTab = ({ eventId }: Props) => {
  const { data: guests = [], isLoading } = useEventGuestsExtended(eventId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-4">Cargando…</p>;
  }

  const total = guests.length;
  const confirmed = guests.filter((g: any) => g.status === "confirmed").length;
  const cancelled = guests.filter((g: any) => g.status === "cancelled").length;
  const attended = guests.filter((g: any) => g.status === "attended").length;
  const noShow = guests.filter((g: any) => g.status === "no_show").length;
  const pending = guests.filter((g: any) => g.status === "pending").length;

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const cards = [
    { label: "Total invitados", value: total, icon: Users, color: "text-foreground" },
    { label: "Confirmados", value: confirmed, pct: pct(confirmed), icon: UserCheck, color: "text-primary" },
    { label: "Asistieron", value: attended, pct: pct(attended), icon: UserCheck, color: "text-primary" },
    { label: "Cancelados", value: cancelled, pct: pct(cancelled), icon: UserX, color: "text-destructive" },
    { label: "No asistieron", value: noShow, pct: pct(noShow), icon: UserMinus, color: "text-muted-foreground" },
    { label: "Pendientes", value: pending, pct: pct(pending), icon: BarChart3, color: "text-warning" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-4 space-y-1">
            <div className="flex items-center gap-2">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            {c.pct !== undefined && (
              <p className="text-[11px] text-muted-foreground">{c.pct}% del total</p>
            )}
          </div>
        ))}
      </div>

      {/* Attendance rate bar */}
      {total > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="text-sm font-medium">Tasa de confirmación</p>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct(confirmed + attended)}%` }} />
            <div className="h-full bg-destructive transition-all" style={{ width: `${pct(cancelled)}%` }} />
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Confirmados/Asistieron</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" />Cancelados</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" />Otros</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsTab;
