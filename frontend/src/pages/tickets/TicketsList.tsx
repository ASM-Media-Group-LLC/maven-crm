import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { usePermissions } from "@/hooks/usePermissions";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { ArrowUpDown, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type SortKey = "ticket" | "creator" | "priority" | "type" | "status" | "company" | "assigned" | "date";

const getSortValue = (ticket: TicketWithCreator, key: SortKey): string => {
  switch (key) {
    case "ticket": return ticket.title.toLowerCase();
    case "creator": return (ticket.creators?.instagram_handle || ticket.creators?.artistic_name || ticket.creators?.name || "").toLowerCase();
    case "priority": return ticket.priority;
    case "type": return ticket.ticket_type;
    case "status": return ticket.status;
    case "company": return ticket.company || "";
    case "assigned": return ticket.assigned_to || "";
    case "date": return ticket.created_at || "";
    default: return "";
  }
};

const TicketsList = ({ tickets, onView, onEdit, onDelete }: Props) => {
  const f = useFormato();
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const canEditTicket = canAccess("Tickets", "Editar Ticket");
  const canDeleteTicket = canAccess("Tickets", "Eliminar Ticket");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...tickets].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);
    const cmp = aVal.localeCompare(bVal);
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-8 -ml-3 text-xs font-medium" onClick={() => handleSort(sortKeyName)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-border">
        <EmptyState seed="tickets" title={t("tickets.empty.title")} description={t("tickets.empty.description")} />
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label={t("tickets.col.ticket")} sortKeyName="ticket" /></TableHead>
            <TableHead><SortHeader label={t("tickets.creator")} sortKeyName="creator" /></TableHead>
            <TableHead><SortHeader label={t("tickets.priority")} sortKeyName="priority" /></TableHead>
            <TableHead><SortHeader label={t("common.type")} sortKeyName="type" /></TableHead>
            <TableHead><SortHeader label={t("common.status")} sortKeyName="status" /></TableHead>
            <TableHead><SortHeader label={t("common.company")} sortKeyName="company" /></TableHead>
            <TableHead><SortHeader label={t("tickets.assignee")} sortKeyName="assigned" /></TableHead>
            <TableHead><TableHead><SortHeader label={t("tickets.col.created")} sortKeyName="date" /></TableHead></TableHead>
            <TableHead className="sticky right-0 bg-card z-20 text-right">{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((ticket) => {
            const ticketNum = ticket.id.slice(0, 6).toUpperCase();
            const creatorHandle = ticket.creators?.instagram_handle || ticket.creators?.artistic_name || ticket.creators?.name || "—";
            const companyLabel = COMPANIES.find((c) => c.value === ticket.company)?.label || "—";
            const isUrgent = ticket.priority === "urgent";

            return (
              <TableRow
                key={ticket.id}
                className={`cursor-pointer ${isUrgent ? "bg-destructive/5" : ""}`}
                onClick={() => onView(ticket)}
              >
                <TableCell className="min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold ${priorityColor[ticket.priority] || "text-muted-foreground"}`}>
                      #{ticketNum}
                    </span>
                    <span className="text-sm font-medium truncate">{ticket.title}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">@{creatorHandle}</TableCell>
                <TableCell>
                  <Badge variant={priorityVariant[ticket.priority] || "secondary"} className="text-[10px]">
                    {etiquetaDe(PRIORITY_LABEL_KEYS, ticket.priority, t)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {etiquetaDe(TYPE_LABEL_KEYS, ticket.ticket_type, t)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[ticket.status] || "outline"} className="text-[10px]">
                    {etiquetaDe(STATUS_LABEL_KEYS, ticket.status, t)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{companyLabel}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ticket.assigned_to ? `@${ticket.assigned_to}` : t("common.unassigned")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {ticket.created_at ? format(new Date(ticket.created_at), "dd MMM yyyy", { locale: f.fechas }) : "—"}
                </TableCell>
                <TableCell className="sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onView(ticket)}>
                          <Eye className="mr-2 h-4 w-4" />
                          {t("common.viewDetail")}
                        </DropdownMenuItem>
                        {canEditTicket && (
                          <DropdownMenuItem onClick={() => onEdit(ticket)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("common.edit")}
                          </DropdownMenuItem>
                        )}
                        {canDeleteTicket && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(ticket)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default TicketsList;
