import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  isSameDay,
  isToday,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays, MapPin, Clock, ChevronLeft, ChevronRight,
  Users, Camera, Mic, Video, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface AgendaGuest {
  guest_name: string;
  guest_type: string;
  status: string;
  profile_photo_url: string | null;
  instagram_handle: string | null;
}

interface AgendaEvent {
  id: string;
  name: string;
  event_type: string;
  project_type: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  status: string;
  guests: AgendaGuest[];
}

const PROJECT_COLORS: Record<string, { bg: string; dot: string; text: string; border: string }> = {
  Ora: { bg: "bg-blue-500/15", dot: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", border: "border-l-blue-500" },
  Kash: { bg: "bg-purple-500/15", dot: "bg-purple-500", text: "text-purple-700 dark:text-purple-300", border: "border-l-purple-500" },
  Trafix: { bg: "bg-amber-500/15", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", border: "border-l-amber-500" },
  Unlok: { bg: "bg-emerald-500/15", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", border: "border-l-emerald-500" },
};

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

const getTypeColor = (type: string) => {
  const m: Record<string, string> = {
    Shooting: "border-l-primary", Podcast: "border-l-accent",
    Casting: "border-l-success", Reunion: "border-l-warning", Otro: "border-l-muted-foreground",
  };
  return m[type] || m.Otro;
};

const WEEKDAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const PROJECT_TABS = ["Todos", "Ora", "Kash", "Trafix", "Unlok"];

const SharedAgendaPage = () => {
  const { token } = useParams<{ token: string }>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [projectFilter, setProjectFilter] = useState("Todos");

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["shared-agenda", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_agenda_by_share_token", { p_token: token! });
      if (error) throw error;
      return (data ?? []) as unknown as AgendaEvent[];
    },
    enabled: !!token,
  });

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (projectFilter !== "Todos" && e.project_type !== projectFilter) return false;
      return true;
    });
  }, [events, projectFilter]);

  const eventDatesMap = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    filteredEvents.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    });
    return map;
  }, [filteredEvents]);

  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return filteredEvents
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }, [filteredEvents]);

  const selectedDayEvents = selectedDate
    ? filteredEvents.filter((e) => isSameDay(new Date(e.date), selectedDate))
    : [];

  // Group upcoming by date
  const groupedUpcoming = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    upcomingEvents.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return Array.from(map.entries());
  }, [upcomingEvents]);

  const eventsToDisplay = selectedDate
    ? [{ date: format(selectedDate, "yyyy-MM-dd"), events: selectedDayEvents }]
    : groupedUpcoming.map(([date, evs]) => ({ date, events: evs }));

  /* Calendar */
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-5xl">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">Agenda no disponible</h1>
          <p className="text-sm text-muted-foreground">El enlace ha expirado o es inválido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">Maven CRM</span>
          <span className="text-muted-foreground text-sm ml-1">· Agenda</span>
        </div>
      </header>

      {/* Body: 2-column layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-5">
        <div className="grid lg:grid-cols-[340px_1fr] gap-6">
          {/* LEFT: Calendar + Projects (sticky) */}
          <div className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            {/* Calendar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold capitalize">
                    {format(currentMonth, "MMMM yyyy", { locale: es })}
                  </h2>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]"
                      onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}>
                      Hoy
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold uppercase text-muted-foreground py-1.5">{d}</div>
                  ))}
                  {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`e-${i}`} className="h-8" />)}
                  {daysInMonth.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayEvents = eventDatesMap.get(dateStr);
                    const hasEvent = !!dayEvents;
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const today = isToday(day);
                    const dots = dayEvents
                      ? [...new Set(dayEvents.map((e) => e.project_type).filter(Boolean))]
                          .map((p) => PROJECT_COLORS[p!]?.dot).filter(Boolean).slice(0, 3)
                      : [];

                    return (
                      <button key={dateStr} onClick={() => setSelectedDate(isSelected ? null : day)}
                        className={cn(
                          "relative flex flex-col items-center justify-center rounded-md h-8 text-xs transition-all",
                          isSelected ? "bg-primary text-primary-foreground font-semibold"
                            : today ? "bg-accent/30 font-semibold"
                            : hasEvent ? "hover:bg-muted font-medium"
                            : "hover:bg-muted/50 text-muted-foreground"
                        )}>
                        {format(day, "d")}
                        {hasEvent && !isSelected && (
                          <span className="absolute bottom-0.5 flex gap-0.5">
                            {dots.map((c, i) => <span key={i} className={`h-1 w-1 rounded-full ${c}`} />)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Projects filter */}
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Proyectos</p>
                <div className="flex flex-col gap-1.5">
                  {PROJECT_TABS.map((tab) => {
                    const isActive = projectFilter === tab;
                    const colors = PROJECT_COLORS[tab];
                    const count = tab === "Todos"
                      ? events.length
                      : events.filter((e) => e.project_type === tab).length;
                    return (
                      <button key={tab} onClick={() => setProjectFilter(tab)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all text-left",
                          isActive
                            ? colors ? `${colors.bg} ${colors.text}` : "bg-muted text-foreground"
                            : "hover:bg-muted/50 text-muted-foreground"
                        )}>
                        {colors && <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />}
                        {!colors && <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />}
                        <span className="flex-1">{tab}</span>
                        <span className="text-[10px] tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Events feed */}
          <div className="space-y-6">
            {/* Section title */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-bold tracking-tight">
                  {selectedDate ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : "Próximos Eventos"}
                </h3>
                {selectedDate && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] ml-auto"
                    onClick={() => setSelectedDate(null)}>
                    Ver todos
                  </Button>
                )}
              </div>
              <div className="h-0.5 w-12 rounded-full bg-gradient-to-r from-primary to-accent" />
            </div>

            {eventsToDisplay.length === 0 || eventsToDisplay.every((g) => g.events.length === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No hay eventos {selectedDate ? "para esta fecha" : "próximos"}.
              </p>
            ) : (
              eventsToDisplay.map(({ date, events: evs }) => (
                <div key={date} className="space-y-3">
                  <DayHeader date={new Date(date + "T12:00:00")} count={evs.length} />
                  <div className="space-y-2.5 pl-2 border-l-2 border-border ml-4">
                    {evs.map((ev) => (
                      <CompactEventCard key={ev.id} event={ev} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-border py-3 text-center text-xs text-muted-foreground shrink-0">
        Maven CRM — Kash Agency
      </footer>
    </div>
  );
};

/* ─── Sub-components ─── */

const DayHeader = ({ date, count }: { date: Date; count: number }) => (
  <div className="flex items-end gap-3">
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-bold leading-none">{format(date, "d")}</span>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground leading-tight">
          {format(date, "EEEE", { locale: es })}
        </p>
        <p className="text-[11px] text-muted-foreground capitalize">{format(date, "MMMM yyyy", { locale: es })}</p>
      </div>
    </div>
    <Badge variant="secondary" className="mb-0.5 text-[10px]">{count} evento{count !== 1 ? "s" : ""}</Badge>
  </div>
);

const CompactEventCard = ({ event }: { event: AgendaEvent }) => {
  const colors = PROJECT_COLORS[event.project_type ?? ""];
  const TypeIcon = typeIcons[event.event_type] ?? CalendarDays;
  const typeColor = getTypeColor(event.event_type);
  const confirmedCount = event.guests.filter((g) => g.status === "confirmed").length;
  const pendingCount = event.guests.filter((g) => g.status === "pending").length;

  // Duration
  let duration = "";
  if (event.start_time && event.end_time) {
    const [sh, sm] = event.start_time.split(":").map(Number);
    const [eh, em] = event.end_time.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      duration = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
    }
  }

  return (
    <Card className={cn("overflow-hidden border-l-[3px] hover:shadow-md transition-shadow", typeColor)}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Time column */}
          <div className="w-14 shrink-0 text-right">
            {event.start_time && (
              <>
                <p className="text-sm font-bold tabular-nums">{event.start_time.slice(0, 5)}</p>
                {event.end_time && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">{event.end_time.slice(0, 5)}</p>
                )}
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <h4 className="text-sm font-semibold truncate">{event.name}</h4>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[10px] h-5">{event.event_type}</Badge>
                {duration && <span className="text-[10px] text-muted-foreground">{duration}</span>}
              </div>
            </div>

            {/* Project + Location row */}
            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              {event.project_type && colors && (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", colors.bg, colors.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                  {event.project_type}
                </span>
              )}
              {event.location && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {event.location}
                </span>
              )}
            </div>

            {/* Guests row */}
            {event.guests.length > 0 && (
              <div className="flex items-center gap-2 pt-0.5">
                <div className="flex -space-x-1.5">
                  {event.guests.slice(0, 4).map((g, i) => (
                    <Avatar key={i} className="h-5 w-5 border border-background">
                      <AvatarImage src={g.profile_photo_url ?? undefined} />
                      <AvatarFallback className="text-[8px]">{g.guest_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  ))}
                  {event.guests.length > 4 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted border border-background text-[8px] font-semibold">
                      +{event.guests.length - 4}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {event.guests.length} invitado{event.guests.length !== 1 ? "s" : ""}
                </span>
                {confirmedCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{confirmedCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{pendingCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SharedAgendaPage;
