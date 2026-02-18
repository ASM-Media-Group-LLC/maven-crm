import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, MapPin, Clock, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

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
  guests: {
    guest_name: string;
    guest_type: string;
    status: string;
    profile_photo_url: string | null;
    instagram_handle: string | null;
  }[];
}

const projectColors: Record<string, { bg: string; text: string }> = {
  Ora: { bg: "bg-blue-500/15", text: "text-blue-600" },
  Kash: { bg: "bg-purple-500/15", text: "text-purple-600" },
  Trafix: { bg: "bg-amber-500/15", text: "text-amber-600" },
  Unlok: { bg: "bg-emerald-500/15", text: "text-emerald-600" },
};

const SharedAgendaPage = () => {
  const { token } = useParams<{ token: string }>();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["shared-agenda", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_agenda_by_share_token", {
        p_token: token!,
      });
      if (error) throw error;
      return (data ?? []) as AgendaEvent[];
    },
    enabled: !!token,
  });

  const eventDates = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.date));
    return set;
  }, [events]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const selectedEvents = selectedDate
    ? events.filter((e) => isSameDay(new Date(e.date), selectedDate))
    : events.slice(0, 10);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="space-y-4 w-full max-w-4xl">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Agenda de Eventos</h1>
            <p className="text-sm text-muted-foreground">{events.length} eventos próximos</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Calendar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-semibold capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: es })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {daysInMonth.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const hasEvent = eventDates.has(dateStr);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={`relative rounded-md p-1.5 text-sm transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : hasEvent
                        ? "bg-primary/10 text-primary font-semibold hover:bg-primary/20"
                        : "hover:bg-muted"
                    }`}
                  >
                    {format(day, "d")}
                    {hasEvent && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Events list */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {selectedDate
              ? format(selectedDate, "EEEE d 'de' MMMM", { locale: es })
              : "Próximos eventos"}
          </h3>

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No hay eventos para esta fecha.
            </p>
          ) : (
            selectedEvents.map((ev) => (
              <Card key={ev.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="font-semibold">{ev.name}</h4>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{ev.event_type}</span>
                        {ev.project_type && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${projectColors[ev.project_type]?.bg ?? ""} ${projectColors[ev.project_type]?.text ?? ""}`}>
                            {ev.project_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(ev.date), "d MMM", { locale: es })}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {ev.start_time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {ev.start_time.slice(0, 5)}
                        {ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ""}
                      </span>
                    )}
                    {ev.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {ev.location}
                      </span>
                    )}
                  </div>

                  {ev.description && (
                    <p className="text-sm text-muted-foreground">{ev.description}</p>
                  )}

                  {ev.guests.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {ev.guests.length} invitados
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ev.guests.map((g, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-full bg-muted/50 pl-1 pr-3 py-1">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={g.profile_photo_url ?? undefined} />
                              <AvatarFallback className="text-[10px]">
                                {g.guest_name?.charAt(0)?.toUpperCase() ?? "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{g.guest_name}</p>
                              {g.instagram_handle && (
                                <p className="text-[10px] text-muted-foreground">@{g.instagram_handle}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SharedAgendaPage;
