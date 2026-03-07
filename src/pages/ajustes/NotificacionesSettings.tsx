import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, Mail, MessageCircle } from "lucide-react";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { usePermissions } from "@/hooks/usePermissions";
import { NOTIFICATION_TYPES_BY_MODULE } from "@/lib/notificationHelpers";
import { toast } from "sonner";
import HRLayout from "@/pages/hr/HRLayout";

const NotificacionesSettings = () => {
  const { preferences, upsertPreference, isTypeEnabled, isModuleEnabled } = useNotificationPreferences();
  const { canAccess } = usePermissions();

  const accessibleModules = Object.entries(NOTIFICATION_TYPES_BY_MODULE).filter(
    ([module]) => canAccess(module)
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

  return (
    <HRLayout>
      <div className="h-full overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Preferencias de Notificaciones</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configura qué notificaciones deseas recibir por módulo y tipo.
            </p>
          </div>

          {accessibleModules.map(([module, types]) => (
            <Card key={module} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{module}</CardTitle>
                    <CardDescription className="text-xs">{types.length} tipos de notificación</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`module-${module}`} className="text-xs text-muted-foreground">
                      Todas
                    </Label>
                    <Switch
                      id={`module-${module}`}
                      checked={isModuleEnabled(module)}
                      onCheckedChange={() => handleModuleToggle(module)}
                    />
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <div className="grid gap-3">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr,80px,80px,80px] gap-4 items-center px-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</span>
                    <div className="flex items-center justify-center gap-1">
                      <Bell className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">In-app</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Email</span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <MessageCircle className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
                    </div>
                  </div>

                  {types.map((t) => {
                    const enabled = isTypeEnabled(module, t.type);
                    return (
                      <div
                        key={t.type}
                        className="grid grid-cols-[1fr,80px,80px,80px] gap-4 items-center rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <div>
                          <span className="text-sm font-medium text-foreground">{t.label}</span>
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => handleToggle(module, t.type, enabled)}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Badge variant="outline" className="text-[10px] text-muted-foreground cursor-not-allowed">
                            Próximamente
                          </Badge>
                        </div>
                        <div className="flex justify-center">
                          <Badge variant="outline" className="text-[10px] text-muted-foreground cursor-not-allowed">
                            Próximamente
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {accessibleModules.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No tienes acceso a módulos con notificaciones configurables.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </HRLayout>
  );
};

export default NotificacionesSettings;
