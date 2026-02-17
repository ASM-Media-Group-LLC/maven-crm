import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EventosCalendar from "./EventosCalendar";
import EventosFilters from "./EventosFilters";
import EventosTable from "./EventosTable";
import EventosGrid from "./EventosGrid";
import { useEventos, statusLabel, emptyFilters, type EventoFilters } from "./useEventos";

const statusTabs = [
  { value: "", label: "Todos" },
  { value: "upcoming", label: "Próximos" },
  { value: "in_progress", label: "En curso" },
  { value: "completed", label: "Completados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "rescheduled", label: "Reagendados" },
];

const EventosContent = () => {
  const [filters, setFilters] = useState<EventoFilters>(emptyFilters);
  const [view, setView] = useState<"table" | "grid">("table");
  const navigate = useNavigate();

  const { events, allEvents, isLoading } = useEventos(filters);

  const updateFilters = (patch: Partial<EventoFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

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
          <Button variant="outline" onClick={() => navigate("/eventos/nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            Crear Evento
          </Button>
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
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <EventosCalendar events={allEvents} />

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

          <EventosFilters
            filters={filters}
            onChange={updateFilters}
            view={view}
            onViewChange={setView}
            hasActiveFilters={!!(filters.search || filters.type || filters.timeOfDay || filters.dateFrom || filters.dateTo)}
            onClear={() => setFilters(emptyFilters)}
          />

          <p className="text-sm text-muted-foreground">{events.length} eventos</p>

          {view === "table" ? (
            <EventosTable events={events} />
          ) : (
            <EventosGrid events={events} />
          )}
        </div>
      )}
    </main>
  );
};

export default EventosContent;
