import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { toast } from "sonner";

const ResumenesTab = () => {
  const { settings, updateSettings } = useNotificationSettings();

  const handleToggle = (key: string, current: boolean) => {
    updateSettings.mutate(
      { [key]: !current } as any,
      { onSuccess: () => toast.success("Preferencia actualizada") }
    );
  };

  const handleChange = (key: string, value: string) => {
    updateSettings.mutate(
      { [key]: value } as any,
      { onSuccess: () => toast.success("Preferencia actualizada") }
    );
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resúmenes Automáticos</CardTitle>
        <CardDescription className="text-xs">
          Configura resúmenes periódicos para evitar saturación de notificaciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-muted/50 transition-colors">
          <div>
            <Label className="text-sm font-medium">Activar resúmenes</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recibir un digest con el resumen de tu actividad
            </p>
          </div>
          <Switch
            checked={settings.digest_enabled}
            onCheckedChange={() => handleToggle("digest_enabled", settings.digest_enabled)}
          />
        </div>

        {settings.digest_enabled && (
          <div className="grid gap-4 pl-3">
            {/* Frequency */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Frecuencia</Label>
              <Select value={settings.digest_frequency} onValueChange={(v) => handleChange("digest_frequency", v)}>
                <SelectTrigger className="w-48 text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily" className="text-xs">Diario</SelectItem>
                  <SelectItem value="weekly" className="text-xs">Semanal</SelectItem>
                  <SelectItem value="per_module" className="text-xs">Por módulo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hora de entrega</Label>
              <Input
                type="time"
                className="w-48 text-xs h-8"
                value={settings.digest_time}
                onChange={(e) => handleChange("digest_time", e.target.value)}
              />
            </div>

            {/* Channel */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Canal de entrega</Label>
              <Select value={settings.digest_channel} onValueChange={(v) => handleChange("digest_channel", v)}>
                <SelectTrigger className="w-48 text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_app" className="text-xs">In-app</SelectItem>
                  <SelectItem value="email" className="text-xs" disabled>Email (próximamente)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground px-1">
          Los resúmenes automáticos estarán disponibles próximamente. Tu configuración se guardará para cuando estén activos.
        </p>
      </CardContent>
    </Card>
  );
};

export default ResumenesTab;
