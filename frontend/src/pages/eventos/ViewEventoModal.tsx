import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays, Camera, Mic, Users, Video, MapPin, Share2, Pencil, Clock,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { statusLabel, statusVariant, type EventRow, useEventGuests, useUpdateGuestStatus } from "./useEventos";
import AddGuestsModal, { type LocalGuest } from "./AddGuestsModal";
import { useAddEventGuests } from "./useEventos";

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

const guestStatusLabel: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  no_response: "Sin respuesta",
};

const guestStatusVariant: Record<string, "warning-soft" | "success-soft" | "destructive-soft" | "secondary-soft"> = {
  pending: "warning-soft",
  confirmed: "success-soft",
  rejected: "destructive-soft",
  cancelled: "destructive-soft",
  no_response: "secondary-soft",
};

const GUEST_TABS = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "confirmed", label: "Confirmados" },
  { key: "no_response", label: "Sin respuesta" },
  { key: "rejected", label: "Rechazados" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRow;
  onEdit: () => void;
}

function shareEvent(e: EventRow, toast: ReturnType<typeof useToast>["toast"]) {
  const text = [
    `📅 Evento: ${e.name}`,
    `Tipo: ${e.event_type}`,
    `Fecha: ${format(new Date(e.date + "T12:00:00"), "d MMM yyyy", { locale: es })}`,
    e.start_time ? `Hora: ${e.start_time.slice(0, 5)}` : null,
    e.location ? `📍 Ubicación: ${e.location}` : null,
    `Estado: ${statusLabel[e.status] ?? e.status}`,
  ].filter(Boolean).join("\n");
  navigator.clipboard.writeText(text);
  toast({ title: "Evento copiado al portapapeles" });
}

const ViewEventoModal = ({ open, onOpenChange, event, onEdit }: Props) => {
  const { toast } = useToast();
  const [guestTab, setGuestTab] = useState("all");
  const [addGuestsOpen, setAddGuestsOpen] = useState(false);
  const { data: guests = [], isLoading: loadingGuests } = useEventGuests(event.id);
  const updateGuestStatus = useUpdateGuestStatus();
  const addEventGuests = useAddEventGuests();

  const Icon = typeIcons[event.event_type] ?? CalendarDays;

  const countByStatus = (status: string) => guests.filter((g) => g.status === status).length;
  const filteredGuests = guestTab === "all" ? guests : guests.filter((g) => g.status === guestTab);

  const handleAddGuests = async (newGuests: LocalGuest[]) => {
    try {
      await addEventGuests.mutateAsync(
        newGuests.map((g) => ({
          event_id: event.id,
          guest_type: g.type,
          creator_id: g.creator_id ?? undefined,
          guest_name: g.guest_name,
        }))
      );
      toast({ title: "Invitados agregados" });
    } catch {
      toast({ title: "Error al agregar invitados", variant: "destructive" });
    }
    setAddGuestsOpen(false);
  };

  const existingCreatorIds = guests.filter((g) => g.creator_id).map((g) => g.creator_id!);

  const summaryItems = [
    { label: "Total", count: guests.length, className: "text-foreground" },
    { label: "Confirmados", count: countByStatus("confirmed"), className: "text-emerald-600" },
    { label: "Pendientes", count: countByStatus("pending"), className: "text-amber-600" },
    { label: "Rechazados", count: countByStatus("rejected"), className: "text-destructive" },
    { label: "Sin respuesta", count: countByStatus("no_response"), className: "text-muted-foreground" },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <DialogHeader className="p-6 pb-4 pr-12">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <DialogTitle className="text-xl">{event.name}</DialogTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary-soft" className="gap-1">
                    <Icon className="h-3 w-3" />
                    {event.event_type}
                  </Badge>
                  <Badge variant={statusVariant[event.status] ?? "secondary-soft"}>
                    {statusLabel[event.status] ?? event.status}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => shareEvent(event, toast)}>
                  <Share2 className="h-4 w-4 mr-1" />Compartir
                </Button>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-1" />Editar
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <ScrollArea className="flex-1 px-6 pb-6">
            <div className="space-y-5">
              {/* Info card */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{format(new Date(event.date + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}</span>
                  {event.start_time && (
                    <span className="text-muted-foreground">· {event.start_time.slice(0, 5)}{event.end_time ? ` - ${event.end_time.slice(0, 5)}` : ""}</span>
                  )}
                </div>
                {event.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{formatDistanceToNow(new Date(event.date + "T12:00:00"), { addSuffix: true, locale: es })}</span>
                </div>
              </div>

              {/* Description / Notes */}
              {(event.description || event.notes) && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Descripción</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {event.description || event.notes}
                  </p>
                </div>
              )}

              {/* Guest summary */}
              <div className="flex flex-wrap gap-4 rounded-lg border p-3">
                {summaryItems.map((s) => (
                  <div key={s.label} className="text-center min-w-[60px]">
                    <p className={`text-lg font-bold ${s.className}`}>{s.count}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Guests section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold">Invitados</h4>
                    <p className="text-xs text-muted-foreground">Gestiona el estado y horarios de llegada</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setAddGuestsOpen(true)}>
                    <Users className="h-4 w-4 mr-1" />Agregar Invitados
                  </Button>
                </div>

                {/* Tabs */}
                <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
                  {GUEST_TABS.map((tab) => {
                    const count = tab.key === "all" ? guests.length : countByStatus(tab.key);
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setGuestTab(tab.key)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          guestTab === tab.key
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Guest list */}
                {loadingGuests ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
                ) : filteredGuests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                    <Users className="h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No hay invitados con este estado</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredGuests.map((g) => {
                      const name = (g as any).creators?.artistic_name || (g as any).creators?.name || g.guest_name || "Invitado";
                      const photoUrl = (g as any).creators?.profile_photo_url;
                      return (
                        <div key={g.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={photoUrl ?? undefined} />
                              <AvatarFallback className="text-[10px]">
                                {name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{name}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">
                                {g.guest_type === "creator" ? "Creadora" : g.guest_type === "external" ? "Externo" : "Contacto"}
                              </p>
                            </div>
                          </div>
                          <Select
                            value={g.status}
                            onValueChange={(val) => updateGuestStatus.mutate({ id: g.id, status: val })}
                          >
                            <SelectTrigger className="h-7 w-[130px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(guestStatusLabel).map(([k, v]) => (
                                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AddGuestsModal
        open={addGuestsOpen}
        onOpenChange={setAddGuestsOpen}
        onConfirm={handleAddGuests}
        existingCreatorIds={existingCreatorIds}
      />
    </>
  );
};

export default ViewEventoModal;
