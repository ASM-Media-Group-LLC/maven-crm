import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { ROLE_TIER_LABELS, type RoleConfig, type RoleTier } from "./useRoles";

// Cuatro niveles y nada más — Empleado < Supervisor < Management < Admin (Jhon,
// 08/09). El "tipo de acceso" ES el nivel: la base deriva de él quién puede
// gestionar a quién y qué cuenta como "subordinado" en Permisos de datos. Un
// número interno existe (roles_config.level) pero no se muestra ni se edita:
// exponerlo solo confundió.

interface EditRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleConfig | null;
  onConfirm: (id: string, name: string, description: string | undefined, aiDailyQuota: number | null, tier: RoleTier) => void;
  isLoading: boolean;
}

const EditRoleModal = ({ open, onOpenChange, role, onConfirm, isLoading }: EditRoleModalProps) => {
  const { isAdmin } = useUserRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiQuota, setAiQuota] = useState("");
  const [tier, setTier] = useState<RoleTier>("member");

  useEffect(() => {
    if (role && open) {
      setName(role.name);
      setDescription(role.description || "");
      setAiQuota(role.ai_daily_quota != null ? String(role.ai_daily_quota) : "");
      setTier(role.tier);
    }
  }, [role, open]);

  // Los roles de sistema (admin, manager, supervisor, closer, agent, spammer,
  // employee) los puede retocar SOLO un admin: 24 policies y 9 funciones dependen
  // de "manager o superior", y bajar `manager` a supervisor se lo quita a todas
  // las managers de una. La base lo exige igual (RLS de roles_config y
  // role_groups son solo-admin); esto es para que el formulario lo diga.
  const bloqueado = !!role?.is_system && !isAdmin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Rol</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre del rol</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} disabled={role?.is_system} />
          </div>

          <div className="space-y-1.5">
            <Label>Nivel de acceso</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as RoleTier)} disabled={bloqueado}>
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
              {bloqueado
                ? "Rol de sistema: solo un admin puede cambiarle el nivel."
                : role?.is_system && tier !== role.tier
                  ? "⚠️ Rol de sistema: muchas reglas de la base dependen de su nivel. Cambiarlo afecta de inmediato a todas las personas con este rol."
                  : "De menor a mayor: Empleado < Supervisor < Management < Admin. Un rol gestiona, y ve como «subordinados», a los de nivel inferior. Los menús se configuran en \"Permisos\"."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Cuota IA / día (copiloto del inbox)</Label>
            <Input type="number" min={0} value={aiQuota} onChange={(e) => setAiQuota(e.target.value)} placeholder="20 (default)" />
            <p className="text-xs text-muted-foreground">Usos del copiloto ✨ por persona/día para este rol. Vacío = 20. Admin/managers: sin tope.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => role && onConfirm(role.id, name.trim(), description.trim() || undefined, aiQuota.trim() === "" ? null : Number(aiQuota), tier)}
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditRoleModal;
