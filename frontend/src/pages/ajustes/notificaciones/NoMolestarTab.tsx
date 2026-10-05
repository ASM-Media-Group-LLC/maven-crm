import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { toast } from "sonner";
import { Moon, Clock, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const NoMolestarTab = () => {
  const { settings, updateSettings } = useNotificationSettings();
  const { t } = useLanguage();

  const handleToggle = (key: string, current: boolean) => {
    updateSettings.mutate(
      { [key]: !current } as any,
      { onSuccess: () => toast.success(t("settings.notif.prefUpdated")) }
    );
  };

  const handleTimeChange = (key: string, value: string) => {
    updateSettings.mutate(
      { [key]: value } as any,
      { onSuccess: () => toast.success(t("settings.notif.dnd.scheduleUpdated")) }
    );
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("settings.notif.dnd.title")}</CardTitle>
        <CardDescription className="text-xs">
          {t("settings.notif.dnd.desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* DND Toggle */}
        <div className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-muted/50 transition-colors">
          <div className="flex items-start gap-3">
            <Moon className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">{t("settings.notif.dnd.enable")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("settings.notif.dnd.enableDesc")}
              </p>
            </div>
          </div>
          <Switch
            checked={settings.dnd_enabled}
            onCheckedChange={() => handleToggle("dnd_enabled", settings.dnd_enabled)}
          />
        </div>

        {settings.dnd_enabled && (
          <div className="space-y-4 pl-3">
            {/* Schedule */}
            <div className="flex items-start gap-3 rounded-md px-3 py-3 border border-border">
              <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="space-y-3 flex-1">
                <div>
                  <Label className="text-sm font-medium">{t("settings.notif.dnd.schedule")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.notif.dnd.scheduleDesc")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t("settings.notif.dnd.from")}</Label>
                    <Input
                      type="time"
                      className="w-32 text-xs h-8"
                      value={settings.dnd_start_time ?? "22:00"}
                      onChange={(e) => handleTimeChange("dnd_start_time", e.target.value)}
                    />
                  </div>
                  <span className="text-muted-foreground mt-5">—</span>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t("settings.notif.dnd.to")}</Label>
                    <Input
                      type="time"
                      className="w-32 text-xs h-8"
                      value={settings.dnd_end_time ?? "08:00"}
                      onChange={(e) => handleTimeChange("dnd_end_time", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Critical exceptions */}
            <div className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">{t("settings.notif.dnd.critical")}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.notif.dnd.criticalDesc")}
                  </p>

                </div>
              </div>
              <Switch
                checked={settings.dnd_allow_critical}
                onCheckedChange={() => handleToggle("dnd_allow_critical", settings.dnd_allow_critical)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NoMolestarTab;
