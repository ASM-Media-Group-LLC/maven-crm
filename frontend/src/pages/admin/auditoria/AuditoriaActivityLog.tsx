import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldOff, ArrowRightLeft, UserPlus, UserMinus } from "lucide-react";
import type { AuditLogEntry } from "./useAuditoriaData";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

interface Props {
  entries: AuditLogEntry[];
  profiles: Record<string, string>;
}

// La llave es audit_log.action (un dato); solo se traduce la etiqueta.
const actionConfig: Record<string, { label: TranslationKey; icon: typeof Shield; color: string }> = {
  role_assigned: { label: "admin.audit.actRoleAssigned", icon: Shield, color: "bg-success/10 text-success" },
  role_removed: { label: "admin.audit.actRoleRemoved", icon: ShieldOff, color: "bg-destructive/10 text-destructive" },
  role_changed: { label: "admin.audit.actRoleChanged", icon: ArrowRightLeft, color: "bg-warning/10 text-warning" },
  user_created: { label: "admin.addUser.created", icon: UserPlus, color: "bg-success/10 text-success" },
  user_deleted: { label: "admin.audit.actUserDeleted", icon: UserMinus, color: "bg-destructive/10 text-destructive" },
  permission_changed: { label: "admin.audit.actPermissionChanged", icon: Shield, color: "bg-violet-500/10 text-violet-500" },
};

const AuditoriaActivityLog = ({ entries, profiles }: Props) => {
  const f = useFormato();
  const { t } = useLanguage();
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        {t("admin.audit.noActivity")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const config = actionConfig[entry.action] || actionConfig.role_assigned;
        const Icon = config.icon;
        const userName = entry.user_id in profiles
          ? profiles[entry.user_id] || t("admin.noName")
          : t("admin.audit.unknownUser");
        const details = entry.details as Record<string, string>;

        let description = "";
        if (entry.action === "role_assigned") {
          description = t("admin.audit.descAssigned", { role: details.role, name: userName });
        } else if (entry.action === "role_removed") {
          description = t("admin.audit.descRemoved", { role: details.role, name: userName });
        } else if (entry.action === "role_changed") {
          description = t("admin.audit.descChanged", { name: userName, old: details.old_role, next: details.new_role });
        } else {
          description = `${entry.action} — ${userName}`;
        }

        return (
          <div
            key={entry.id}
            className="flex items-start gap-3 rounded-lg border bg-card p-4"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(entry.created_at), "d MMM yyyy, HH:mm", { locale: f.fechas })}
              </p>
            </div>
            <Badge variant="outline" className={`shrink-0 text-[10px] ${config.color}`}>
              {t(config.label)}
            </Badge>
          </div>
        );
      })}
    </div>
  );
};

export default AuditoriaActivityLog;
