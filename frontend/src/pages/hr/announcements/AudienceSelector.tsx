import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Plus, Users, Building2, Shield, User, FolderKanban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { AudienceTarget } from "./useAnnouncementsAdmin";
import { useLanguage } from "@/hooks/useLanguage";
import {
  CANALES_ANUNCIO, ROLES_DESTINO, TODA_LA_EMPRESA_GUARDADO, canalAnuncio, etiquetaDestino, rolDestino, tipoDestino,
} from "./opcionesAnuncio";

type AudienceEntry = Omit<AudienceTarget, "id" | "announcement_id">;

interface Props {
  visibility: string;
  onVisibilityChange: (v: string) => void;
  audience: AudienceEntry[];
  onAudienceChange: (a: AudienceEntry[]) => void;
  deliveryChannels: string[];
  onDeliveryChannelsChange: (c: string[]) => void;
}

const useDepartments = () =>
  useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

const useProfiles = () =>
  useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      return data ?? [];
    },
  });

const TARGET_ICONS: Record<string, any> = {
  all: Users,
  department: Building2,
  role: Shield,
  user: User,
  project: FolderKanban,
};

const AudienceSelector = ({
  visibility,
  onVisibilityChange,
  audience,
  onAudienceChange,
  deliveryChannels,
  onDeliveryChannelsChange,
}: Props) => {
  const { t } = useLanguage();
  const { data: departments = [] } = useDepartments();
  const { data: profiles = [] } = useProfiles();
  const [addType, setAddType] = useState<string>("");
  const [addTarget, setAddTarget] = useState<string>("");

  const handleAddTarget = () => {
    if (!addType) return;

    if (addType === "all") {
      if (!audience.some((a) => a.target_type === "all")) {
        onAudienceChange([...audience, { target_type: "all", target_id: null, target_label: TODA_LA_EMPRESA_GUARDADO }]);
      }
      setAddType("");
      return;
    }

    if (!addTarget) return;

    let label = addTarget;
    if (addType === "department") {
      label = departments.find((d) => d.id === addTarget)?.name ?? addTarget;
    } else if (addType === "role") {
      // Se guarda en español: lo leen otras personas en el listado (ver opcionesAnuncio.ts).
      label = ROLES_DESTINO.find((r) => r.value === addTarget)?.guardado ?? addTarget;
    } else if (addType === "user") {
      label = profiles.find((p) => p.id === addTarget)?.full_name ?? addTarget;
    }

    if (!audience.some((a) => a.target_type === addType && a.target_id === addTarget)) {
      onAudienceChange([...audience, { target_type: addType, target_id: addTarget, target_label: label }]);
    }

    setAddTarget("");
    setAddType("");
  };

  const removeTarget = (idx: number) => {
    onAudienceChange(audience.filter((_, i) => i !== idx));
  };

  const toggleChannel = (ch: string) => {
    if (deliveryChannels.includes(ch)) {
      onDeliveryChannelsChange(deliveryChannels.filter((c) => c !== ch));
    } else {
      onDeliveryChannelsChange([...deliveryChannels, ch]);
    }
  };

  // Auto-set audience to "all" when global
  useEffect(() => {
    if (visibility === "global" && !audience.some((a) => a.target_type === "all")) {
      onAudienceChange([{ target_type: "all", target_id: null, target_label: TODA_LA_EMPRESA_GUARDADO }]);
    }
  }, [visibility]);

  const targetOptions = addType === "department" ? departments.map((d) => ({ value: d.id, label: d.name }))
    : addType === "role" ? ROLES_DESTINO.map((r) => ({ value: r.value, label: rolDestino(t, r.value, r.guardado) }))
    : addType === "user" ? profiles.map((p) => ({ value: p.id, label: p.full_name ?? t("hrg.noName") }))
    : [];

  return (
    <div className="space-y-6">
      {/* Visibility */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("hrg.ann.visibility")}</Label>
        <Select value={visibility} onValueChange={onVisibilityChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="global">🌐 {t("hrg.ann.visibility.global")}</SelectItem>
            <SelectItem value="segmented">👥 {t("hrg.ann.visibility.segmented")}</SelectItem>
            <SelectItem value="personal">👤 {t("hrg.ann.visibility.personal")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Audience targets */}
      {visibility !== "global" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t("hrg.ann.recipients")}</Label>

          {/* Current targets */}
          {audience.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {audience.map((a, i) => {
                const Icon = TARGET_ICONS[a.target_type] ?? Users;
                return (
                  <Badge key={i} variant="secondary" className="gap-1.5 py-1 px-2.5">
                    <Icon className="h-3 w-3" />
                    <span className="text-xs">{tipoDestino(t, a.target_type)}:</span>
                    <span className="text-xs font-medium">{etiquetaDestino(t, a)}</span>
                    <button onClick={() => removeTarget(i)} className="ml-1 hover:text-destructive" aria-label={t("hrg.ann.removeRecipient")}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Add target */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select value={addType} onValueChange={(v) => { setAddType(v); setAddTarget(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder={t("hrg.ann.targetType")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.entireCompany")}</SelectItem>
                  <SelectItem value="department">{t("hrg.ann.target.department")}</SelectItem>
                  <SelectItem value="role">{t("common.role")}</SelectItem>
                  <SelectItem value="user">{t("common.user")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {addType && addType !== "all" && (
              <div className="flex-1">
                <Select value={addTarget} onValueChange={setAddTarget}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>
                    {targetOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleAddTarget}
              disabled={!addType || (addType !== "all" && !addTarget)}
              aria-label={t("hrg.ann.addRecipient")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delivery channels */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("hrg.ann.channels")}</Label>
        <div className="grid grid-cols-2 gap-3">
          {CANALES_ANUNCIO.map((ch) => (
            <label
              key={ch}
              className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={deliveryChannels.includes(ch)}
                onCheckedChange={() => toggleChannel(ch)}
              />
              <span className="text-sm">{canalAnuncio(t, ch)}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AudienceSelector;
