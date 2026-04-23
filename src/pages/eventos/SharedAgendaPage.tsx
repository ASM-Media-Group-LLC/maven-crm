import { useState, useMemo, useEffect } from "react";
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
  Users, Camera, Mic, Video, Sparkles, Search, Sun, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import InstagramIcon from "@/components/icons/InstagramIcon";

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

const GUEST_STATUS: Record<string, { dot: string; label: string }> = {
  confirmed: { dot: "bg-emerald-500", label: "Confirmado" },
  cancelled: { dot: "bg-red-500", label: "Cancelado" },
  pending: { dot: "bg-amber-500", label: "Pendiente" },
};

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

const WEEKDAYS = ["DO", "LU", "MA", "MI", "JU", "VI", "SÁ"];
const PROJECT_TABS = ["Todos", "Ora", "Kash", "Trafix", "Unlok"];

const SharedAgendaPage = () => {
  const { token } = useParams<{ token: string }>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [projectFilter, setProjectFilter] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

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
    const q = searchQuery.toLowerCase().trim();
    return events.filter((e) => {
      if (projectFilter !== "Todos" && e.project_type !== projectFilter) return false;
      if (q) {
        const matchName = e.name.toLowerCase().includes(q);
        const matchLocation = e.location?.toLowerCase().includes(q);
        const matchGuest = e.guests.some((g) => g.guest_name?.toLowerCase().includes(q) || g.instagram_handle?.toLowerCase().includes(q));
        if (!matchName && !matchLocation && !matchGuest) return false;
      }
      return true;
    });
  }, [events, projectFilter, searchQuery]);

  const eventDatesMap = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    filteredEvents.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    });
    return map;
  }, [filteredEvents]);

  const allSortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }, [filteredEvents]);

  const selectedDayEvents = selectedDate
    ? filteredEvents.filter((e) => isSameDay(new Date(e.date + "T12:00:00"), selectedDate))
    : [];

  const groupedAll = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    allSortedEvents.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return Array.from(map.entries());
  }, [allSortedEvents]);

  const eventsToDisplay = selectedDate
    ? [{ date: format(selectedDate, "yyyy-MM-dd"), events: selectedDayEvents }]
    : groupedAll.map(([date, evs]) => ({ date, events: evs }));

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
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-6 py-3 shrink-0 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg tracking-tight">Maven CRM</span>
          <span className="text-muted-foreground text-sm hidden sm:inline">· Agenda</span>
          <div className="flex-1 max-w-xs ml-auto mr-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar evento, lugar, invitado..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/40 border-transparent focus:border-border focus:bg-background transition-colors"
              />
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6">
        <div className="grid lg:grid-cols-[340px_1fr] gap-8">
          {/* LEFT: Calendar + Projects */}
          <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            {/* Calendar */}
            <div className="rounded-xl border border-border bg-card p-5 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold capitalize tracking-tight">
                  {format(currentMonth, "MMMM yyyy", { locale: es })}
                </h2>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px] font-medium"
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

              <div className="grid grid-cols-7 gap-y-1.5">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground/60 py-2.5">{d}</div>
                ))}
                {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`e-${i}`} className="h-11" />)}
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
                        "relative flex flex-col items-center justify-center rounded-lg h-11 text-sm transition-all",
                        isSelected ? "bg-primary text-primary-foreground font-bold shadow-sm"
                          : today ? "bg-primary/15 text-primary font-bold"
                          : hasEvent ? "hover:bg-muted font-medium text-foreground"
                          : "hover:bg-muted/40 text-muted-foreground"
                      )}>
                      {format(day, "d")}
                      {hasEvent && !isSelected && (
                        <span className="absolute bottom-1 flex gap-0.5">
                          {dots.map((c, i) => <span key={i} className={`h-1 w-1 rounded-full ${c}`} />)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* RIGHT: Events feed */}
          <div className="space-y-8">
            {/* Section title + project chips */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                <h3 className="text-lg font-bold tracking-tight">
                  {selectedDate ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es }) : "Todos los Eventos"}
                </h3>
                {selectedDate && (
                  <Button variant="ghost" size="sm" className="h-7 px-3 text-[11px] ml-auto"
                    onClick={() => setSelectedDate(null)}>
                    Ver todos
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PROJECT_TABS.map((tab) => {
                  const isActive = projectFilter === tab;
                  const colors = PROJECT_COLORS[tab];
                  const count = tab === "Todos"
                    ? events.length
                    : events.filter((e) => e.project_type === tab).length;
                  return (
                    <button key={tab} onClick={() => setProjectFilter(tab)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all border",
                        isActive
                          ? colors
                            ? `${colors.bg} ${colors.text} border-transparent`
                            : "bg-muted text-foreground border-transparent"
                          : "border-border hover:bg-muted/50 text-muted-foreground"
                      )}>
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", colors?.dot ?? "bg-muted-foreground")} />
                      <span>{tab}</span>
                      <span className={cn("text-[10px] tabular-nums ml-0.5", isActive ? "font-semibold" : "opacity-50")}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {eventsToDisplay.length === 0 || eventsToDisplay.every((g) => g.events.length === 0) ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No hay eventos {selectedDate ? "para esta fecha" : "próximos"}.
              </p>
            ) : (
              eventsToDisplay.map(({ date, events: evs }) => (
                <div key={date} className="space-y-4">
                  <DayHeader date={new Date(date + "T12:00:00")} count={evs.length} />
                  <div className="space-y-3 pl-3 border-l-2 border-border/60 ml-5">
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

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground shrink-0">
        Maven CRM — Kash Agency
      </footer>
    </div>
  );
};

/* ─── Sub-components ─── */

const DayHeader = ({ date, count }: { date: Date; count: number }) => (
  <div className="flex items-end gap-3">
    <span className="text-4xl font-extrabold leading-none tabular-nums text-foreground">{format(date, "d")}</span>
    <div className="pb-0.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-tight">
        {format(date, "EEEE", { locale: es })}
      </p>
      <p className="text-[11px] text-muted-foreground/70 capitalize">{format(date, "MMMM yyyy", { locale: es })}</p>
    </div>
    <Badge variant="secondary" className="mb-1 text-[10px] font-semibold px-2.5">{count} evento{count !== 1 ? "s" : ""}</Badge>
  </div>
);

const CompactEventCard = ({ event }: { event: AgendaEvent }) => {
  const colors = PROJECT_COLORS[event.project_type ?? ""];
  const TypeIcon = typeIcons[event.event_type] ?? CalendarDays;

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
    <div className={cn(
      "rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-md hover:border-border/80",
      colors ? `border-l-[3px] ${colors.border}` : "border-l-[3px] border-l-muted-foreground/30"
    )}>
      <div className="p-4">
        {/* Row 1: Time + Title + Type badge */}
        <div className="flex items-start gap-3">
          {/* Time block */}
          {event.start_time && (
            <div className="w-12 shrink-0 pt-0.5">
              <p className="text-sm font-bold tabular-nums leading-tight">{event.start_time.slice(0, 5)}</p>
              {event.end_time && (
                <p className="text-[10px] text-muted-foreground/70 tabular-nums leading-tight">{event.end_time.slice(0, 5)}</p>
              )}
            </div>
          )}

          {/* Title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <h4 className="text-[15px] font-semibold truncate leading-tight">{event.name}</h4>
            </div>

            {/* Meta row: project + location */}
            <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
              {event.project_type && colors && (
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", colors.bg, colors.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
                  {event.project_type}
                </span>
              )}
              {event.location && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {event.location}
                </span>
              )}
            </div>
          </div>

          {/* Right: type + duration */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground">{event.event_type}</span>
            {duration && (
              <span className="text-[11px] text-muted-foreground/60">{duration}</span>
            )}
          </div>
        </div>

        {/* Description */}
        {event.description && (
          <p className="text-[12px] text-muted-foreground/80 mt-2 ml-[60px] line-clamp-1 leading-relaxed">{event.description}</p>
        )}

        {/* Guests */}
        {event.guests.length > 0 && (
          <div className="mt-3 ml-[60px]">
            {/* Guest summary */}
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-[11px] text-muted-foreground">
                {event.guests.length} invitado{event.guests.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Guest list */}
            <div className="flex flex-wrap gap-2">
              {event.guests.map((g, i) => {
                const gs = GUEST_STATUS[g.status] ?? GUEST_STATUS.pending;
                return (
                  <div key={i} className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2 py-1">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={g.profile_photo_url ?? undefined} />
                      <AvatarFallback className="text-[8px] font-semibold bg-primary/10 text-primary">{g.guest_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] font-medium">{g.guest_name}</span>
                    {g.instagram_handle && (
                      <a href={`https://instagram.com/${g.instagram_handle}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-pink-500 transition-colors">
                        <InstagramIcon className="h-2.5 w-2.5" />
                      </a>
                    )}
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", gs.dot)} title={gs.label} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedAgendaPage;
