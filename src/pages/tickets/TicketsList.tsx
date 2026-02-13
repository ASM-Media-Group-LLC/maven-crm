import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  COMPANIES,
  type TicketWithCreator,
} from "./useTickets";

interface Props {
  tickets: TicketWithCreator[];
  onView: (ticket: TicketWithCreator) => void;
  onEdit: (ticket: TicketWithCreator) => void;
  onDelete: (ticket: TicketWithCreator) => void;
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

const TicketsList = ({ tickets, onView, onEdit, onDelete }: Props) => {
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
            className={`p-4 transition-colors hover:bg-muted/30 cursor-pointer ${isUrgent ? "border-destructive/40 bg-destructive/5" : ""}`}
            onClick={() => onView(ticket)}
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

              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onView(ticket); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ver detalle</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onEdit(ticket); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Editar</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(ticket); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Eliminar</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default TicketsList;
