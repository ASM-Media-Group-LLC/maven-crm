import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PrioritySelect from "./PrioritySelect";
import type { Task } from "./useTareas";
import { TIME_OPTIONS } from "./timeOptions";

interface EditTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  profiles: { id: string; full_name: string | null }[];
  onSubmit: (data: {
    id: string;
    title: string;
    description?: string;
    assignee_ids: string[];
    due_at: string;
    duration_hours: number;
    duration_minutes: number;
    priority?: string;
    start_at?: string;
    status?: string;
  }) => void;
  isLoading?: boolean;
}

const EditTaskModal = ({ open, onOpenChange, task, profiles, onSubmit, isLoading }: EditTaskModalProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedUsers, setAssignedUsers] = useState<string[]>([]);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("active");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState("18:00");
  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setAssignedUsers(task.assignees?.length > 0 ? [...task.assignees] : (task.assigned_to ? [task.assigned_to] : []));
      setPriority(task.priority || "medium");
      setStatus(task.status || "active");
      const due = new Date(task.due_at);
      setEndDate(due);
      const endHH = format(due, "HH:mm");
      setEndTime(endHH === "23:59" ? "" : endHH);
      if (task.start_at) {
        const start = new Date(task.start_at);
        setStartDate(start);
        const startHH = format(start, "HH:mm");
        setStartTime(startHH === "00:00" ? "" : startHH);
      } else {
        setStartDate(undefined);
        setStartTime("");
      }
    }
  }, [task]);

  const toggleUser = (userId: string) => {
    setAssignedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !task) {
      toast({ title: "Error", description: "El título es obligatorio.", variant: "destructive" });
      return;
    }
    if (assignedUsers.length === 0) {
      toast({ title: "Error", description: "Selecciona al menos un usuario.", variant: "destructive" });
      return;
    }
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

    let startAtIso: string | undefined;
    if (startDate) {
      const start = new Date(startDate);
      if (startTime) {
        const [sH, sM] = startTime.split(":").map(Number);
        start.setHours(sH || 0, sM || 0, 0, 0);
      } else {
        start.setHours(0, 0, 0, 0);
      }
      startAtIso = start.toISOString();
    }

    const diffMs = Math.max(end.getTime() - Date.now(), 0);
    const durationH = Math.floor(diffMs / 3600000);
    const durationM = Math.floor((diffMs % 3600000) / 60000);

    onSubmit({
      id: task.id,
      title: title.trim(),
      description: description.trim() || undefined,
      assignee_ids: assignedUsers,
      due_at: end.toISOString(),
      duration_hours: durationH,
      duration_minutes: durationM,
      priority,
      start_at: startAtIso,
      status,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md !flex !flex-col gap-0 max-h-[85vh]">
        <DialogHeader className="pr-8 shrink-0">
          <DialogTitle>Editar Tarea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-1 py-2">
            <div>
              <Label htmlFor="edit-title">Título</Label>
              <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-desc">Descripción</Label>
              <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PrioritySelect value={priority} onChange={setPriority} />
              <div>
                <Label>Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En curso</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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

            {/* Fecha de inicio */}
            <div>
              <Label>Fecha de inicio (opcional)</Label>
              <div className="flex gap-2 mt-1">
                <Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "dd/MM/yyyy") : "Sin fecha inicio"}
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

            {/* Fecha de vencimiento */}
            <div>
              <Label>Fecha de vencimiento</Label>
              <div className="flex gap-2 mt-1">
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
          </div>

          <div className="flex justify-end gap-2 shrink-0 pt-4 px-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTaskModal;
