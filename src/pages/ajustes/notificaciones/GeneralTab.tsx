import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { toast } from "sonner";
import { Bell, Zap, Layers, Eye, Volume2, AlertTriangle } from "lucide-react";

const GENERAL_OPTIONS = [
  { key: "notifications_enabled", label: "Notificaciones activas", desc: "Activar o desactivar todas las notificaciones dentro de la plataforma", icon: Bell },
  { key: "realtime_enabled", label: "Tiempo real", desc: "Mostrar notificaciones en tiempo real conforme llegan", icon: Zap },
  { key: "group_similar", label: "Agrupar similares", desc: "Agrupar notificaciones del mismo tipo para reducir saturación", icon: Layers },
  { key: "auto_mark_read_on_open", label: "Marcar como leídas al abrir", desc: "Marcar automáticamente como leídas al abrir el centro de notificaciones", icon: Eye },
  { key: "sound_enabled", label: "Sonido", desc: "Reproducir sonido para notificaciones importantes", icon: Volume2 },
  { key: "show_critical_banners", label: "Banners críticos", desc: "Mostrar banners emergentes para notificaciones de prioridad crítica", icon: AlertTriangle },
] as const;

const GeneralTab = () => {
  const { settings, updateSettings } = useNotificationSettings();

  const handleToggle = (key: string, current: boolean) => {
    updateSettings.mutate(
      { [key]: !current } as any,
      { onSuccess: () => toast.success("Preferencia actualizada") }
    );
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Preferencias Generales</CardTitle>
        <CardDescription className="text-xs">
          Controla el comportamiento global del sistema de notificaciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {GENERAL_OPTIONS.map(({ key, label, desc, icon: Icon }) => {
          const checked = settings[key as keyof typeof settings] as boolean;
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium cursor-pointer">{label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
              <Switch
                checked={checked}
                onCheckedChange={() => handleToggle(key, checked)}
                disabled={updateSettings.isPending}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default GeneralTab;
