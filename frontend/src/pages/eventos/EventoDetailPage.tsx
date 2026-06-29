import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, CalendarDays, Camera, Mic, Users, Video, MapPin, Pencil, Share2, Lock, Clock, PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { statusLabel, statusVariant } from "./useEventos";
import { useEventDetail } from "./useEventoDetail";
import CloseEventoModal from "./CloseEventoModal";
import GuestsTab from "./detail/GuestsTab";
import ChecklistTab from "./detail/ChecklistTab";
import HistoryTab from "./detail/HistoryTab";
import MetricsTab from "./detail/MetricsTab";
import LinksTab from "./detail/LinksTab";
import { useState } from "react";

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

const EventoDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  // Consistencia con la tabla (que ya gatea "Editar Evento"): el botón Editar del
  // detalle ahora honra el mismo permiso. El subtab Enlaces se gatea aparte.
  const canEdit = canAccess("Eventos", "Editar Evento");
  const canSeeLinks = canAccess("Eventos", "Enlaces");
  const { data: event, isLoading } = useEventDetail(id!);
  const [closeOpen, setCloseOpen] = useState(false);

  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center h-full min-w-0">
        <p className="text-muted-foreground">Evento no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/eventos")}>
          <ArrowLeft className="mr-2 h-4 w-4" />Volver a eventos
        </Button>
      </main>
    );
  }

  const Icon = typeIcons[event.event_type] ?? CalendarDays;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Fixed header */}
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/eventos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold truncate">{event.name}</h1>
              <Badge variant="secondary-soft" className="gap-1">
                <Icon className="h-3 w-3" />
                {event.event_type}
              </Badge>
              <Badge variant={statusVariant[event.status] ?? "secondary-soft"}>
                {statusLabel[event.status] ?? event.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {format(new Date(event.date + "T12:00:00"), "d MMM yyyy", { locale: es })}
              </span>
              {event.start_time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {event.start_time.slice(0, 5)}
                  {event.end_time ? ` - ${event.end_time.slice(0, 5)}` : ""}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {event.location}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {(event as any).video_call_room_id && (
              <Button
                size="sm"
                onClick={() => {
                  const roomId = (event as any).video_call_room_id;
                  window.open(`/call/${encodeURIComponent(roomId)}?name=${encodeURIComponent(event.name)}`, `call-${roomId}`, "noopener");
                }}
              >
                <PhoneCall className="h-4 w-4 mr-1" />Unirse a la llamada
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/eventos/${id}/editar`)}>
                <Pencil className="h-4 w-4 mr-1" />Editar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setCloseOpen(true)}>
              <Lock className="h-4 w-4 mr-1" />Cerrar
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable content with tabs */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="guests" className="space-y-4">
          <TabsList>
            <TabsTrigger value="guests">Invitados</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="metrics">Métricas</TabsTrigger>
            {canSeeLinks && <TabsTrigger value="links">Enlaces</TabsTrigger>}
          </TabsList>

          <TabsContent value="guests">
            <GuestsTab eventId={event.id} />
          </TabsContent>
          <TabsContent value="checklist">
            <ChecklistTab eventId={event.id} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab eventId={event.id} />
          </TabsContent>
          <TabsContent value="metrics">
            <MetricsTab eventId={event.id} />
          </TabsContent>
          {canSeeLinks && (
          <TabsContent value="links">
            <LinksTab
              eventId={event.id}
              internalToken={(event as any).internal_token}
              externalToken={(event as any).external_token}
              externalLinkExpiresAt={(event as any).external_link_expires_at}
            />
          </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Modals */}
      <CloseEventoModal open={closeOpen} onOpenChange={setCloseOpen} event={event as any} />
    </main>
  );
};

export default EventoDetailPage;
