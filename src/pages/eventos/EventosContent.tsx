import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import EventosCalendar from "./EventosCalendar";
import EventosFilters from "./EventosFilters";
import EventosTable from "./EventosTable";
import EventosGrid from "./EventosGrid";
import { useEventos, statusLabel, emptyFilters, PROJECT_TYPES, type EventoFilters } from "./useEventos";
import { supabase } from "@/integrations/supabase/client";

const statusTabs = [
  { value: "", label: "Todos" },
  { value: "upcoming", label: "Próximos" },
  { value: "in_progress", label: "En curso" },
  { value: "completed", label: "Completados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "rescheduled", label: "Reagendados" },
];

const projectTabs = [
  { value: "", label: "Todos" },
  ...PROJECT_TYPES.map((p) => ({ value: p, label: p })),
];

const EventosContent = () => {
  const [filters, setFilters] = useState<EventoFilters>(emptyFilters);
  const [view, setView] = useState<"table" | "grid">("table");
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!statsCollapsed && e.currentTarget.scrollTop > 40) {
      setStatsCollapsed(true);
    }
  }, [statsCollapsed]);

  const { events, allEvents, isLoading } = useEventos(filters);

  // Agenda share
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLoading, setShareLoading] = useState(false);

  const handleShareAgenda = async () => {
    setShareLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Check existing token
      const { data: existing } = await supabase
        .from("agenda_share_tokens" as any)
        .select("token")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      let token: string;
      if (existing && existing.length > 0) {
        token = (existing[0] as any).token;
      } else {
        const { data: inserted, error } = await supabase
          .from("agenda_share_tokens" as any)
          .insert({ created_by: user.id } as any)
          .select("token")
          .single();
        if (error) throw error;
        token = (inserted as any).token;
      }

      const link = `${getPublicBaseUrl()}/shared/agenda/${token}`;
      setShareLink(link);
      setShareOpen(true);
    } catch (err: any) {
      toast({ title: "Error generando enlace", description: err.message, variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast({ title: "Enlace copiado al portapapeles" });
  };

  const updateFilters = (patch: Partial<EventoFilters>) => {
    setStatsCollapsed(false);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Eventos</h1>
            <p className="text-sm text-muted-foreground">
              Gestiona tus eventos y sesiones de contenido
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShareAgenda} disabled={shareLoading}>
              <Share2 className="mr-2 h-4 w-4" />
              Compartir Agenda
            </Button>
            <Button onClick={() => navigate("/eventos/nuevo")}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Evento
            </Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            <Skeleton className="h-60 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      ) : (
        <>
          <div className={cn(
            "transition-all duration-300 overflow-hidden shrink-0 px-6 pt-6",
            statsCollapsed ? "max-h-0 opacity-0 py-0" : "max-h-[500px] opacity-100 pb-4"
          )}>
            <EventosCalendar events={allEvents} />
          </div>

          <div className="flex-1 overflow-auto p-6 pt-0 space-y-4" onScroll={handleScroll}>

          <div className="flex flex-wrap items-center gap-3">
            {/* Project type tabs */}
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {projectTabs.map((tab) => (
                <Button
                  key={tab.value}
                  variant={filters.projectType === tab.value ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => updateFilters({ projectType: tab.value })}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {/* Status tabs */}
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {statusTabs.map((tab) => (
                <Button
                  key={tab.value}
                  variant={filters.status === tab.value ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => updateFilters({ status: tab.value })}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          <EventosFilters
            filters={filters}
            onChange={updateFilters}
            view={view}
            onViewChange={setView}
            hasActiveFilters={!!(filters.search || filters.type || filters.timeOfDay || filters.dateFrom || filters.dateTo)}
            onClear={() => setFilters(emptyFilters)}
          />

          <p className="text-sm text-muted-foreground">{events.length} eventos</p>
          {view === "table" ? <EventosTable events={events} /> : <EventosGrid events={events} />}
          </div>
        </>
      )}

      {/* Share Agenda Modal */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartir Agenda</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Comparte este enlace para dar acceso de solo lectura a la agenda de eventos próximos.
          </p>
          <div className="flex gap-2">
            <Input value={shareLink} readOnly className="flex-1" />
            <Button onClick={copyShareLink}>Copiar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default EventosContent;
