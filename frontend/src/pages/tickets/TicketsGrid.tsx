import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
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
  high: "text-warning",
  medium: "text-primary",
  low: "text-muted-foreground",
};

const TicketsGrid = ({ tickets, onView, onEdit, onDelete }: Props) => {
  if (tickets.length === 0) {
    return (
      <EmptyState seed="tickets" title="No hay tickets" description="Crea un nuevo ticket para comenzar" />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {tickets.map((ticket) => {
        const ticketNum = ticket.id.slice(0, 6).toUpperCase();
        const creatorHandle = ticket.creators?.instagram_handle || ticket.creators?.artistic_name || ticket.creators?.name || "—";
        const companyLabel = COMPANIES.find((c) => c.value === ticket.company)?.label;
        const isUrgent = ticket.priority === "urgent";

        return (
          <Card
            key={ticket.id}
            className={`p-4 transition-colors hover:bg-muted/30 cursor-pointer flex flex-col gap-2 ${isUrgent ? "border-destructive/40 bg-destructive/5" : ""}`}
            onClick={() => onView(ticket)}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-mono font-bold ${priorityColor[ticket.priority] || "text-muted-foreground"}`}>
                #{ticketNum}
              </span>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onView(ticket); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ver detalle</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(ticket); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Editar</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(ticket); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Eliminar</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <h3 className="text-sm font-semibold line-clamp-2">{ticket.title}</h3>

            <p className="text-xs text-muted-foreground">@{creatorHandle}</p>

            {ticket.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
            )}

            <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
              <Badge variant={priorityVariant[ticket.priority] || "secondary"} className="text-[10px]">
                {PRIORITY_LABELS[ticket.priority] || ticket.priority}
              </Badge>
              <Badge variant={statusVariant[ticket.status] || "outline"} className="text-[10px]">
                {STATUS_LABELS[ticket.status] || ticket.status}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {TYPE_LABELS[ticket.ticket_type] || ticket.ticket_type}
              </Badge>
              {companyLabel && (
                <Badge variant="outline" className="text-[10px]">{companyLabel}</Badge>
              )}
            </div>

            {ticket.created_at && (
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(ticket.created_at), "dd MMM yyyy", { locale: es })}
              </span>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default TicketsGrid;
