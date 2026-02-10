import { useState } from "react";
import { format, isSameMonth, isSameDay, isAfter, startOfToday } from "date-fns";
import { es } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import { Camera, Mic, Users, Video, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EventRow } from "./useEventos";

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera,
  Podcast: Mic,
  Casting: Users,
  Reunion: Video,
  Otro: CalendarDays,
};

interface Props {
  events: EventRow[];
}

const EventosCalendar = ({ events }: Props) => {
  const [month, setMonth] = useState(new Date());
  const today = startOfToday();

  const eventDates = events
    .filter((e) => isSameMonth(new Date(e.date), month))
    .map((e) => new Date(e.date));

  const eventsThisMonth = events.filter((e) => isSameMonth(new Date(e.date), month)).length;

  const upcoming = events
    .filter((e) => isAfter(new Date(e.date), today) || isSameDay(new Date(e.date), today))
    .slice(0, 3);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="md:col-span-2">
            <DayPicker
              mode="single"
              month={month}
              onMonthChange={setMonth}
              locale={es}
              modifiers={{ hasEvent: eventDates }}
              modifiersStyles={{
                hasEvent: {
                  fontWeight: "bold",
                  textDecoration: "underline",
                  textDecorationColor: "hsl(var(--primary))",
                },
              }}
              className="w-full"
              classNames={{
                months: "w-full",
                month: "w-full",
                table: "w-full",
                head_cell: "text-muted-foreground text-xs font-medium w-10",
                cell: "text-center p-0 relative h-9 w-10",
                day: "h-9 w-9 p-0 text-sm rounded-md hover:bg-accent/20",
                day_selected: "bg-primary text-primary-foreground",
                day_today: "bg-accent/20 font-bold",
                nav_button: "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:text-foreground",
                caption: "flex justify-center relative items-center mb-2",
                caption_label: "text-sm font-medium capitalize",
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {eventsThisMonth} eventos este mes
            </p>
          </div>

          {/* Upcoming events */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Próximos eventos</h3>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin eventos próximos</p>
            ) : (
              upcoming.map((e) => {
                const Icon = typeIcons[e.event_type] ?? CalendarDays;
                return (
                  <div key={e.id} className="flex items-start gap-2">
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.date), "d MMM", { locale: es })}
                        {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                      </p>
                    </div>
                    <Badge variant="primary-soft" className="text-[10px] shrink-0">
                      Próximo
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EventosCalendar;
