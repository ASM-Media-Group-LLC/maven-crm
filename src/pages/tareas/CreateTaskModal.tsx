import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PrioritySelect from "./PrioritySelect";
import { TIME_OPTIONS } from "./timeOptions";
import { Diamond, Link, Unplug } from "lucide-react";

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: { id: string; full_name: string | null }[];
  projectId?: string;
  onSubmit: (data: {
    title: string;
    description?: string;
    assignee_ids: string[];
    due_at: string;
    duration_hours: number;
    duration_minutes: number;
    project_id?: string;
    priority?: string;
    start_at?: string;
  }) => void;
  isLoading?: boolean;
}

const CreateTaskModal = ({ open, onOpenChange, profiles, projectId, onSubmit, isLoading }: CreateTaskModalProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [priority, setPriority] = useState("medium");
  const [timeMode, setTimeMode] = useState<"duration" | "date">("duration");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen] = useState(false);
  const [taskType, setTaskType] = useState("task");

  const toggleUser = (userId: string) => {
    setAssignedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAssignedUsers([]);
    setHours(0);
    setMinutes(0);
    setTimeMode("duration");
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime("");
    setEndTime("");
    setPriority("medium");
    setTaskType("task");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Error", description: "El título es obligatorio.", variant: "destructive" });
      return;
    }
    if (assignedUsers.length === 0) {
      toast({ title: "Error", description: "Selecciona al menos un usuario.", variant: "destructive" });
      return;
    }

    let dueAt: string;
    let durationH = 0;
    let durationM = 0;
    let startAtIso: string | undefined;

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
      const end = new Date(endDate);
      if (endTime) {
        const [endH, endM] = endTime.split(":").map(Number);
        end.setHours(endH || 0, endM || 0, 0, 0);
      } else {
        end.setHours(23, 59, 59, 0);
      }
      dueAt = end.toISOString();

      if (startDate) {
        const start = new Date(startDate);
        if (startTime) {
          const [startH, startM] = startTime.split(":").map(Number);
          start.setHours(startH || 0, startM || 0, 0, 0);
        } else {
          start.setHours(0, 0, 0, 0);
        }
        startAtIso = start.toISOString();
      }

      const startRef = startDate ? new Date(startDate) : new Date();
      if (startTime) {
        const [startH, startM] = startTime.split(":").map(Number);
        startRef.setHours(startH || 0, startM || 0, 0, 0);
      }
      const diffMs = Math.max(end.getTime() - startRef.getTime(), 0);
      durationH = Math.floor(diffMs / 3600000);
      durationM = Math.floor((diffMs % 3600000) / 60000);
    }

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      assignee_ids: assignedUsers,
      due_at: dueAt,
      duration_hours: durationH,
      duration_minutes: durationM,
      project_id: projectId,
      priority,
      start_at: startAtIso,
    });
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md !flex !flex-col gap-0 max-h-[85vh]">
        <DialogHeader className="pr-8 shrink-0">
          <DialogTitle>Nueva Tarea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-1 py-2">
            <div>
              <Label htmlFor="title">Título</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre de la tarea" />
            </div>
            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" rows={3} />
            </div>

            <PrioritySelect value={priority} onChange={setPriority} />

            {/* Multi-select de usuarios */}
            <div>
              <Label>Asignar a</Label>
              {assignedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {assignedUsers.map((uid) => {
                    const p = profiles.find((pr) => pr.id === uid);
                    return (
                      <Badge key={uid} variant="secondary" className="text-xs gap-1 pr-1">
                        {p?.full_name || "Sin nombre"}
                        <button type="button" onClick={() => toggleUser(uid)} className="ml-0.5 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboboxOpen}
                    className="w-full justify-between font-normal"
                  >
                    {assignedUsers.length === 0 ? "Seleccionar usuarios" : `${assignedUsers.length} seleccionado(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" side="bottom">
                  <Command>
                    <CommandInput placeholder="Buscar usuario..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron usuarios</CommandEmpty>
                      <CommandGroup>
                        {profiles.slice().sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")).map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.full_name || "Sin nombre"}
                            onSelect={() => toggleUser(p.id)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", assignedUsers.includes(p.id) ? "opacity-100" : "opacity-0")} />
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
                  <div>
                    <Label>Fecha inicio (opcional)</Label>
                    <div className="flex gap-2">
                      <Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "dd/MM/yyyy") : "Ahora"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartCalOpen(false); }} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                      <div className="relative">
                        <Select value={startTime || undefined} onValueChange={setStartTime}>
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="Sin hora" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {startTime && (
                          <button type="button" onClick={() => setStartTime("")} className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Fecha fin *</Label>
                    <div className="flex gap-2">
                      <Popover open={endCalOpen} onOpenChange={setEndCalOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "dd/MM/yyyy") : "Seleccionar fecha"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndCalOpen(false); }} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                      <div className="relative">
                        <Select value={endTime || undefined} onValueChange={setEndTime}>
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="Sin hora" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_OPTIONS.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {endTime && (
                          <button type="button" onClick={() => setEndTime("")} className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Hora opcional — sin hora se usa fin de día</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="flex justify-end gap-2 shrink-0 pt-4 px-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Creando..." : "Crear Tarea"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTaskModal;
