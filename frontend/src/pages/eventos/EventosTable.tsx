import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpDown, Camera, Mic, Users, Video, CalendarDays,
  MoreHorizontal, Eye, Pencil, Share2, Trash2, Lock, ExternalLink, ClipboardCopy,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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

type SortKey = "name" | "event_type" | "project_type" | "date" | "location" | "status" | "guest_count";

interface Props {
  events: EventRow[];
}

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

const EventosTable = ({ events }: Props) => {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(true);
  const { toast } = useToast();

  const [selected, setSelected] = useState<EventRow | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const openModal = (e: EventRow, setter: (v: boolean) => void) => {
    setSelected(e);
    setter(true);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...events].sort((a, b) => {
    let va: string | number = "";
    let vb: string | number = "";
    switch (sortKey) {
      case "name": va = a.name; vb = b.name; break;
      case "event_type": va = a.event_type; vb = b.event_type; break;
      case "project_type": va = a.project_type ?? ""; vb = b.project_type ?? ""; break;
      case "date": va = a.date; vb = b.date; break;
      case "location": va = a.location ?? ""; vb = b.location ?? ""; break;
      case "status": va = a.status; vb = b.status; break;
      case "guest_count": return sortAsc ? a.guest_count - b.guest_count : b.guest_count - a.guest_count;
    }
    return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <>
      <div className="max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Evento" col="name" /></TableHead>
            <TableHead><SortHeader label="Tipo" col="event_type" /></TableHead>
            <TableHead><SortHeader label="Proyecto" col="project_type" /></TableHead>
            <TableHead><SortHeader label="Fecha" col="date" /></TableHead>
            <TableHead><SortHeader label="Ubicación" col="location" /></TableHead>
            <TableHead><SortHeader label="Estado" col="status" /></TableHead>
            <TableHead>Notas</TableHead>
            <TableHead><SortHeader label="Invitados" col="guest_count" /></TableHead>
            <TableHead className="sticky right-0 bg-card z-20">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((e) => {
            const Icon = typeIcons[e.event_type] ?? CalendarDays;
            return (
              <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(`/eventos/${e.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-sm">{e.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{e.event_type}</TableCell>
                <TableCell>
                  {e.project_type ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${projectTypeColor[e.project_type]?.bg ?? ""} ${projectTypeColor[e.project_type]?.text ?? ""}`}>
                      {e.project_type}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    {format(new Date(e.date + "T12:00:00"), "d MMM yyyy", { locale: es })}
                    {new Date(e.date + "T12:00:00") < new Date(new Date().toDateString()) && e.status !== "completed" && e.status !== "cancelled" && (
                      <Badge variant="secondary-soft" className="text-[9px] px-1 py-0">Pasado</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.location || "—"}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[e.status] ?? "secondary-soft"}>
                    {statusLabel[e.status] ?? e.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                  {e.notes || "—"}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-sm">
                    <Users className="h-3.5 w-3.5" />
                    {e.guest_count}
                  </span>
                </TableCell>
                <TableCell className="sticky right-0 bg-card" onClick={(ev) => ev.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
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
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                No se encontraron eventos.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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

export default EventosTable;
