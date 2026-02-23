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
  formatDistanceToNow,
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
  Camera,
  Mic,
  Video,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

const PROJECT_COLORS: Record<string, { bg: string; bgActive: string; text: string; textActive: string; dot: string; border: string }> = {
  Ora: { bg: "bg-blue-500/10", bgActive: "bg-blue-500/20", text: "text-blue-600/70 dark:text-blue-400/70", textActive: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", border: "border-blue-500" },
  Kash: { bg: "bg-purple-500/10", bgActive: "bg-purple-500/20", text: "text-purple-600/70 dark:text-purple-400/70", textActive: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", border: "border-purple-500" },
  Trafix: { bg: "bg-amber-500/10", bgActive: "bg-amber-500/20", text: "text-amber-600/70 dark:text-amber-400/70", textActive: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500", border: "border-amber-500" },
  Unlok: { bg: "bg-emerald-500/10", bgActive: "bg-emerald-500/20", text: "text-emerald-600/70 dark:text-emerald-400/70", textActive: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", border: "border-emerald-500" },
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Próximo",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  rescheduled: "Reagendado",
};

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

  const eventsThisMonth = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return filteredEvents.filter((e) => {
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    }).length;
  }, [filteredEvents, currentMonth]);

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

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">Agenda no disponible</h1>
          <p className="text-sm text-muted-foreground">
            El enlace ha expirado o es inválido.
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
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 p-1">
          {PROJECT_TABS.map((tab) => {
            const isActive = projectFilter === tab;
            const colors = PROJECT_COLORS[tab];
            return (
              <button
                key={tab}
                onClick={() => setProjectFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? colors
                      ? `${colors.bgActive} ${colors.textActive} shadow-sm`
                      : "bg-background text-foreground shadow-sm"
                    : colors
                    ? `${colors.text} hover:${colors.bg}`
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-6 py-5 flex-1 space-y-6">
        {/* ─── Calendar ─── */}
        <Card>
          <CardContent className="p-4 md:p-5">
            {/* Calendar Header - modernized */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold capitalize tracking-tight">
                  {format(currentMonth, "MMMM yyyy", { locale: es })}
                </h2>
                <Badge variant="secondary" className="text-xs font-semibold tabular-nums">
                  {eventsThisMonth} eventos
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs font-medium h-8 px-3"
                  onClick={() => {
                    setCurrentMonth(new Date());
                    setSelectedDate(new Date());
                  }}
                >
                  Hoy
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-11" />
              ))}
              {daysInMonth.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = eventDatesMap.get(dateStr);
                const hasEvent = !!dayEvents;
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const today = isToday(day);
                const dayProjectColors = dayEvents
                  ? [...new Set(dayEvents.map((e) => e.project_type).filter(Boolean))]
                      .map((p) => PROJECT_COLORS[p!]?.dot)
                      .filter(Boolean)
                      .slice(0, 3)
                  : [];

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-lg h-11 text-sm transition-all duration-150 hover:scale-105",
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-md"
                        : today
                        ? "calendar-day-today"
                        : hasEvent
                        ? "hover:bg-muted font-medium"
                        : "hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                    {hasEvent && !isSelected && (
                      <span className="absolute bottom-1 flex gap-0.5 calendar-day-has-event">
                        {dayProjectColors.map((dotColor, i) => (
                          <span key={i} className={`h-1 w-1 rounded-full ${dotColor}`} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Calendar Footer - gradient summary */}
            <div className="mt-4 rounded-xl bg-gradient-to-r from-primary/5 via-accent/5 to-transparent px-4 py-3 flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{eventsThisMonth}</span> eventos programados este mes
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Upcoming Events (with modernized cards) ─── */}
        {!selectedDate && upcomingEvents.length > 0 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-bold tracking-tight">Próximos Eventos</h3>
              </div>
              <div className="h-0.5 w-12 rounded-full bg-gradient-to-r from-primary to-accent" />
            </div>
            {(() => {
              const grouped = new Map<string, AgendaEvent[]>();
              upcomingEvents.forEach((ev) => {
                if (!grouped.has(ev.date)) grouped.set(ev.date, []);
                grouped.get(ev.date)!.push(ev);
              });
              return Array.from(grouped.entries()).map(([date, evs]) => (
                <div key={date} className="space-y-3">
                  <DayHeader date={new Date(date)} count={evs.length} />
                  {evs.map((ev) => (
                    <EventDetailCard key={ev.id} event={ev} />
                  ))}
                </div>
              ));
            })()}
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
  const [guestFilter, setGuestFilter] = useState<"all" | "pending" | "confirmed">("all");
  const colors = PROJECT_COLORS[event.project_type ?? ""];
  const pendingGuests = event.guests.filter((g) => g.status === "pending");
  const confirmedGuests = event.guests.filter((g) => g.status === "confirmed");
  const displayedGuests = guestFilter === "all"
    ? event.guests
    : guestFilter === "pending"
    ? pendingGuests
    : confirmedGuests;

  const eventDate = new Date(event.date);
  const todayEvent = isToday(eventDate);
  const relativeTime = formatDistanceToNow(eventDate, { locale: es, addSuffix: true });
  const typeStyle = getEventTypeStyle(event.event_type);
  const TypeIcon = typeIcons[event.event_type] ?? CalendarDays;

  return (
    <div className="flex gap-4">
      {/* Time column */}
      <div className="w-16 shrink-0 text-right pt-1">
        {event.start_time && (
          <span className="text-sm font-semibold">{event.start_time.slice(0, 5)}</span>
        )}
      </div>

      {/* Card with color-coded left border by event type */}
      <Card className={cn(
        "flex-1 overflow-hidden border-l-[3px] transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
        typeStyle.border,
        colors ? `border-t-[3px] ${colors.border}` : ""
      )}>
        <CardContent className="p-4 space-y-3">
          {/* Header row with icon, badges */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", typeStyle.iconBg)}>
                <TypeIcon className={cn("h-4 w-4", typeStyle.iconText)} />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-base truncate">{event.name}</h4>
                <p className="text-[11px] text-muted-foreground capitalize">{relativeTime}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {todayEvent && (
                <Badge className="text-[10px] font-semibold bg-primary text-primary-foreground">
                  Hoy
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">{event.event_type}</Badge>
            </div>
          </div>

          {/* Project & status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {event.project_type && colors && (
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${colors.bg} ${colors.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${colors.dot} mr-1.5`} />
                {event.project_type}
              </span>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {STATUS_LABELS[event.status] ?? event.status}
            </Badge>
          </div>

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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Invitados</span>
                </div>
                <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
                  <Button
                    variant={guestFilter === "all" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setGuestFilter("all")}
                  >
                    Todos ({event.guests.length})
                  </Button>
                  <Button
                    variant={guestFilter === "pending" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setGuestFilter("pending")}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-1" />
                    Pendientes ({pendingGuests.length})
                  </Button>
                  <Button
                    variant={guestFilter === "confirmed" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setGuestFilter("confirmed")}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
                    Confirmados ({confirmedGuests.length})
                  </Button>
                </div>
              </div>

              {displayedGuests.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {displayedGuests.map((g, i) => (
                    <GuestChip key={i} guest={g} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No hay invitados {guestFilter === "pending" ? "pendientes" : "confirmados"}
                </p>
              )}
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
        <a
          href={`https://instagram.com/${guest.instagram_handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-pink-500 transition-colors cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          <InstagramIcon className="h-3 w-3" />
          <span className="truncate hover:underline">@{guest.instagram_handle}</span>
        </a>
      )}
    </div>
    <span className={`h-2 w-2 rounded-full shrink-0 ${
      guest.status === "confirmed" ? "bg-emerald-500" : guest.status === "cancelled" ? "bg-red-500" : "bg-amber-500"
    }`} />
  </div>
);

export default SharedAgendaPage;
