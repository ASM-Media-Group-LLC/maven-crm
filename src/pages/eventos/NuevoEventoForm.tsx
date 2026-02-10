import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, CalendarDays, Camera, Mic, Users, Video, MapPin, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAddEvento } from "./useEventos";

const EVENT_TYPES = [
  { value: "Shooting", label: "Shooting", icon: Camera },
  { value: "Podcast", label: "Podcast", icon: Mic },
  { value: "Casting", label: "Casting", icon: Users },
  { value: "Reunion", label: "Reunión", icon: Video },
  { value: "Otro", label: "Otro", icon: CalendarDays },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

function computeDuration(startH: string, startM: string, endH: string, endM: string): string {
  if (!startH || !endH) return "";
  const s = parseInt(startH) * 60 + parseInt(startM || "0");
  const e = parseInt(endH) * 60 + parseInt(endM || "0");
  const diff = e - s;
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m > 0 ? `${m}m` : ""}`.trim();
}

const NuevoEventoForm = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const addEvento = useAddEvento();

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("");
  const [description, setDescription] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startH, setStartH] = useState("");
  const [startM, setStartM] = useState("00");
  const [endH, setEndH] = useState("");
  const [endM, setEndM] = useState("00");
  const [location, setLocation] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [notes, setNotes] = useState("");

  const duration = computeDuration(startH, startM, endH, endM);

  const handleSubmit = async () => {
    if (!name.trim() || !eventType || !date) {
      toast({ title: "Completa los campos obligatorios", variant: "destructive" });
      return;
    }

    try {
      await addEvento.mutateAsync({
        name: name.trim(),
        event_type: eventType,
        description: description || undefined,
        date,
        end_date: multiDay && endDate ? endDate : undefined,
        start_time: startH ? `${startH}:${startM}:00` : undefined,
        end_time: endH ? `${endH}:${endM}:00` : undefined,
        location: location || undefined,
        max_capacity: maxCapacity ? parseInt(maxCapacity) : undefined,
        notes: notes || undefined,
      });
      toast({ title: "Evento creado exitosamente" });
      navigate("/eventos");
    } catch (err: any) {
      toast({ title: "Error al crear evento", description: err.message, variant: "destructive" });
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6 min-w-0">
      <div className="max-w-6xl mx-auto pb-24 space-y-6">
        {/* Header */}
        <button
          onClick={() => navigate("/eventos")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Eventos
        </button>

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Crear Evento
          </h1>
          <p className="text-sm text-muted-foreground">Completa los detalles del nuevo evento</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Información del Evento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre del Evento *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Shooting Kash Agency" />
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Evento *</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            <t.icon className="h-4 w-4" />
                            {t.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción del evento…" rows={3} />
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={multiDay} onCheckedChange={setMultiDay} />
                  <Label>Evento de múltiples días</Label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fecha {multiDay ? "inicio" : ""} *</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  {multiDay && (
                    <div className="space-y-2">
                      <Label>Fecha fin</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                  <div className="space-y-2">
                    <Label>Desde (hora)</Label>
                    <Select value={startH} onValueChange={setStartH}>
                      <SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger>
                      <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Select value={startM} onValueChange={setStartM}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Hasta (hora)</Label>
                    <Select value={endH} onValueChange={setEndH}>
                      <SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger>
                      <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Select value={endM} onValueChange={setEndM}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MINUTES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {duration && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {duration}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Ubicación</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dirección o lugar" className="pl-9" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Capacidad Máxima</Label>
                  <Input type="number" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Opcional" min={1} />
                </div>

                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionales…" rows={2} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Guests */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invitados (0)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Sin invitados</h4>
                    <p className="text-xs text-muted-foreground">
                      Agrega creadoras, contactos o invitados externos
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    <Users className="mr-2 h-4 w-4" />
                    Agregar Invitados
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={addEvento.isPending}>
            {addEvento.isPending ? "Guardando…" : "Guardar Evento"}
          </Button>
        </div>
      </div>
    </main>
  );
};

export default NuevoEventoForm;
