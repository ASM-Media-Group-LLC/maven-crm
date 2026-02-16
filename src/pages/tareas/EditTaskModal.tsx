import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import PrioritySelect from "./PrioritySelect";
import type { Task } from "./useTareas";

interface EditTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  profiles: { id: string; full_name: string | null }[];
  onSubmit: (data: {
    id: string;
    title: string;
    description?: string;
    assigned_to: string;
    due_at: string;
    duration_hours: number;
    duration_minutes: number;
    priority?: string;
  }) => void;
  isLoading?: boolean;
}

const EditTaskModal = ({ open, onOpenChange, task, profiles, onSubmit, isLoading }: EditTaskModalProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [priority, setPriority] = useState("medium");
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState("18:00");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setAssignedTo(task.assigned_to);
      setPriority(task.priority || "medium");
      const due = new Date(task.due_at);
      setEndDate(due);
      setEndTime(format(due, "HH:mm"));
    }
  }, [task]);

  const selectedProfile = profiles.find((p) => p.id === assignedTo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !task) {
      toast({ title: "Error", description: "El título es obligatorio.", variant: "destructive" });
      return;
    }
    if (!assignedTo) {
      toast({ title: "Error", description: "Selecciona un usuario.", variant: "destructive" });
      return;
    }
    if (!endDate) {
      toast({ title: "Error", description: "La fecha de fin es obligatoria.", variant: "destructive" });
      return;
    }

    const [endH, endM] = endTime.split(":").map(Number);
    const end = new Date(endDate);
    end.setHours(endH || 0, endM || 0, 0, 0);

    const diffMs = Math.max(end.getTime() - Date.now(), 0);
    const durationH = Math.floor(diffMs / 3600000);
    const durationM = Math.floor((diffMs % 3600000) / 60000);

    onSubmit({
      id: task.id,
      title: title.trim(),
      description: description.trim() || undefined,
      assigned_to: assignedTo,
      due_at: end.toISOString(),
      duration_hours: durationH,
      duration_minutes: durationM,
      priority,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Editar Tarea</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-title">Título</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-desc">Descripción</Label>
            <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <PrioritySelect value={priority} onChange={setPriority} />

          <div>
            <Label>Asignar a</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
                          onSelect={() => { setAssignedTo(p.id); setComboboxOpen(false); }}
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

          <div>
            <Label>Fecha de vencimiento</Label>
            <div className="flex gap-2 mt-1">
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Guardando..." : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTaskModal;
