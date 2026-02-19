import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ticket, Plus } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CreateTicketModal from "./CreateTicketModal";

interface Props {
  creatorId: string;
}

const priorityVariant: Record<string, "destructive-soft" | "warning-soft" | "secondary-soft" | "primary-soft"> = {
  urgent: "destructive-soft",
  high: "warning-soft",
  medium: "secondary-soft",
  low: "primary-soft",
};

const statusLabel: Record<string, string> = {
  open: "Abierto",
  in_progress: "En Progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const statusVariant: Record<string, "primary-soft" | "warning-soft" | "success-soft" | "secondary-soft"> = {
  open: "primary-soft",
  in_progress: "warning-soft",
  resolved: "success-soft",
  closed: "secondary-soft",
};

const typeLabel: Record<string, string> = {
  complaint: "Queja",
  technical: "Técnico",
  billing: "Facturación",
  content: "Contenido",
  general: "General",
};

const TicketsTabContent = ({ creatorId }: Props) => {
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
              Tickets de Customer Service
            </CardTitle>
            <CardDescription>Tickets relacionados con esta creadora</CardDescription>
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo Ticket
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando tickets...</p>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 py-16 px-6">
              <Ticket className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h4 className="font-semibold text-muted-foreground">No hay tickets registrados</h4>
              <p className="text-sm text-muted-foreground/70 mt-1">Crea un ticket para comenzar</p>
              <Button variant="outline" className="mt-4" onClick={() => setModalOpen(true)}>
                Crear Primer Ticket
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium truncate">{t.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{typeLabel[t.ticket_type] ?? t.ticket_type}</span>
                      {t.company && <span>· {t.company}</span>}
                      <span>· {format(new Date(t.created_at), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Badge variant={priorityVariant[t.priority] ?? "secondary-soft"} className="capitalize">
                      {t.priority}
                    </Badge>
                    <Badge variant={statusVariant[t.status] ?? "secondary-soft"}>
                      {statusLabel[t.status] ?? t.status}
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
