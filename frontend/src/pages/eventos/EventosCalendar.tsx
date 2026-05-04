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
    .filter((e) => isSameMonth(new Date(e.date + "T12:00:00"), month))
    .map((e) => new Date(e.date + "T12:00:00"));

  const eventsThisMonth = events.filter((e) => isSameMonth(new Date(e.date + "T12:00:00"), month)).length;

  const upcoming = events
    .filter((e) => isAfter(new Date(e.date + "T12:00:00"), today) || isSameDay(new Date(e.date + "T12:00:00"), today))
    .slice(0, 3);

  const goToToday = () => setMonth(new Date());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.9fr] gap-6">
      <Card className="overflow-hidden border-border/80">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold capitalize tracking-tight">
                  {format(month, "MMMM yyyy", { locale: es })}
                </h3>
                <Badge variant="secondary" className="text-[11px] font-semibold tabular-nums px-2.5">
                  {eventsThisMonth} eventos
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Vista mensual de agenda</p>
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
              table: "w-full border-separate border-spacing-y-1.5",
              head_row: "flex w-full",
              head_cell: "text-muted-foreground/70 text-[11px] font-semibold uppercase tracking-wider flex-1 text-center pb-2",
              row: "flex w-full",
              cell: "flex-1 text-center p-0 relative",
              day: cn(
                buttonVariants({ variant: "ghost" }),
                "h-8 w-full p-0 text-sm rounded-xl font-medium aria-selected:opacity-100 transition-all duration-150 hover:scale-[1.03]"
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

      <Card className="overflow-hidden border-border/80">
        <CardContent className="p-4 max-h-[260px] overflow-auto">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-base font-bold tracking-tight">Próximos eventos</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Resumen rápido de los siguientes eventos programados</p>

          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Sin eventos próximos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((e) => {
                const Icon = typeIcons[e.event_type] ?? CalendarDays;
                const eventDate = new Date(e.date + "T12:00:00");
                const eventIsToday = isSameDay(eventDate, today);
                const relativeTime = formatDistanceToNow(eventDate, { locale: es, addSuffix: true });
                const style = getEventTypeStyle(e.event_type);

                return (
                  <div
                    key={e.id}
                    className={cn(
                      "rounded-xl border border-border bg-card p-4 border-l-[3px] transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                      style.border
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center justify-start shrink-0 w-11 pt-0.5">
                        <span className="text-2xl font-bold leading-none tabular-nums">{format(eventDate, "d")}</span>
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mt-1">
                          {format(eventDate, "MMM", { locale: es })}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.iconBg)}>
                                <Icon className={cn("h-4 w-4", style.iconText)} />
                              </div>
                              <p className="text-sm font-semibold truncate">{e.name}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground capitalize ml-10">{relativeTime}</p>
                          </div>

                          <Badge
                            variant={eventIsToday ? "default" : "secondary"}
                            className={cn(
                              "text-[10px] shrink-0 font-semibold",
                              eventIsToday && "bg-primary text-primary-foreground"
                            )}
                          >
                            {eventIsToday ? "Hoy" : "Próximo"}
                          </Badge>
                        </div>

                        <div className="ml-10 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="text-[11px] font-medium text-foreground/90">{e.event_type}</span>
                          {e.start_time && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span>{e.start_time.slice(0, 5)}{e.end_time ? ` - ${e.end_time.slice(0, 5)}` : ""}</span>
                            </div>
                          )}
                          {e.location && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[140px]">{e.location}</span>
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
