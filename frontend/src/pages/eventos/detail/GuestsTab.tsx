import { useState } from "react";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEventGuestsExtended, useUpdateGuestStatusExtended } from "../useEventoDetail";
import AddGuestsModal, { type LocalGuest } from "../AddGuestsModal";
import { useAddEventGuests } from "../useEventos";

const guestStatusLabel: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  attended: "Asistió",
  no_show: "No asistió",
};

const guestStatusVariant: Record<string, "warning-soft" | "success-soft" | "destructive-soft" | "secondary-soft" | "primary-soft"> = {
  pending: "warning-soft",
  confirmed: "success-soft",
  cancelled: "destructive-soft",
  attended: "primary-soft",
  no_show: "secondary-soft",
};

const STATUS_TABS = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "confirmed", label: "Confirmados" },
  { key: "cancelled", label: "Cancelados" },
  { key: "attended", label: "Asistieron" },
  { key: "no_show", label: "No asistieron" },
];

interface Props {
  eventId: string;
}

const GuestsTab = ({ eventId }: Props) => {
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const { data: guests = [], isLoading } = useEventGuestsExtended(eventId);
  const updateStatus = useUpdateGuestStatusExtended();
  const addGuests = useAddEventGuests();

  const countByStatus = (s: string) => guests.filter((g: any) => g.status === s).length;
  const filtered = tab === "all" ? guests : guests.filter((g: any) => g.status === tab);

  const handleAddGuests = async (newGuests: LocalGuest[]) => {
    try {
      await addGuests.mutateAsync(
        newGuests.map((g) => ({
          event_id: eventId,
          guest_type: g.type,
          creator_id: g.creator_id ?? undefined,
          guest_name: g.guest_name,
        }))
      );
      toast({ title: "Invitados agregados" });
    } catch {
      toast({ title: "Error al agregar invitados", variant: "destructive" });
    }
    setAddOpen(false);
  };

  const existingCreatorIds = guests.filter((g: any) => g.creator_id).map((g: any) => g.creator_id!);

  // Summary cards
  const summaryItems = [
    { label: "Total", count: guests.length },
    { label: "Confirmados", count: countByStatus("confirmed") },
    { label: "Pendientes", count: countByStatus("pending") },
    { label: "Cancelados", count: countByStatus("cancelled") },
    { label: "Asistieron", count: countByStatus("attended") },
    { label: "No asistieron", count: countByStatus("no_show") },
  ];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
        {summaryItems.map((s) => (
          <div key={s.label} className="text-center min-w-[60px]">
            <p className="text-lg font-bold">{s.count}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          {STATUS_TABS.map((t) => {
            const count = t.key === "all" ? guests.length : countByStatus(t.key);
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Users className="h-4 w-4 mr-1" />Agregar
        </Button>
      </div>

      {/* Guest list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No hay invitados con este estado</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((g: any) => {
            const name = g.creators?.artistic_name || g.creators?.name || g.guest_name || "Invitado";
            const photoUrl = g.creators?.profile_photo_url;
            return (
              <div key={g.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={photoUrl ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="capitalize">
                        {g.guest_type === "creator" ? "Creadora" : g.guest_type === "external" ? "Externo" : "Contacto"}
                      </span>
                      {g.email && <span>· {g.email}</span>}
                      {g.phone && <span>· {g.phone}</span>}
                    </div>
                  </div>
                  {g.cancellation_reason && g.status === "cancelled" && (
                    <span className="text-[10px] text-destructive truncate max-w-[150px]" title={g.cancellation_reason}>
                      {g.cancellation_reason}
                    </span>
                  )}
                </div>
                <Select
                  value={g.status}
                  onValueChange={(val) => updateStatus.mutate({ id: g.id, status: val })}
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

      <AddGuestsModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onConfirm={handleAddGuests}
        existingCreatorIds={existingCreatorIds}
      />
    </div>
  );
};

export default GuestsTab;
