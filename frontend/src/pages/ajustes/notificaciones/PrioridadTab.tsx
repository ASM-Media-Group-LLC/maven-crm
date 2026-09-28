import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListRow } from "@/components/ui/list-row";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

const PRIORITY_LEVELS = [
  { key: "high", label: "settings.notif.prio.high", desc: "settings.notif.prio.highDesc", icon: AlertTriangle, color: "text-destructive" },
  { key: "medium", label: "settings.notif.prio.medium", desc: "settings.notif.prio.mediumDesc", icon: AlertCircle, color: "text-warning" },
  { key: "low", label: "settings.notif.prio.low", desc: "settings.notif.prio.lowDesc", icon: Info, color: "text-muted-foreground" },
] as const;

// `value` es dato (SelectItem); lo que se ve es `label`, clave del diccionario.
const DELIVERY_OPTIONS = [
  { value: "all", label: "settings.notif.prio.all" },
  { value: "popup", label: "settings.notif.prio.popup" },
  { value: "banner", label: "settings.notif.prio.banner" },
  { value: "center_only", label: "settings.notif.prio.center" },
] as const;

const PrioridadTab = () => {
  const { t } = useLanguage();
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("settings.notif.prio.title")}</CardTitle>
        <CardDescription className="text-xs">
          {t("settings.notif.prio.desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PRIORITY_LEVELS.map(({ key, label, desc, icon: Icon, color }) => (
          <ListRow key={key} className="justify-between px-4 py-3">
            <div className="flex items-start gap-3">
              <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
              <div>
                <span className="text-sm font-medium">{t(label)}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{t(desc)}</p>
              </div>
            </div>
            <Select defaultValue={key === "high" ? "all" : key === "medium" ? "banner" : "center_only"}>
              <SelectTrigger className="w-[200px] text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {t(opt.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ListRow>
        ))}
        <p className="text-[11px] text-muted-foreground px-1">
          {t("settings.notif.prio.note")}

        </p>
      </CardContent>
    </Card>
  );
};

export default PrioridadTab;
