import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { TaskProject } from "./useProjects";

interface EditProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TaskProject | null;
  onSubmit: (data: { id: string; name: string; description?: string }) => void;
  isLoading?: boolean;
}

const EditProjectModal = ({ open, onOpenChange, project, onSubmit, isLoading }: EditProjectModalProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || "");
    }
  }, [project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !project) {
      toast({ title: "Error", description: "El nombre es obligatorio.", variant: "destructive" });
      return;
    }
    onSubmit({ id: project.id, name: name.trim(), description: description.trim() || undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Editar Proyecto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-project-name">Nombre</Label>
            <Input id="edit-project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto" />
          </div>
          <div>
            <Label htmlFor="edit-project-desc">Descripción</Label>
            <Textarea id="edit-project-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" rows={3} />
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

export default EditProjectModal;
