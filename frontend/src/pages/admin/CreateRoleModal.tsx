import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_TIER_LABELS, type RoleTier } from "./useRoles";

interface CreateRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, description: string | undefined, tier: RoleTier) => void;
  isLoading: boolean;
}

const CreateRoleModal = ({ open, onOpenChange, onConfirm, isLoading }: CreateRoleModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState<RoleTier>("member");

  const handleSubmit = () => {
    onConfirm(name.trim(), description.trim() || undefined, tier);
    setName("");
    setDescription("");
    setTier("member");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Rol</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre del rol</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} placeholder="ej. supervisor" />
            <p className="text-xs text-muted-foreground">{name.length}/50</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nivel de acceso</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as RoleTier)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_TIER_LABELS) as RoleTier[]).map((t) => (
                  <SelectItem key={t} value={t}>{ROLE_TIER_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Define qué ve a nivel base de datos (RLS). Los permisos finos de menús se configuran después con "Permisos".
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} placeholder="Descripción del rol..." rows={3} />
            <p className="text-xs text-muted-foreground">{description.length}/300</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !name.trim()}>
            {isLoading ? "Creando..." : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoleModal;
