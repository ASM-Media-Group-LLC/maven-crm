import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, Mail, Smartphone } from "lucide-react";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { usePermissions } from "@/hooks/usePermissions";
import { NOTIFICATION_TYPES_BY_MODULE } from "@/lib/notificationHelpers";
import { toast } from "sonner";

// Maps NOTIFICATION_TYPES_BY_MODULE keys to RBAC permission module names
const TYPES_MODULE_PERMISSION_MAP: Record<string, string> = {
  Creadores: "Creadores",
  Tareas: "Tareas",
  HR: "HR",
  Finanzas: "Finanzas",
  Eventos: "Eventos",
  Tickets: "Tickets",
  "Comunicación": "HR",
};

const EventosTab = () => {
  const { preferences, upsertPreference, isTypeEnabled, isModuleEnabled } = useNotificationPreferences();
  const { canAccess } = usePermissions();

  const accessibleModules = Object.entries(NOTIFICATION_TYPES_BY_MODULE).filter(
    ([module]) => {
      const permModule = TYPES_MODULE_PERMISSION_MAP[module];
      return permModule ? canAccess(permModule) : canAccess(module);
    }
  );

  const handleToggle = (module: string, type: string, currentEnabled: boolean) => {
    upsertPreference.mutate(
      { module, notification_type: type, is_enabled: !currentEnabled, channel_in_app: !currentEnabled },
      { onSuccess: () => toast.success("Preferencia actualizada") }
    );
  };

  const handleModuleToggle = (module: string) => {
    const currentlyEnabled = isModuleEnabled(module);
    const types = NOTIFICATION_TYPES_BY_MODULE[module as keyof typeof NOTIFICATION_TYPES_BY_MODULE] ?? [];
    types.forEach((t) => {
      upsertPreference.mutate({
        module,
        notification_type: t.type,
        is_enabled: !currentlyEnabled,
        channel_in_app: !currentlyEnabled,
      });
    });
    toast.success(currentlyEnabled ? "Módulo desactivado" : "Módulo activado");
  };

  if (accessibleModules.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No tienes acceso a módulos con notificaciones configurables.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {accessibleModules.map(([module, types]) => (
        <Card key={module} className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{module}</CardTitle>
                <CardDescription className="text-xs">{types.length} tipos de notificación</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Todas</span>
                <Switch
                  checked={isModuleEnabled(module)}
                  onCheckedChange={() => handleModuleToggle(module)}
                />
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="grid gap-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr,72px,72px,72px] gap-3 items-center px-2">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tipo</span>
                <div className="flex items-center justify-center gap-1">
                  <Bell className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">In-app</span>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">Email</span>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Smartphone className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">Push</span>
                </div>
              </div>

              {types.map((t) => {
                const enabled = isTypeEnabled(module, t.type);
                return (
                  <div
                    key={t.type}
                    className="grid grid-cols-[1fr,72px,72px,72px] gap-3 items-center rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium">{t.label}</span>
                    <div className="flex justify-center">
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => handleToggle(module, t.type, enabled)}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Badge variant="outline" className="text-[9px] text-muted-foreground cursor-not-allowed">
                        Pronto
                      </Badge>
                    </div>
                    <div className="flex justify-center">
                      <Badge variant="outline" className="text-[9px] text-muted-foreground cursor-not-allowed">
                        Pronto
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default EventosTab;
