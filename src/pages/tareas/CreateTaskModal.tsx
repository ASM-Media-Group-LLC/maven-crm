import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: { id: string; full_name: string | null }[];
  onSubmit: (data: {
    title: string;
    description?: string;
    assigned_to: string;
    duration_hours: number;
    duration_minutes: number;
  }) => void;
  isLoading?: boolean;
}

const CreateTaskModal = ({ open, onOpenChange, profiles, onSubmit, isLoading }: CreateTaskModalProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);

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
    if (hours === 0 && minutes === 0) {
      toast({ title: "Error", description: "La duración debe ser mayor a 0.", variant: "destructive" });
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim() || undefined, assigned_to: assignedTo, duration_hours: hours, duration_minutes: minutes });
    setTitle(""); setDescription(""); setAssignedTo(""); setHours(0); setMinutes(0);
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
          <div>
            <Label>Asignar a</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Selecciona usuario" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || "Sin nombre"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
