import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Camera, Mic, Users, Video, CalendarDays, MapPin,
  MoreHorizontal, Eye, Pencil, Share2, Trash2, Lock, ExternalLink, ClipboardCopy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { statusLabel, statusVariant, projectTypeColor, type EventRow } from "./useEventos";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import ViewEventoModal from "./ViewEventoModal";
import CloseEventoModal from "./CloseEventoModal";
import DeleteEventoDialog from "./DeleteEventoDialog";

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

function copySharelink(e: EventRow, toast: ReturnType<typeof useToast>["toast"]) {
  if (!e.external_token) {
    toast({ title: "No hay sharelink disponible", variant: "destructive" });
    return;
  }
  const link = `${getPublicBaseUrl()}/eventos/share/${e.external_token}`;
  navigator.clipboard.writeText(link);
  toast({ title: "Sharelink copiado al portapapeles" });
}

function copyResumen(e: EventRow, toast: ReturnType<typeof useToast>["toast"]) {
  const text = [
    `📅 Evento: ${e.name}`,
    `Tipo: ${e.event_type}`,
    `Fecha: ${format(new Date(e.date + "T12:00:00"), "d MMM yyyy", { locale: es })}`,
    e.location ? `📍 Ubicación: ${e.location}` : null,
    `Estado: ${statusLabel[e.status] ?? e.status}`,
  ].filter(Boolean).join("\n");
  navigator.clipboard.writeText(text);
  toast({ title: "Resumen copiado al portapapeles" });
}

interface Props {
  events: EventRow[];
}

const EventosGrid = ({ events }: Props) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openModal = (e: EventRow, setter: (v: boolean) => void) => {
    setSelected(e);
    setter(true);
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {events.map((e) => {
          const Icon = typeIcons[e.event_type] ?? CalendarDays;
          return (
            <Card
              key={e.id}
              className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
              onClick={() => openModal(e, setViewOpen)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.event_type}</p>
                    {e.project_type && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${projectTypeColor[e.project_type]?.bg ?? ""} ${projectTypeColor[e.project_type]?.text ?? ""}`}>
                        {e.project_type}
                      </span>
                    )}
                  </div>
                  <div onClick={(ev) => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openModal(e, setViewOpen)}>
                          <Eye className="mr-2 h-4 w-4" />Ver detalles
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/eventos/${e.id}/editar`)}>
                          <Pencil className="mr-2 h-4 w-4" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copySharelink(e, toast)}>
                          <ExternalLink className="mr-2 h-4 w-4" />Copiar sharelink
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyResumen(e, toast)}>
                          <ClipboardCopy className="mr-2 h-4 w-4" />Copiar resumen
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openModal(e, setCloseOpen)}>
                          <Lock className="mr-2 h-4 w-4" />Cerrar evento
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => openModal(e, setDeleteOpen)}>
                          <Trash2 className="mr-2 h-4 w-4" />Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(e.date + "T12:00:00"), "d MMM yyyy", { locale: es })}
                    {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                  </p>
                  {e.location && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{e.location}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <Badge variant={statusVariant[e.status] ?? "secondary-soft"}>
                    {statusLabel[e.status] ?? e.status}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {e.guest_count}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {events.length === 0 && (
          <p className="col-span-full py-12 text-center text-muted-foreground">
            No se encontraron eventos.
          </p>
        )}
      </div>

      {selected && (
        <>
          <ViewEventoModal
            open={viewOpen}
            onOpenChange={setViewOpen}
            event={selected}
            onEdit={() => { setViewOpen(false); navigate(`/eventos/${selected.id}/editar`); }}
          />
          <CloseEventoModal open={closeOpen} onOpenChange={setCloseOpen} event={selected} />
          <DeleteEventoDialog open={deleteOpen} onOpenChange={setDeleteOpen} event={selected} />
        </>
      )}
    </>
  );
};

export default EventosGrid;
