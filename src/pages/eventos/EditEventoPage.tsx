import { useParams } from "react-router-dom";
import { useEventDetail } from "./useEventoDetail";
import { useEventGuests, type EventRow } from "./useEventos";
import NuevoEventoForm from "./NuevoEventoForm";
import type { LocalGuest } from "./AddGuestsModal";
import { Skeleton } from "@/components/ui/skeleton";

const EditEventoPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading: loadingEvent } = useEventDetail(id!);
  const { data: guestsData, isLoading: loadingGuests } = useEventGuests(id!);

  if (loadingEvent || loadingGuests) {
    return (
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-lg" />
      </main>
    );
  }

  if (!event) {
    return (
      <main className="flex-1 flex items-center justify-center h-full min-w-0">
        <p className="text-muted-foreground">Evento no encontrado</p>
      </main>
    );
  }

  const existingGuests: LocalGuest[] = (guestsData ?? []).map((g: any) => ({
    type: g.guest_type,
    guest_name: g.guest_name || g.creators?.name || g.creators?.artistic_name || "Sin nombre",
    creator_id: g.creator_id ?? undefined,
    _existing: true,
  }));

  const eventRow: EventRow = {
    ...event,
    guest_count: guestsData?.length ?? 0,
    external_token: (event as any).external_token ?? null,
  };

  return <NuevoEventoForm event={eventRow} existingGuests={existingGuests} />;
};

export default EditEventoPage;
