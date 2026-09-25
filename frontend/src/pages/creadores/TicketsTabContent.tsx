import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Plus } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CreateTicketModal from "./CreateTicketModal";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  creatorId: string;
}

const priorityVariant: Record<string, "destructive-soft" | "warning-soft" | "secondary-soft" | "primary-soft"> = {
  urgent: "destructive-soft",
  high: "warning-soft",
  medium: "secondary-soft",
  low: "primary-soft",
};

// Las llaves son los valores guardados en `tickets`; acá solo se elige la etiqueta.
const priorityLabel: Record<string, TranslationKey> = {
  urgent: "tickets.priority.urgent",
  high: "tickets.priority.high",
  medium: "tickets.priority.medium",
  low: "tickets.priority.low",
};

const statusLabel: Record<string, TranslationKey> = {
  open: "tickets.status.open",
  in_progress: "cr.inProgressCap",
  resolved: "tickets.status.resolved",
  closed: "tickets.status.closed",
};

const statusVariant: Record<string, "primary-soft" | "warning-soft" | "success-soft" | "secondary-soft"> = {
  open: "primary-soft",
  in_progress: "warning-soft",
  resolved: "success-soft",
  closed: "secondary-soft",
};

const typeLabel: Record<string, TranslationKey> = {
  complaint: "tickets.type.complaint",
  technical: "tickets.type.technical",
  billing: "tickets.type.billing",
  content: "tickets.type.content",
  general: "tickets.type.general",
};

const TicketsTabContent = ({ creatorId }: Props) => {
  const { t } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets", creatorId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Ticket className="h-5 w-5" />
              {t("creadores.tickets.title")}
            </CardTitle>
            <CardDescription>{t("creadores.tickets.subtitle")}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("creadores.tickets.new")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("tickets.loadingTickets")}</p>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<Ticket className="h-8 w-8 text-muted-foreground" />}
              title={t("creadores.tickets.empty")}
              description={t("creadores.tickets.emptyDesc")}
              action={
                <Button variant="outline" onClick={() => setModalOpen(true)}>
                  {t("creadores.tickets.createFirst")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {tickets.map((tk: any) => (
                <div
                  key={tk.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium truncate">{tk.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{typeLabel[tk.ticket_type] ? t(typeLabel[tk.ticket_type]) : tk.ticket_type}</span>
                      {tk.company && <span>· {tk.company}</span>}
                      <span>· {format(new Date(tk.created_at), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Badge variant={priorityVariant[tk.priority] ?? "secondary-soft"} className="capitalize">
                      {priorityLabel[tk.priority] ? t(priorityLabel[tk.priority]) : tk.priority}
                    </Badge>
                    <Badge variant={statusVariant[tk.status] ?? "secondary-soft"}>
                      {statusLabel[tk.status] ? t(statusLabel[tk.status]) : tk.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTicketModal creatorId={creatorId} open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
};

export default TicketsTabContent;
