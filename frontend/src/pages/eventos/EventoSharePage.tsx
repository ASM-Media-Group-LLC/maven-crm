import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays, MapPin, Clock, Loader2, XCircle,
  Users, Camera, Mic, Video, FileText, Download, ExternalLink,
  Sun, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { cn } from "@/lib/utils";
import InstagramIcon from "@/components/icons/InstagramIcon";

interface EventInfo {
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
  description: string | null;
  project_type: string | null;
  status: string | null;
}

interface GuestInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  instagram_handle?: string | null;
}

const PROJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Ora: { bg: "bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  Kash: { bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  Trafix: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  Unlok: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Próximo", in_progress: "En curso", completed: "Completado",
  cancelled: "Cancelado", rescheduled: "Reagendado",
};

const GUEST_STATUS: Record<string, { dot: string; label: string }> = {
  confirmed: { dot: "bg-success", label: "Confirmado" },
  cancelled: { dot: "bg-destructive", label: "Cancelado" },
  pending: { dot: "bg-warning", label: "Pendiente" },
};

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera, Podcast: Mic, Casting: Users, Reunion: Video, Otro: CalendarDays,
};

/* ─── Calendar helpers ─── */
const buildGoogleCalUrl = (ev: EventInfo) => {
  const d = ev.date.replace(/-/g, "");
  const st = ev.start_time ? ev.start_time.replace(/:/g, "").slice(0, 4) + "00" : "000000";
  const et = ev.end_time ? ev.end_time.replace(/:/g, "").slice(0, 4) + "00" : st;
  const dates = `${d}T${st}/${d}T${et}`;
  const params = new URLSearchParams({
    action: "TEMPLATE", text: ev.name, dates,
    ...(ev.location ? { location: ev.location } : {}),
    ...(ev.description ? { details: ev.description } : {}),
  });
  return `https://www.google.com/calendar/render?${params}`;
};

const buildICS = (ev: EventInfo) => {
  const d = ev.date.replace(/-/g, "");
  const st = ev.start_time ? ev.start_time.replace(/:/g, "").slice(0, 4) + "00" : "000000";
  const et = ev.end_time ? ev.end_time.replace(/:/g, "").slice(0, 4) + "00" : st;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MavenCRM//EN",
    "BEGIN:VEVENT",
    `DTSTART:${d}T${st}`, `DTEND:${d}T${et}`,
    `SUMMARY:${ev.name}`,
    ev.location ? `LOCATION:${ev.location}` : "",
    ev.description ? `DESCRIPTION:${ev.description}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
};

const downloadICS = (ev: EventInfo) => {
  const blob = new Blob([buildICS(ev)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${ev.name.replace(/\s+/g, "_")}.ics`;
  a.click(); URL.revokeObjectURL(url);
};

/* ─── Detail Item ─── */
const DetailItem = ({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) => (
  <div className="flex items-start gap-3 py-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold leading-snug">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  </div>
);

/* ─── Main ─── */
const EventoSharePage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [guests, setGuests] = useState<GuestInfo[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-external-action?token=${token}`;
        const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Error al cargar"); return; }
        setEvent(json.event);
        setGuests(json.guests);
      } catch { setError("Error de conexión"); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [token]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error || !event) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-2 max-w-md">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">No disponible</h1>
        <p className="text-muted-foreground">{error || "Evento no encontrado"}</p>
      </div>
    </div>
  );

  const TypeIcon = typeIcons[event.event_type] ?? CalendarDays;
  const projectStyle = event.project_type ? PROJECT_COLORS[event.project_type] : null;
  const confirmedCount = guests.filter((g) => g.status === "confirmed").length;
  const pendingCount = guests.filter((g) => g.status === "pending").length;
  const cancelledCount = guests.filter((g) => g.status === "cancelled").length;

  let duration = "";
  if (event.start_time && event.end_time) {
    const [sh, sm] = event.start_time.split(":").map(Number);
    const [eh, em] = event.end_time.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      duration = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
    }
  }

  const timeDisplay = event.start_time
    ? `${event.start_time.slice(0, 5)}${event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ""}`
    : "Por definir";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 md:px-6 py-3 shrink-0 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">Maven CRM</span>
          <span className="text-muted-foreground text-sm ml-1">· Evento</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex-1 px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* ── Hero ── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {event.project_type && projectStyle && (
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", projectStyle.bg, projectStyle.text)}>
                  <span className={cn("h-2 w-2 rounded-full", projectStyle.dot)} />
                  {event.project_type}
                </span>
              )}
              {event.status && (
                <Badge variant="secondary" className="text-[11px]">
                  {STATUS_LABELS[event.status] ?? event.status}
                </Badge>
              )}
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">{event.name}</h1>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TypeIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{event.event_type}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0 pt-1">
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <a href={buildGoogleCalUrl(event)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Google Calendar
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadICS(event)}>
                  <Download className="h-3.5 w-3.5" />
                  Descargar .ics
                </Button>
              </div>
            </div>
          </section>

          {/* ── Event details ── */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
              <DetailItem
                icon={CalendarDays}
                label="Fecha"
                value={format(new Date(event.date + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
              />
              <DetailItem
                icon={Clock}
                label="Horario"
                value={timeDisplay}
                sub={duration || undefined}
              />
              <DetailItem
                icon={MapPin}
                label="Ubicación"
                value={event.location || "Por definir"}
              />
            </div>
          </section>

          {/* ── Notes ── */}
          {event.description && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Notas del evento</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{event.description}</p>
              </div>
            </section>
          )}

          {/* ── Guests list ── */}
          {guests.length > 0 && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Invitados</span>
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                  {guests.length}
                  {(confirmedCount > 0 || pendingCount > 0 || cancelledCount > 0) && (
                    <span className="ml-2">
                      — {[
                        confirmedCount > 0 ? `${confirmedCount} confirmado${confirmedCount !== 1 ? "s" : ""}` : "",
                        pendingCount > 0 ? `${pendingCount} pendiente${pendingCount !== 1 ? "s" : ""}` : "",
                        cancelledCount > 0 ? `${cancelledCount} cancelado${cancelledCount !== 1 ? "s" : ""}` : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {guests.map((g) => {
                  const gs = GUEST_STATUS[g.status] ?? GUEST_STATUS.pending;
                  return (
                    <li key={g.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                          {g.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{g.name}</p>
                        {g.instagram_handle && (
                          <a
                            href={`https://instagram.com/${g.instagram_handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-pink-500 transition-colors"
                          >
                            <InstagramIcon className="h-3 w-3" />
                            @{g.instagram_handle}
                          </a>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 gap-1.5 text-[10px] font-medium border-transparent",
                          g.status === "confirmed" && "bg-success/10 text-success",
                          g.status === "cancelled" && "bg-destructive/10 text-destructive",
                          g.status === "pending" && "bg-warning/10 text-warning",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", gs.dot)} />
                        {gs.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

        </div>
      </div>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground shrink-0">
        Maven CRM — Kash Agency
      </footer>
    </div>
  );
};

export default EventoSharePage;
