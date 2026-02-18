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
  CalendarDays,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  Users,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

const PROJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Ora: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400", dot: "bg-blue-500" },
  Kash: { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
  Trafix: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  Unlok: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Próximo",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  rescheduled: "Reagendado",
};

const PROJECT_TABS = ["Todos", "Ora", "Kash", "Trafix", "Unlok"];
const WEEKDAYS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];

/* ─── Main Component ─── */
const SharedAgendaPage = () => {
  const { token } = useParams<{ token: string }>();
  const { theme, setTheme } = useTheme();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("Todos");

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["shared-agenda", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_agenda_by_share_token", {
        p_token: token!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AgendaEvent[];
    },
    enabled: !!token,
  });

  /* ─── Derived data ─── */
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (projectFilter !== "Todos" && e.project_type !== projectFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = e.name.toLowerCase().includes(q);
        const matchLoc = e.location?.toLowerCase().includes(q);
        if (!matchName && !matchLoc) return false;
      }
      return true;
    });
  }, [events, projectFilter, searchQuery]);

  const eventDatesMap = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    filteredEvents.forEach((e) => {
      const key = e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return map;
  }, [filteredEvents]);

  const selectedDayEvents = selectedDate
    ? filteredEvents.filter((e) => isSameDay(new Date(e.date), selectedDate))
    : [];

  const upcomingEvents = useMemo(() => {
    const today = new Date();
    return filteredEvents
      .filter((e) => new Date(e.date) >= new Date(today.toISOString().split("T")[0]))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""))
      .slice(0, 8);
  }, [filteredEvents]);

  /* ─── Calendar helpers ─── */
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  /* ─── Loading / Error states ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-5xl">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-60 rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || (events.length === 0 && !isLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">Agenda no disponible</h1>
          <p className="text-sm text-muted-foreground">
            El enlace ha expirado o no hay eventos próximos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ─── Header ─── */}
      <header className="border-b border-border bg-card px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="font-bold text-lg">Maven CRM</span>
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar eventos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="shrink-0"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* ─── Project filter tabs ─── */}
      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 pt-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {PROJECT_TABS.map((tab) => (
            <Button
              key={tab}
              variant={projectFilter === tab ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setProjectFilter(tab)}
              className="text-xs"
            >
              {tab}
            </Button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-5 flex-1 space-y-6">
        {/* ─── Calendar ─── */}
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentMonth(new Date());
                    setSelectedDate(new Date());
                  }}
                >
                  Hoy
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <h2 className="text-sm font-semibold capitalize ml-1">
                  {format(currentMonth, "MMMM yyyy", { locale: es })}
                </h2>
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                <Button variant="secondary" size="sm" className="text-xs h-7">Mes</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7">Semana</Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10" />
              ))}
              {daysInMonth.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = eventDatesMap.get(dateStr);
                const hasEvent = !!dayEvents;
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const today = isToday(day);

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={`relative flex flex-col items-center justify-center rounded-lg h-10 text-sm transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : today
                        ? "bg-primary/15 text-primary font-semibold"
                        : hasEvent
                        ? "hover:bg-muted font-medium"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {format(day, "d")}
                    {hasEvent && !isSelected && (
                      <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ─── Upcoming Events (horizontal scroll) ─── */}
        {!selectedDate && upcomingEvents.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Próximos Eventos
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
              {upcomingEvents.map((ev) => (
                <UpcomingEventCard key={ev.id} event={ev} onSelect={() => setSelectedDate(new Date(ev.date))} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Selected Day Detail ─── */}
        {selectedDate && (
          <div className="space-y-4">
            <DayHeader date={selectedDate} count={selectedDayEvents.length} />
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No hay eventos para esta fecha.
              </p>
            ) : (
              selectedDayEvents.map((ev) => <EventDetailCard key={ev.id} event={ev} />)
            )}
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground shrink-0">
        Maven CRM — Kash Agency
      </footer>
    </div>
  );
};

/* ─── Sub-components ─── */

const UpcomingEventCard = ({ event, onSelect }: { event: AgendaEvent; onSelect: () => void }) => {
  const colors = PROJECT_COLORS[event.project_type ?? ""];
  return (
    <Card
      className="shrink-0 w-64 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onSelect}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {event.project_type && colors && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
              {event.project_type}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{event.event_type}</span>
        </div>
        <h4 className="font-semibold text-sm truncate">{event.name}</h4>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>
              {format(new Date(event.date), "EEE d MMM", { locale: es })}
              {event.start_time ? ` — ${event.start_time.slice(0, 5)}` : ""}
            </span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const DayHeader = ({ date, count }: { date: Date; count: number }) => (
  <div className="flex items-end gap-3">
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {format(date, "EEEE", { locale: es })}
      </p>
      <p className="text-3xl font-bold leading-none">{format(date, "d")}</p>
      <p className="text-sm text-muted-foreground capitalize">{format(date, "MMMM yyyy", { locale: es })}</p>
    </div>
    <Badge variant="secondary" className="mb-1">{count} evento{count !== 1 ? "s" : ""}</Badge>
  </div>
);

const EventDetailCard = ({ event }: { event: AgendaEvent }) => {
  const colors = PROJECT_COLORS[event.project_type ?? ""];
  const pendingGuests = event.guests.filter((g) => g.status === "pending");
  const confirmedGuests = event.guests.filter((g) => g.status === "confirmed");

  return (
    <div className="flex gap-4">
      {/* Time column */}
      <div className="w-16 shrink-0 text-right pt-1">
        {event.start_time && (
          <span className="text-sm font-semibold">{event.start_time.slice(0, 5)}</span>
        )}
      </div>

      {/* Card */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-4 space-y-3">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{event.event_type}</Badge>
            {event.project_type && colors && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
                {event.project_type}
              </span>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {STATUS_LABELS[event.status] ?? event.status}
            </Badge>
          </div>

          <h4 className="font-bold text-base">{event.name}</h4>

          {event.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {event.start_time && event.end_time && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{event.start_time.slice(0, 5)} – {event.end_time.slice(0, 5)}</span>
            </div>
          )}

          {event.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{event.description}</p>
          )}

          {/* Guests */}
          {event.guests.length > 0 && (
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {event.guests.length} invitado{event.guests.length !== 1 ? "s" : ""}
                </span>
                {pendingGuests.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    Pendientes ({pendingGuests.length})
                  </Badge>
                )}
                {confirmedGuests.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    Confirmados ({confirmedGuests.length})
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {event.guests.map((g, i) => (
                  <GuestChip key={i} guest={g} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const GuestChip = ({ guest }: { guest: AgendaGuest }) => (
  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
    <Avatar className="h-7 w-7 shrink-0">
      <AvatarImage src={guest.profile_photo_url ?? undefined} />
      <AvatarFallback className="text-[10px]">
        {guest.guest_name?.charAt(0)?.toUpperCase() ?? "?"}
      </AvatarFallback>
    </Avatar>
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium truncate">{guest.guest_name}</p>
      {guest.instagram_handle && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <InstagramIcon className="h-3 w-3" />
          <span className="truncate">@{guest.instagram_handle}</span>
        </div>
      )}
    </div>
    <span className={`h-2 w-2 rounded-full shrink-0 ${
      guest.status === "confirmed" ? "bg-emerald-500" : guest.status === "cancelled" ? "bg-red-500" : "bg-amber-500"
    }`} />
  </div>
);

export default SharedAgendaPage;
