import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays, MapPin, Clock, CheckCircle, XCircle, Loader2,
  Users, Camera, Mic, Video, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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
}

const PROJECT_COLORS: Record<string, string> = {
  Ora: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  Kash: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  Trafix: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Unlok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Próximo",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  rescheduled: "Reagendado",
};

const GUEST_STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  confirmed: { dot: "bg-emerald-500", label: "Confirmado" },
  cancelled: { dot: "bg-red-500", label: "Cancelado" },
  pending: { dot: "bg-amber-500", label: "Pendiente" },
};

const typeIcons: Record<string, React.ElementType> = {
  Shooting: Camera,
  Podcast: Mic,
  Casting: Users,
  Reunion: Video,
  Otro: CalendarDays,
};

const EventoSharePage = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [guests, setGuests] = useState<GuestInfo[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"confirmed" | "cancelled" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-external-action?token=${token}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Error al cargar el evento");
          return;
        }
        setEvent(json.event);
        setGuests(json.guests);
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const handleAction = async (action: "confirm" | "cancel") => {
    if (!selectedGuest) return;
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-external-action`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          token,
          guest_id: selectedGuest,
          action,
          cancellation_reason: action === "cancel" ? cancelReason : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setDone(action === "confirm" ? "confirmed" : "cancelled");
      } else {
        setError(json.error || "Error al procesar");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-2 max-w-md">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">No disponible</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3 max-w-md">
          {done === "confirmed" ? (
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
          ) : (
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
          )}
          <h1 className="text-xl font-bold">
            {done === "confirmed" ? "¡Asistencia confirmada!" : "Asistencia cancelada"}
          </h1>
          <p className="text-muted-foreground">
            {done === "confirmed"
              ? "Tu asistencia ha sido registrada. ¡Te esperamos!"
              : "Tu cancelación ha sido registrada."}
          </p>
        </div>
      </div>
    );
  }

  const TypeIcon = typeIcons[event?.event_type ?? ""] ?? CalendarDays;
  const projectStyle = event?.project_type ? PROJECT_COLORS[event.project_type] : null;
  const confirmedCount = guests.filter((g) => g.status === "confirmed").length;
  const pendingCount = guests.filter((g) => g.status === "pending").length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">Maven CRM</span>
        </div>
      </header>

      <div className="flex-1 px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Event Hero Card */}
          <Card className="overflow-hidden border-l-[3px] border-l-primary">
            <CardContent className="p-5 space-y-4">
              {/* Title row */}
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <TypeIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold leading-tight">{event?.name}</h1>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[11px]">{event?.event_type}</Badge>
                    {event?.project_type && projectStyle && (
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", projectStyle)}>
                        {event.project_type}
                      </span>
                    )}
                    {event?.status && (
                      <Badge variant="secondary" className="text-[11px]">
                        {STATUS_LABELS[event.status] ?? event.status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span>
                    {event?.date
                      ? format(new Date(event.date + "T12:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })
                      : ""}
                  </span>
                </div>
                {event?.start_time && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      {event.start_time.slice(0, 5)}
                      {event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ""}
                    </span>
                  </div>
                )}
                {event?.location && (
                  <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {event?.description && (
                <div className="border-t border-border pt-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Descripción</span>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-line">{event.description}</p>
                </div>
              )}

              {/* Guest summary */}
              {guests.length > 0 && (
                <div className="border-t border-border pt-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {guests.length} invitado{guests.length !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-3 ml-auto text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {confirmedCount} confirmados
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {pendingCount} pendientes
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {guests.map((g) => {
                      const gs = GUEST_STATUS_STYLES[g.status] ?? GUEST_STATUS_STYLES.pending;
                      return (
                        <div
                          key={g.id}
                          className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2"
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px] font-semibold">
                              {g.name?.charAt(0)?.toUpperCase() ?? "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{g.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{g.type}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn("h-2 w-2 rounded-full", gs.dot)} />
                            <span className="text-[10px] text-muted-foreground">{gs.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Guest selection for RSVP */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="text-base font-semibold">Confirma tu asistencia</h2>
              <p className="text-sm text-muted-foreground">Selecciona tu nombre de la lista</p>
              <div className="space-y-1 max-h-[260px] overflow-auto">
                {guests.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGuest(g.id); setShowCancelForm(false); }}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-md text-sm transition-colors",
                      selectedGuest === g.id
                        ? "bg-primary/10 border border-primary text-foreground"
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>

              {/* Actions */}
              {selectedGuest && !showCancelForm && (
                <div className="flex gap-3 pt-2">
                  <Button className="flex-1" onClick={() => handleAction("confirm")} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Confirmar asistencia
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setShowCancelForm(true)} disabled={submitting}>
                    <XCircle className="h-4 w-4 mr-2" />
                    No podré asistir
                  </Button>
                </div>
              )}

              {/* Cancel form */}
              {showCancelForm && (
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-sm font-medium">¿Por qué no puedes asistir? (opcional)</h3>
                  <Textarea
                    placeholder="Motivo de cancelación…"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleAction("cancel")}
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Confirmar cancelación
                    </Button>
                    <Button variant="ghost" onClick={() => setShowCancelForm(false)}>
                      Volver
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground shrink-0">
        Maven CRM — Kash Agency
      </footer>
    </div>
  );
};

export default EventoSharePage;
