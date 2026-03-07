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

type AudienceEntry = Omit<AudienceTarget, "id" | "announcement_id">;

interface Props {
  visibility: string;
  onVisibilityChange: (v: string) => void;
  audience: AudienceEntry[];
  onAudienceChange: (a: AudienceEntry[]) => void;
  deliveryChannels: string[];
  onDeliveryChannelsChange: (c: string[]) => void;
}

const CHANNELS = [
  { value: "feed", label: "Panel de anuncios" },
  { value: "notification", label: "Notificación" },
  { value: "banner", label: "Banner en dashboard" },
  { value: "popup", label: "Popup destacado" },
];

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

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Empleado" },
  { value: "agent", label: "Agente" },
  { value: "closer", label: "Closer" },
  { value: "supervisor", label: "Supervisor" },
];

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
  const { data: departments = [] } = useDepartments();
  const { data: profiles = [] } = useProfiles();
  const [addType, setAddType] = useState<string>("");
  const [addTarget, setAddTarget] = useState<string>("");

  const handleAddTarget = () => {
    if (!addType) return;

    if (addType === "all") {
      if (!audience.some((a) => a.target_type === "all")) {
        onAudienceChange([...audience, { target_type: "all", target_id: null, target_label: "Toda la empresa" }]);
      }
      setAddType("");
      return;
    }

    if (!addTarget) return;

    let label = addTarget;
    if (addType === "department") {
      label = departments.find((d) => d.id === addTarget)?.name ?? addTarget;
    } else if (addType === "role") {
      label = ROLES.find((r) => r.value === addTarget)?.label ?? addTarget;
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
      onAudienceChange([{ target_type: "all", target_id: null, target_label: "Toda la empresa" }]);
    }
  }, [visibility]);

  const targetOptions = addType === "department" ? departments.map((d) => ({ value: d.id, label: d.name }))
    : addType === "role" ? ROLES
    : addType === "user" ? profiles.map((p) => ({ value: p.id, label: p.full_name ?? "Sin nombre" }))
    : [];

  return (
    <div className="space-y-6">
      {/* Visibility */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Visibilidad</Label>
        <Select value={visibility} onValueChange={onVisibilityChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="global">🌐 Global — Visible para todos</SelectItem>
            <SelectItem value="segmented">👥 Segmentado — Por rol, departamento o equipo</SelectItem>
            <SelectItem value="personal">👤 Personal — Usuarios específicos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Audience targets */}
      {visibility !== "global" && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Destinatarios</Label>

          {/* Current targets */}
          {audience.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {audience.map((a, i) => {
                const Icon = TARGET_ICONS[a.target_type] ?? Users;
                return (
                  <Badge key={i} variant="secondary" className="gap-1.5 py-1 px-2.5">
                    <Icon className="h-3 w-3" />
                    <span className="text-xs capitalize">{a.target_type}:</span>
                    <span className="text-xs font-medium">{a.target_label}</span>
                    <button onClick={() => removeTarget(i)} className="ml-1 hover:text-destructive">
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
                <SelectTrigger className="h-9"><SelectValue placeholder="Tipo de destino" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda la empresa</SelectItem>
                  <SelectItem value="department">Departamento</SelectItem>
                  <SelectItem value="role">Rol</SelectItem>
                  <SelectItem value="user">Usuario</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {addType && addType !== "all" && (
              <div className="flex-1">
                <Select value={addTarget} onValueChange={setAddTarget}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
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
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delivery channels */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Canales de entrega</Label>
        <div className="grid grid-cols-2 gap-3">
          {CHANNELS.map((ch) => (
            <label
              key={ch.value}
              className="flex items-center gap-2.5 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={deliveryChannels.includes(ch.value)}
                onCheckedChange={() => toggleChannel(ch.value)}
              />
              <span className="text-sm">{ch.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AudienceSelector;
