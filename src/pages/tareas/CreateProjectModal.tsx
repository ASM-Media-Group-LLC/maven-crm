import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CreateProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string; memberIds?: string[] }) => void;
  isLoading?: boolean;
  profiles?: { id: string; full_name: string | null }[];
}

const CreateProjectModal = ({ open, onOpenChange, onSubmit, isLoading, profiles = [] }: CreateProjectModalProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const toggleMember = (id: string) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Error", description: "El nombre es obligatorio.", variant: "destructive" });
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      memberIds: selectedMembers.length > 0 ? selectedMembers : undefined,
    });
    setName("");
    setDescription("");
    setSelectedMembers([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Nuevo Proyecto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="project-name">Nombre</Label>
            <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto" />
          </div>
          <div>
            <Label htmlFor="project-desc">Descripción</Label>
            <Textarea id="project-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" rows={3} />
          </div>

          {/* Multi-select members */}
          {profiles.length > 0 && (
            <div>
              <Label>Miembros del proyecto</Label>
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedMembers.length > 0
                      ? `${selectedMembers.length} miembro(s)`
                      : "Agregar miembros"}
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
                            onSelect={() => toggleMember(p.id)}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selectedMembers.includes(p.id) ? "opacity-100" : "opacity-0")} />
                            {p.full_name || "Sin nombre"}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedMembers.map(id => {
                    const p = profiles.find(pr => pr.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="text-xs gap-1">
                        {p?.full_name || "Sin nombre"}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggleMember(id)} />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Creando..." : "Crear Proyecto"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateProjectModal;
