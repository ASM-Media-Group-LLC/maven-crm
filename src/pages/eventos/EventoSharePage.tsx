import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, MapPin, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface EventInfo {
  name: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
}

interface GuestInfo {
  id: string;
  name: string;
  type: string;
  status: string;
}

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

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Event info */}
        <div className="rounded-lg border border-border p-6 space-y-3">
          <h1 className="text-2xl font-bold">{event?.name}</h1>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>{event?.date ? format(new Date(event.date), "EEEE d 'de' MMMM, yyyy", { locale: es }) : ""}</span>
            </div>
            {event?.start_time && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{event.start_time.slice(0, 5)}{event.end_time ? ` - ${event.end_time.slice(0, 5)}` : ""}</span>
              </div>
            )}
            {event?.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{event.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Guest selection */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Selecciona tu nombre</h2>
          <div className="space-y-1 max-h-[300px] overflow-auto">
            {guests.map((g) => (
              <button
                key={g.id}
                onClick={() => { setSelectedGuest(g.id); setShowCancelForm(false); }}
                className={`w-full text-left px-4 py-3 rounded-md text-sm transition-colors ${
                  selectedGuest === g.id
                    ? "bg-primary/10 border border-primary text-foreground"
                    : "hover:bg-muted/50 border border-transparent"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        {selectedGuest && !showCancelForm && (
          <div className="flex gap-3">
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
      </div>
    </div>
  );
};

export default EventoSharePage;
