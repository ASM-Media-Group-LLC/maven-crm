import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, Smartphone, FileText, CheckCircle2 } from "lucide-react";
import NotificacionesEnEsteDispositivo from "./NotificacionesEnEsteDispositivo";
import { useLanguage } from "@/hooks/useLanguage";

const CHANNELS = [
  { key: "in_app", label: "settings.notif.ch.inApp", desc: "settings.notif.ch.inAppDesc", icon: Bell, active: true },
  { key: "email", label: "settings.notif.ch.email", desc: "settings.notif.ch.emailDesc", icon: Mail, active: true },
  { key: "push", label: "settings.notif.ch.push", desc: "settings.notif.ch.pushDesc", icon: Smartphone, active: false },
  { key: "digest", label: "settings.notif.ch.digest", desc: "settings.notif.ch.digestDesc", icon: FileText, active: false, linkTab: "resumenes" },
] as const;

const CanalesTab = () => {
  const { t } = useLanguage();
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("settings.notif.ch.title")}</CardTitle>
        <CardDescription className="text-xs">
          {t("settings.notif.ch.desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {CHANNELS.map(({ key, label, desc, icon: Icon, active }) => key === "push" ? (
          // Web Push de verdad, por dispositivo (ver el componente).
          <NotificacionesEnEsteDispositivo key="push" />
        ) : (
          <div
            key={key}
            className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">{t(label)}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{t(desc)}</p>
              </div>
            </div>
            {active ? (
              <Badge variant="default" className="text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {t("common.active")}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {t("common.comingSoon")}
              </Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default CanalesTab;
