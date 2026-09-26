import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_TIER_LABELS, type RoleTier } from "./useRoles";
import { useLanguage } from "@/hooks/useLanguage";

interface CreateRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string, description: string | undefined, tier: RoleTier) => void;
  isLoading: boolean;
}

const CreateRoleModal = ({ open, onOpenChange, onConfirm, isLoading }: CreateRoleModalProps) => {
  const { t } = useLanguage();
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
          <DialogTitle>{t("admin.createRole.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("admin.roles.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} placeholder={t("admin.createRole.namePlaceholder")} />
            <p className="text-xs text-muted-foreground">{name.length}/50</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("admin.roles.accessLevel")}</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as RoleTier)}>
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
              {t("admin.createRole.levelHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} placeholder={t("admin.createRole.descPlaceholder")} rows={3} />
            <p className="text-xs text-muted-foreground">{description.length}/300</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !name.trim()}>
            {isLoading ? t("admin.creating") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRoleModal;
