import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: { id: string; full_name: string | null }[];
  projectId?: string;
  onSubmit: (data: {
    title: string;
    description?: string;
    assigned_to: string;
    due_at: string;
    duration_hours: number;
    duration_minutes: number;
    project_id?: string;
  }) => void;
  isLoading?: boolean;
}

const CreateTaskModal = ({ open, onOpenChange, profiles, projectId, onSubmit, isLoading }: CreateTaskModalProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // Duration mode
  const [timeMode, setTimeMode] = useState<"duration" | "date">("duration");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);

  // Date mode
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  const selectedProfile = profiles.find((p) => p.id === assignedTo);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAssignedTo("");
    setHours(0);
    setMinutes(0);
    setTimeMode("duration");
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime("09:00");
    setEndTime("18:00");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Error", description: "El título es obligatorio.", variant: "destructive" });
      return;
    }
    if (!assignedTo) {
      toast({ title: "Error", description: "Selecciona un usuario.", variant: "destructive" });
      return;
    }

    let dueAt: string;
    let durationH = 0;
    let durationM = 0;

    if (timeMode === "duration") {
      if (hours === 0 && minutes === 0) {
        toast({ title: "Error", description: "La duración debe ser mayor a 0.", variant: "destructive" });
        return;
      }
      durationH = hours;
      durationM = minutes;
      dueAt = new Date(Date.now() + hours * 3600000 + minutes * 60000).toISOString();
    } else {
      if (!endDate) {
        toast({ title: "Error", description: "La fecha de fin es obligatoria.", variant: "destructive" });
        return;
      }
      const [endH, endM] = endTime.split(":").map(Number);
      const end = new Date(endDate);
      end.setHours(endH || 0, endM || 0, 0, 0);
      dueAt = end.toISOString();

      // Calculate approximate duration for display
      const start = startDate ? new Date(startDate) : new Date();
      const [startH, startM] = startTime.split(":").map(Number);
      start.setHours(startH || 0, startM || 0, 0, 0);
      const diffMs = Math.max(end.getTime() - start.getTime(), 0);
      durationH = Math.floor(diffMs / 3600000);
      durationM = Math.floor((diffMs % 3600000) / 60000);
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      assigned_to: assignedTo,
      due_at: dueAt,
      duration_hours: durationH,
      duration_minutes: durationM,
      project_id: projectId,
    });
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Nueva Tarea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre de la tarea" />
          </div>
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" rows={3} />
          </div>

          {/* Combobox de usuario */}
          <div>
            <Label>Asignar a</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedProfile ? (selectedProfile.full_name || "Sin nombre") : "Selecciona usuario"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar usuario..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron usuarios</CommandEmpty>
                    <CommandGroup>
                      {profiles.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.full_name || "Sin nombre"}
                          onSelect={() => {
                            setAssignedTo(p.id);
                            setComboboxOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", assignedTo === p.id ? "opacity-100" : "opacity-0")} />
                          {p.full_name || "Sin nombre"}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Tabs de duración / fecha */}
          <div>
            <Label>Plazo</Label>
            <Tabs value={timeMode} onValueChange={(v) => setTimeMode(v as "duration" | "date")} className="mt-1">
              <TabsList className="w-full">
                <TabsTrigger value="duration" className="flex-1">Duración</TabsTrigger>
                <TabsTrigger value="date" className="flex-1">Fecha</TabsTrigger>
              </TabsList>

              <TabsContent value="duration" className="mt-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="hours">Horas</Label>
                    <Input id="hours" type="number" min={0} max={999} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="minutes">Minutos</Label>
                    <Input id="minutes" type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="date" className="mt-3 space-y-3">
                {/* Fecha inicio */}
                <div>
                  <Label>Fecha inicio (opcional)</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "dd/MM/yyyy") : "Ahora"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-28" />
                  </div>
                </div>

                {/* Fecha fin */}
                <div>
                  <Label>Fecha fin *</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "dd/MM/yyyy") : "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-28" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Creando..." : "Crear Tarea"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskModal;
