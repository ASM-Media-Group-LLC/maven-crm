import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  COMPANIES,
  type TicketWithCreator,
} from "./useTickets";

interface Props {
  tickets: TicketWithCreator[];
}

const priorityVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const statusVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  open: "default",
  in_progress: "secondary",
  resolved: "outline",
  closed: "outline",
};

const priorityColor: Record<string, string> = {
  urgent: "text-destructive",
  high: "text-orange-500",
  medium: "text-primary",
  low: "text-muted-foreground",
};

const TicketsList = ({ tickets }: Props) => {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No hay tickets</p>
        <p className="text-sm">Crea un nuevo ticket para comenzar</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((ticket) => {
        const ticketNum = ticket.id.slice(0, 6).toUpperCase();
        const creatorHandle = ticket.creators?.instagram_handle || ticket.creators?.artistic_name || ticket.creators?.name || "—";
        const companyLabel = COMPANIES.find((c) => c.value === ticket.company)?.label;
        const isUrgent = ticket.priority === "urgent";

        return (
          <Card
            key={ticket.id}
            className={`p-4 transition-colors hover:bg-muted/30 ${isUrgent ? "border-destructive/40 bg-destructive/5" : ""}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-mono font-bold ${priorityColor[ticket.priority] || "text-muted-foreground"}`}>
                    #{ticketNum}
                  </span>
                  <h3 className="text-sm font-semibold truncate">{ticket.title}</h3>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Creado por: @{creatorHandle}</span>
                  <span>•</span>
                  <span>
                    Asignado a: {ticket.assigned_to ? `@${ticket.assigned_to}` : "Sin asignar"}
                  </span>
                </div>

                {ticket.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
                )}

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {ticket.created_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(ticket.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                    </span>
                  )}
                  {companyLabel && (
                    <Badge variant="outline" className="text-[10px]">{companyLabel}</Badge>
                  )}
                  <Badge variant={priorityVariant[ticket.priority] || "secondary"} className="text-[10px]">
                    {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                  </Badge>
                  <Badge variant={statusVariant[ticket.status] || "outline"} className="text-[10px]">
                    {STATUS_LABELS[ticket.status] || ticket.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default TicketsList;
