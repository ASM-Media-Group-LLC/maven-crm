import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Camera, Mic, Users, Video, CalendarDays, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusLabel, statusVariant, type EventRow } from "./useEventos";

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

interface Props {
  events: EventRow[];
}

const EventosGrid = ({ events }: Props) => (
  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {events.map((e) => {
      const Icon = typeIcons[e.event_type] ?? CalendarDays;
      return (
        <Card
          key={e.id}
          className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground">{e.event_type}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {format(new Date(e.date), "d MMM yyyy", { locale: es })}
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
);

export default EventosGrid;
