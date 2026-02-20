import { useState, useEffect } from "react";
import {
  CalendarDays, Camera, Mic, Users, Video, MapPin, Check, ChevronsUpDown,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useUpdateEvento, useEventLocations, type EventRow } from "./useEventos";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  { value: "Shooting", label: "Shooting", icon: Camera },
  { value: "Podcast", label: "Podcast", icon: Mic },
  { value: "Casting", label: "Casting", icon: Users },
  { value: "Reunion", label: "Reunión", icon: Video },
  { value: "Otro", label: "Otro", icon: CalendarDays },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRow;
}

const EditEventoModal = ({ open, onOpenChange, event }: Props) => {
  const { toast } = useToast();
  const updateEvento = useUpdateEvento();
  const { data: locations = [] } = useEventLocations();

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(event.name);
      setEventType(event.event_type);
      setDescription(event.description ?? "");
      setDate(event.date);
      setEndDate(event.end_date ?? "");
      setStartTime(event.start_time?.slice(0, 5) ?? "");
      setEndTime(event.end_time?.slice(0, 5) ?? "");
      setLocation(event.location ?? "");
      setLocationSearch(event.location ?? "");
      setMaxCapacity(event.max_capacity?.toString() ?? "");
      setNotes(event.notes ?? "");
    }
  }, [open, event]);

  const handleSave = () => {
    if (!name.trim() || !eventType || !date) {
      toast({ title: "Completa los campos obligatorios", variant: "destructive" });
      return;
    }
    updateEvento.mutate(
      {
        id: event.id,
        data: {
          name: name.trim(),
          event_type: eventType,
          description: description || null,
          date,
          end_date: endDate || null,
          start_time: startTime ? `${startTime}:00` : null,
          end_time: endTime ? `${endTime}:00` : null,
          location: location || null,
          max_capacity: maxCapacity ? parseInt(maxCapacity) : null,
          notes: notes || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Evento actualizado" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Evento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2"><t.icon className="h-4 w-4" />{t.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha inicio *</Label>
              <DateInput value={date} onChange={setDate} />
            </div>
            <div className="space-y-2">
              <Label>Fecha fin</Label>
              <DateInput value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Hora inicio</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora fin</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Location Combobox */}
          <div className="space-y-2">
            <Label>Ubicación</Label>
            <Popover open={locationOpen} onOpenChange={setLocationOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="flex items-center gap-2 truncate">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {location || <span className="text-muted-foreground">Buscar ubicación...</span>}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Escribir dirección..."
                    value={locationSearch}
                    onValueChange={(val) => { setLocationSearch(val); setLocation(val); }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {locationSearch ? <p className="text-sm py-2">Se usará: <strong>{locationSearch}</strong></p> : <p className="text-sm py-2">Escribe una dirección</p>}
                    </CommandEmpty>
                    {locations.filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase())).length > 0 && (
                      <CommandGroup heading="Ubicaciones anteriores">
                        {locations.filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase())).map((loc) => (
                          <CommandItem key={loc} value={loc} onSelect={() => { setLocation(loc); setLocationSearch(loc); setLocationOpen(false); }}>
                            <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />{loc}
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
            <Label>Capacidad máxima</Label>
            <Input type="number" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} min={1} />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updateEvento.isPending}>
            {updateEvento.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditEventoModal;
