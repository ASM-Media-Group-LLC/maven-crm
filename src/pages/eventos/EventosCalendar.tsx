import { useState } from "react";
import { format, isSameMonth, isSameDay, isAfter, startOfToday, formatDistanceToNow, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import { Camera, Mic, Users, Video, CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
    .slice(0, 4);

  const goToToday = () => setMonth(new Date());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar Card */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold capitalize">
              {format(month, "MMMM yyyy", { locale: es })}
            </h3>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoy
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* DayPicker */}
          <DayPicker
            mode="single"
            month={month}
            onMonthChange={setMonth}
            locale={es}
            modifiers={{ hasEvent: eventDates }}
            modifiersClassNames={{
              hasEvent: "calendar-day-has-event",
            }}
            className="w-full pointer-events-auto"
            classNames={{
              months: "w-full",
              month: "w-full",
              caption: "hidden",
              table: "w-full",
              head_row: "flex w-full",
              head_cell: "text-muted-foreground text-xs font-medium flex-1 text-center",
              row: "flex w-full mt-1",
              cell: "flex-1 text-center p-0 relative",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-10 w-full p-0 text-sm rounded-md font-normal aria-selected:opacity-100"
              ),
              day_selected: "bg-primary text-primary-foreground hover:bg-primary",
              day_today: "bg-muted text-foreground font-bold",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
              nav: "hidden",
            }}
          />

          {/* Footer */}
          <div className="mt-3 rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{eventsThisMonth}</span> eventos este mes
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events Card */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-4">Próximos eventos</h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin eventos próximos</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((e) => {
                const Icon = typeIcons[e.event_type] ?? CalendarDays;
                const eventDate = new Date(e.date);
                const relativeTime = formatDistanceToNow(eventDate, { locale: es, addSuffix: true });

                return (
                  <div key={e.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{e.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{relativeTime}</p>
                        </div>
                      </div>
                      <Badge variant="primary-soft" className="text-[10px] shrink-0">
                        Próximo
                      </Badge>
                    </div>
                    {e.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{e.location}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EventosCalendar;
