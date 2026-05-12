import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, CalendarDays, Camera, Mic, Users, Video, MapPin, Clock, X, Check, ChevronsUpDown, UserPlus,
} from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale/es";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAddEvento, useUpdateEvento, useEventLocations, useAddEventGuests, PROJECT_TYPES, type EventRow } from "./useEventos";
import AddGuestsModal, { type LocalGuest } from "./AddGuestsModal";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  { value: "Shooting", label: "Shooting", icon: Camera },
  { value: "Podcast", label: "Podcast", icon: Mic },
  { value: "Casting", label: "Casting", icon: Users },
  { value: "Reunion", label: "Reunión", icon: Video },
  { value: "Otro", label: "Otro", icon: CalendarDays },
];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

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

interface NuevoEventoFormProps {
  event?: EventRow;
  existingGuests?: LocalGuest[];
}

const NuevoEventoForm = ({ event, existingGuests }: NuevoEventoFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const addEvento = useAddEvento();
  const updateEvento = useUpdateEvento();
  const addGuests = useAddEventGuests();
  const { data: locations = [] } = useEventLocations();

  const isEditMode = !!event;

  const [name, setName] = useState(event?.name ?? "");
  const [projectType, setProjectType] = useState(event?.project_type ?? "");
  const [eventType, setEventType] = useState(event?.event_type ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [multiDay, setMultiDay] = useState(!!event?.end_date);
  const [date, setDate] = useState<Date | undefined>(
    event?.date ? parse(event.date, "yyyy-MM-dd", new Date()) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    event?.end_date ? parse(event.end_date, "yyyy-MM-dd", new Date()) : undefined
  );
  const [startH, setStartH] = useState(event?.start_time?.slice(0, 2) ?? "");
  const [startM, setStartM] = useState(event?.start_time?.slice(3, 5) ?? "00");
  const [endH, setEndH] = useState(event?.end_time?.slice(0, 2) ?? "");
  const [endM, setEndM] = useState(event?.end_time?.slice(3, 5) ?? "00");
  const [location, setLocation] = useState(event?.location ?? "");
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState(event?.location ?? "");
  const [maxCapacity, setMaxCapacity] = useState(event?.max_capacity?.toString() ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [includeVideoCall, setIncludeVideoCall] = useState(!!(event as any)?.video_call_room_id);
  const [showCustomProject, setShowCustomProject] = useState(false);
  const [customProject, setCustomProject] = useState("");

  // Guests
  const [guests, setGuests] = useState<LocalGuest[]>(existingGuests ?? []);
  const [guestsModalOpen, setGuestsModalOpen] = useState(false);

  const duration = computeDuration(startH, startM, endH, endM);

  const handleAddGuests = (newGuests: LocalGuest[]) => {
    setGuests((prev) => [...prev, ...newGuests]);
    setGuestsModalOpen(false);
  };

  const removeGuest = (index: number) => {
    setGuests((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const finalProject = showCustomProject ? customProject.trim() : projectType;
    if (!name.trim() || !eventType || !date || !finalProject) {
      toast({ title: "Completa los campos obligatorios (nombre, tipo, proyecto, fecha)", variant: "destructive" });
      return;
    }

    const videoCallRoomId = includeVideoCall ? `event-${isEditMode ? event.id : crypto.randomUUID()}` : null;

    const formData = {
      name: name.trim(),
      event_type: eventType,
      project_type: finalProject,
      description: description || null,
      date: format(date, "yyyy-MM-dd"),
      end_date: multiDay && endDate ? format(endDate, "yyyy-MM-dd") : null,
      start_time: startH ? `${startH}:${startM}:00` : null,
      end_time: endH ? `${endH}:${endM}:00` : null,
      location: location || null,
      max_capacity: maxCapacity ? parseInt(maxCapacity) : null,
      notes: notes || null,
      video_call_room_id: videoCallRoomId,
    };

    try {
      if (isEditMode) {
        await updateEvento.mutateAsync({ id: event.id, data: formData });

        // Add only new guests (those without an existing id)
        const newGuests = guests.filter((g) => !(g as any)._existing);
        if (newGuests.length > 0) {
          await addGuests.mutateAsync(
            newGuests.map((g) => ({
              event_id: event.id,
              guest_type: g.type,
              creator_id: g.creator_id ?? null,
              guest_name: g.guest_name,
            }))
          );
        }

        toast({ title: "Evento actualizado exitosamente" });
        navigate(`/eventos/${event.id}`);
      } else {
        const inserted = await addEvento.mutateAsync(formData as any);

        if (guests.length > 0 && inserted?.id) {
          await addGuests.mutateAsync(
            guests.map((g) => ({
              event_id: inserted.id,
              guest_type: g.type,
              creator_id: g.creator_id ?? null,
              guest_name: g.guest_name,
            }))
          );
        }

        toast({ title: "Evento creado exitosamente" });
        navigate("/eventos");
      }
    } catch (err: any) {
      toast({ title: isEditMode ? "Error al actualizar evento" : "Error al crear evento", description: err.message, variant: "destructive" });
    }
  };

  const existingCreatorIds = guests.filter((g) => g.creator_id).map((g) => g.creator_id!);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Fixed Header */}
      <header className="bg-background/60 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <button
          onClick={() => navigate("/eventos")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Eventos
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" /> {isEditMode ? "Editar Evento" : "Crear Evento"}
        </h1>
        <p className="text-sm text-muted-foreground">{isEditMode ? "Modifica los detalles del evento" : "Configura los detalles del evento y agrega invitados"}</p>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-6">
        <div>
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
                    <Label>Proyecto *</Label>
                    {showCustomProject ? (
                      <div className="flex gap-2">
                        <Input
                          value={customProject}
                          onChange={(e) => setCustomProject(e.target.value)}
                          placeholder="Nombre del nuevo proyecto"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowCustomProject(false); setCustomProject(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Select value={projectType} onValueChange={(val) => {
                        if (val === "__custom__") {
                          setShowCustomProject(true);
                          setProjectType("");
                        } else {
                          setProjectType(val);
                        }
                      }}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar proyecto" /></SelectTrigger>
                        <SelectContent>
                          {PROJECT_TYPES.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                          <SelectItem value="__custom__" className="text-primary font-medium">
                            + Agregar proyecto
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
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
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP", { locale: es }) : "Seleccionar fecha"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            locale={es}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {multiDay && (
                      <div className="space-y-2">
                        <Label>Fecha fin</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                            >
                              <CalendarDays className="mr-2 h-4 w-4" />
                              {endDate ? format(endDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={endDate}
                              onSelect={setEndDate}
                              locale={es}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
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

                  {/* Location Combobox */}
                  <div className="space-y-2">
                    <Label>Ubicación</Label>
                    <Popover open={locationOpen} onOpenChange={setLocationOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={locationOpen}
                          className="w-full justify-between font-normal"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            {location || <span className="text-muted-foreground">Buscar o escribir ubicación...</span>}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Escribir dirección..."
                            value={locationSearch}
                            onValueChange={(val) => {
                              setLocationSearch(val);
                              setLocation(val);
                            }}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {locationSearch ? (
                                <p className="text-sm py-2">Se usará: <strong>{locationSearch}</strong></p>
                              ) : (
                                <p className="text-sm py-2">Escribe una dirección</p>
                              )}
                            </CommandEmpty>
                            {locations.filter((l) =>
                              !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase())
                            ).length > 0 && (
                              <CommandGroup heading="Ubicaciones anteriores">
                                {locations
                                  .filter((l) =>
                                    !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase())
                                  )
                                  .map((loc) => (
                                    <CommandItem
                                      key={loc}
                                      value={loc}
                                      onSelect={() => {
                                        setLocation(loc);
                                        setLocationSearch(loc);
                                        setLocationOpen(false);
                                      }}
                                    >
                                      <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                                      {loc}
                                      {location === loc && <Check className="ml-auto h-4 w-4" />}
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Capacidad Máxima</Label>
                    <Input type="number" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Opcional" min={1} />
                  </div>

                  <div className="space-y-2">
                    <Label>Notas</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas adicionales…" rows={2} />
                  </div>

                  {/* Video call toggle */}
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center gap-3">
                      <Video className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Videollamada</p>
                        <p className="text-xs text-muted-foreground">Generar sala de videollamada para este evento</p>
                      </div>
                    </div>
                    <Switch checked={includeVideoCall} onCheckedChange={setIncludeVideoCall} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column - Guests */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Invitados ({guests.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {guests.length === 0 ? (
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
                      <Button variant="outline" size="sm" onClick={() => setGuestsModalOpen(true)}>
                        <Users className="mr-2 h-4 w-4" />
                        Agregar Invitados
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        {guests.map((g, i) => (
                          <div key={i} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                {g.guest_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{g.guest_name}</p>
                                <p className="text-[10px] text-muted-foreground capitalize">{g.type === "creator" ? "Creadora" : g.type === "external" ? "Externo" : "Contacto"}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeGuest(i)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <Separator />
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setGuestsModalOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Agregar más
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <footer className="bg-background border-t border-border px-6 py-4 flex justify-end gap-3 shrink-0">
        <Button
          variant="outline"
          onClick={() => {
            toast({ title: "Edición cancelada" });
            navigate(isEditMode ? `/eventos/${event.id}` : "/eventos");
          }}
        >
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={addEvento.isPending || updateEvento.isPending}>
          {(addEvento.isPending || updateEvento.isPending) ? "Guardando…" : isEditMode ? "Guardar cambios" : "Crear Evento"}
        </Button>
      </footer>

      {/* Guests Modal */}
      <AddGuestsModal
        open={guestsModalOpen}
        onOpenChange={setGuestsModalOpen}
        onConfirm={handleAddGuests}
        existingCreatorIds={existingCreatorIds}
      />
    </main>
  );
};

export default NuevoEventoForm;
