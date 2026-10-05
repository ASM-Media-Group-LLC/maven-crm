import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PRIORITY_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  TYPE_LABEL_KEYS,
  COMPANIES,
  etiquetaDe,
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
  const f = useFormato();
  const { t } = useLanguage();
  if (tickets.length === 0) {
    return (
      <EmptyState seed="tickets" title={t("tickets.empty.title")} description={t("tickets.empty.description")} />
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
                  <TooltipContent>{t("common.viewDetail")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(ticket); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("common.edit")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(ticket); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("common.delete")}</TooltipContent>
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
                {etiquetaDe(PRIORITY_LABEL_KEYS, ticket.priority, t)}
              </Badge>
              <Badge variant={statusVariant[ticket.status] || "outline"} className="text-[10px]">
                {etiquetaDe(STATUS_LABEL_KEYS, ticket.status, t)}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {etiquetaDe(TYPE_LABEL_KEYS, ticket.ticket_type, t)}
              </Badge>
              {companyLabel && (
                <Badge variant="outline" className="text-[10px]">{companyLabel}</Badge>
              )}
            </div>

            {ticket.created_at && (
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(ticket.created_at), "dd MMM yyyy", { locale: f.fechas })}
              </span>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default TicketsGrid;
