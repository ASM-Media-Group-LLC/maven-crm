import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { FRANJA_POR_TIER, ROLE_TIER_LABELS, type RoleConfig, type RoleTier } from "./useRoles";
import { useLanguage } from "@/hooks/useLanguage";
import { ExonerarRolToggle } from "./ExonerarRolToggle";

// Dos campos que juntos forman la jerarquía (Jhon, 08/09):
//   · Nivel de acceso (tipo)  → la FRANJA: Empleado < Supervisor < Management < Admin.
//   · Posición en el nivel    → el número DENTRO de la franja. A mayor, más arriba:
//     un Management en 85 ve como subordinados a los Management en 80.
// Un supervisor nunca puede quedar por encima de un management: la franja manda.

interface EditRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleConfig | null;
  onConfirm: (id: string, name: string, description: string | undefined, aiDailyQuota: number | null, tier: RoleTier, level: number) => void;
  isLoading: boolean;
}

const EditRoleModal = ({ open, onOpenChange, role, onConfirm, isLoading }: EditRoleModalProps) => {
  const { isAdmin } = useUserRole();
  const { t } = useLanguage();
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
      setLevel(role.level ?? FRANJA_POR_TIER[role.tier][0]);
    }
  }, [role, open]);

  const [minNivel, maxNivel] = FRANJA_POR_TIER[tier];

  // Cambiar el tipo lleva el número a la base de la franja nueva (la base hace
  // lo mismo por trigger, así lo que se ve coincide con lo que se guarda).
  const cambiarTier = (t: RoleTier) => {
    setTier(t);
    setLevel(FRANJA_POR_TIER[t][0]);
  };

  // Los roles de sistema (admin, manager, supervisor, closer, agent, spammer,
  // employee) los puede retocar SOLO un admin: muchas reglas de la base dependen
  // de "management o superior" y bajar el tipo de un rol se lo quita a todas las
  // personas de una. La base lo exige igual (RLS de roles_config y role_groups
  // son solo-admin); esto es para que el formulario lo diga.
  const bloqueado = !!role?.is_system && !isAdmin;
  const nivelValido = Number.isInteger(level) && level >= minNivel && level <= maxNivel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.editRole.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("admin.roles.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} disabled={role?.is_system} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("admin.roles.accessLevel")}</Label>
            <Select value={tier} onValueChange={(v) => cambiarTier(v as RoleTier)} disabled={bloqueado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_TIER_LABELS) as RoleTier[]).map((nivel) => (
                  <SelectItem key={nivel} value={nivel}>{t(ROLE_TIER_LABELS[nivel])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {bloqueado
                ? t("admin.editRole.systemLocked")
                : role?.is_system && tier !== role.tier
                  ? t("admin.editRole.systemWarning")
                  : t("admin.editRole.levelHint")}
            </p>
          </div>

          {tier !== "admin" && (
            <div className="space-y-1.5">
              <Label>{t("admin.editRole.position")} <span className="text-muted-foreground font-normal">({minNivel}–{maxNivel})</span></Label>
              <Input
                type="number" min={minNivel} max={maxNivel} step={1}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                {isAdmin
                  ? t("admin.editRole.positionHint", { example: minNivel + 5, min: minNivel })
                  : t("admin.editRole.positionAdminOnly")}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("common.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.editRole.aiQuota")}</Label>
            <Input type="number" min={0} value={aiQuota} onChange={(e) => setAiQuota(e.target.value)} placeholder="20 (default)" />
            <p className="text-xs text-muted-foreground">{t("admin.editRole.aiQuotaHint")}</p>
          </div>
          {/* Exonerar de cámara/pantalla a todo el rol (solo dueño; se guarda solo). */}
          {role && <ExonerarRolToggle roleName={role.name} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => role && onConfirm(role.id, name.trim(), description.trim() || undefined, aiQuota.trim() === "" ? null : Number(aiQuota), tier, tier === "admin" ? 100 : level)}
            disabled={isLoading || !name.trim() || (tier !== "admin" && !nivelValido)}
          >
            {isLoading ? t("admin.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditRoleModal;
