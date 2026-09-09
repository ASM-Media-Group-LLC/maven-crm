import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { NIVEL_POR_TIER, ROLE_TIER_LABELS, type RoleConfig, type RoleTier } from "./useRoles";

// Dos cosas distintas que la pantalla mezclaba bajo "Nivel de acceso" (08/09):
//   · TIPO de acceso (tier) → flags de role_groups: qué capacidades RLS tiene.
//   · NIVEL jerárquico (roles_config.level, 1-100) → quién gestiona a quién y qué
//     es "subordinado" en Permisos de datos. No se veía ni editaba en ningún lado.

interface EditRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleConfig | null;
  onConfirm: (id: string, name: string, description: string | undefined, aiDailyQuota: number | null, tier: RoleTier, level: number) => void;
  isLoading: boolean;
}

const EditRoleModal = ({ open, onOpenChange, role, onConfirm, isLoading }: EditRoleModalProps) => {
  const { isAdmin } = useUserRole();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiQuota, setAiQuota] = useState("");
  const [tier, setTier] = useState<RoleTier>("member");
  const [level, setLevel] = useState<number>(20);

  useEffect(() => {
    if (role && open) {
      setName(role.name);
      setDescription(role.description || "");
      setAiQuota(role.ai_daily_quota != null ? String(role.ai_daily_quota) : "");
      setTier(role.tier);
      setLevel(role.level ?? NIVEL_POR_TIER[role.tier]);
    }
  }, [role, open]);

  // Cambiar el tipo arrastra el nivel SOLO si el nivel seguía en el sugerido del
  // tipo anterior: si alguien lo afinó a mano (p. ej. 60), se respeta.
  const cambiarTier = (t: RoleTier) => {
    if (level === NIVEL_POR_TIER[tier]) setLevel(NIVEL_POR_TIER[t]);
    setTier(t);
  };

  // Los roles de sistema (admin, manager, supervisor, closer, agent, spammer,
  // employee) los puede retocar SOLO un admin: hay 24 policies y 9 funciones que
  // dependen de "manager_or_above", y bajar el tipo de `manager` se las quita a
  // todos sus usuarios de una. La base lo exige igual (RLS de roles_config y
  // role_groups son solo-admin); esto es para que el formulario lo diga.
  const bloqueado = !!role?.is_system && !isAdmin;
  const nivelValido = Number.isInteger(level) && level >= 1 && level <= 100;

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
            <Label>Tipo de acceso</Label>
            <Select value={tier} onValueChange={(v) => cambiarTier(v as RoleTier)} disabled={bloqueado}>
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
                ? "Rol de sistema: solo un admin puede cambiarle el tipo."
                : role?.is_system && tier !== role.tier
                  ? "⚠️ Rol de sistema: 24 reglas de la base y 9 funciones dependen de su tipo. Cambiarlo afecta de inmediato a todas las personas con este rol."
                  : "Qué capacidades tiene a nivel base de datos (RLS). Los menús se configuran en \"Permisos\"."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nivel jerárquico</Label>
            <Input
              type="number" min={1} max={100} step={1}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              disabled={!isAdmin}
            />
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? `Quién puede gestionar a quién, y qué cuenta como «subordinado» en Permisos de datos. Referencia: admin 100 · manager 80 · supervisor 50 · miembro 20. Sugerido para este tipo: ${NIVEL_POR_TIER[tier]}.`
                : "Solo un admin puede cambiar el nivel jerárquico."}
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
            onClick={() => role && onConfirm(role.id, name.trim(), description.trim() || undefined, aiQuota.trim() === "" ? null : Number(aiQuota), tier, level)}
            disabled={isLoading || !name.trim() || !nivelValido}
          >
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditRoleModal;
