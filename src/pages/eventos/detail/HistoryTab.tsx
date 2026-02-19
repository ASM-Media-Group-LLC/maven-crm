import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEventAttendanceLog } from "../useEventoDetail";

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  attended: "Asistió",
  no_show: "No asistió",
  rejected: "Rechazado",
  no_response: "Sin respuesta",
};

interface Props {
  eventId: string;
}

const HistoryTab = ({ eventId }: Props) => {
  const { data: logs = [], isLoading } = useEventAttendanceLog(eventId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-4">Cargando…</p>;
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
        <Clock className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No hay historial de cambios</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log: any) => {
        const guestName =
          log.event_guests?.creators?.artistic_name ||
          log.event_guests?.creators?.name ||
          log.event_guests?.guest_name ||
          "Invitado";
        return (
          <div key={log.id} className="flex items-start gap-3 p-3 rounded-md border border-border">
            <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{guestName}</span>
                {" cambió de "}
                <Badge variant="secondary-soft" className="text-[10px] mx-1">
                  {statusLabel[log.old_status] ?? log.old_status ?? "—"}
                </Badge>
                {" a "}
                <Badge variant="secondary-soft" className="text-[10px] mx-1">
                  {statusLabel[log.new_status] ?? log.new_status}
                </Badge>
              </p>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                <span>{format(new Date(log.created_at), "d MMM yyyy · HH:mm", { locale: es })}</span>
                {log.changed_by && <span>· por {log.changed_by}</span>}
              </div>
              {log.notes && <p className="text-xs text-muted-foreground mt-1">{log.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryTab;
