import { useState } from "react";
import { format, isSameMonth, isSameDay, isAfter, startOfToday, formatDistanceToNow, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { DayPicker } from "react-day-picker";
import { Camera, Mic, Users, Video, CalendarDays, ChevronLeft, ChevronRight, MapPin, Clock, Sparkles } from "lucide-react";
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

const getEventTypeStyle = (type: string) => {
  const styles: Record<string, { border: string; iconBg: string; iconText: string }> = {
    Shooting: { border: "border-l-primary", iconBg: "bg-primary/10", iconText: "text-primary" },
    Podcast: { border: "border-l-accent", iconBg: "bg-accent/10", iconText: "text-accent" },
    Casting: { border: "border-l-success", iconBg: "bg-success/10", iconText: "text-success" },
    Reunion: { border: "border-l-warning", iconBg: "bg-warning/10", iconText: "text-warning" },
    Otro: { border: "border-l-muted-foreground", iconBg: "bg-muted", iconText: "text-muted-foreground" },
  };
  return styles[type] || styles.Otro;
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
      <Card className="lg:col-span-2 overflow-hidden">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold capitalize tracking-tight">
                {format(month, "MMMM yyyy", { locale: es })}
              </h3>
              <Badge variant="secondary" className="text-xs font-semibold tabular-nums">
                {eventsThisMonth} eventos
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="rounded-full text-xs font-medium h-8 px-3" onClick={goToToday}>
                Hoy
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setMonth(addMonths(month, 1))}>
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
              table: "w-full border-separate border-spacing-y-1",
              head_row: "flex w-full",
              head_cell: "text-muted-foreground text-[11px] font-semibold uppercase tracking-wider flex-1 text-center pb-2",
              row: "flex w-full",
              cell: "flex-1 text-center p-0 relative",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-9 w-full p-0 text-sm rounded-lg font-medium aria-selected:opacity-100 transition-all duration-150 hover:scale-105"
              ),
              day_selected: "bg-primary text-primary-foreground hover:bg-primary shadow-md",
              day_today: "calendar-day-today",
              day_outside: "text-muted-foreground opacity-40",
              day_disabled: "text-muted-foreground opacity-40",
              nav: "hidden",
            }}
          />

        </CardContent>
      </Card>

      {/* Upcoming Events Card */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-bold tracking-tight">Próximos eventos</h3>
          </div>
          <div className="h-0.5 w-12 rounded-full bg-gradient-to-r from-primary to-accent mb-5" />

          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Sin eventos próximos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((e) => {
                const Icon = typeIcons[e.event_type] ?? CalendarDays;
                const eventDate = new Date(e.date);
                const isToday = isSameDay(eventDate, today);
                const relativeTime = formatDistanceToNow(eventDate, { locale: es, addSuffix: true });
                const style = getEventTypeStyle(e.event_type);

                return (
                  <div
                    key={e.id}
                    className={cn(
                      "rounded-xl border border-border bg-card p-3 space-y-2 border-l-[3px] transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                      style.border
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Date column */}
                      <div className="flex flex-col items-center justify-center shrink-0 w-10">
                        <span className="text-lg font-bold leading-none tabular-nums">{format(eventDate, "d")}</span>
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                          {format(eventDate, "MMM", { locale: es })}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", style.iconBg)}>
                              <Icon className={cn("h-3.5 w-3.5", style.iconText)} />
                            </div>
                            <p className="text-sm font-semibold truncate">{e.name}</p>
                          </div>
                          <Badge
                            variant={isToday ? "default" : "secondary"}
                            className={cn(
                              "text-[10px] shrink-0 font-semibold",
                              isToday && "bg-primary text-primary-foreground"
                            )}
                          >
                            {isToday ? "Hoy" : "Próximo"}
                          </Badge>
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1 capitalize">{relativeTime}</p>

                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {e.start_time && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span>{e.start_time.slice(0, 5)}{e.end_time ? ` - ${e.end_time.slice(0, 5)}` : ""}</span>
                            </div>
                          )}
                          {e.location && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[120px]">{e.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
