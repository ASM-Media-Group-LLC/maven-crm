import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { toast } from "sonner";
import { Bell, Zap, Layers, Eye, Volume2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

// `key` es la columna de notification_settings (dato); `label`/`desc`, claves del diccionario.
const GENERAL_OPTIONS = [
  { key: "notifications_enabled", label: "settings.notif.gen.enabled", desc: "settings.notif.gen.enabledDesc", icon: Bell },
  { key: "realtime_enabled", label: "settings.notif.gen.realtime", desc: "settings.notif.gen.realtimeDesc", icon: Zap },
  { key: "group_similar", label: "settings.notif.gen.group", desc: "settings.notif.gen.groupDesc", icon: Layers },
  { key: "auto_mark_read_on_open", label: "settings.notif.gen.autoRead", desc: "settings.notif.gen.autoReadDesc", icon: Eye },
  { key: "sound_enabled", label: "settings.notif.gen.sound", desc: "settings.notif.gen.soundDesc", icon: Volume2 },
  { key: "show_critical_banners", label: "settings.notif.gen.banners", desc: "settings.notif.gen.bannersDesc", icon: AlertTriangle },
] as const;

const GeneralTab = () => {
  const { settings, updateSettings } = useNotificationSettings();
  const { t } = useLanguage();

  const handleToggle = (key: string, current: boolean) => {
    updateSettings.mutate(
      { [key]: !current } as any,
      { onSuccess: () => toast.success(t("settings.notif.prefUpdated")) }
    );
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("settings.notif.gen.title")}</CardTitle>
        <CardDescription className="text-xs">
          {t("settings.notif.gen.desc")}
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
                  <Label className="text-sm font-medium cursor-pointer">{t(label)}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(desc)}</p>
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
