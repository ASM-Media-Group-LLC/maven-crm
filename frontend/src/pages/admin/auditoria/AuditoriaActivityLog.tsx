import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldOff, ArrowRightLeft, UserPlus, UserMinus } from "lucide-react";
import type { AuditLogEntry } from "./useAuditoriaData";

interface Props {
  entries: AuditLogEntry[];
  profiles: Record<string, string>;
}

const actionConfig: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  role_assigned: { label: "Rol asignado", icon: Shield, color: "bg-success/10 text-success" },
  role_removed: { label: "Rol eliminado", icon: ShieldOff, color: "bg-destructive/10 text-destructive" },
  role_changed: { label: "Rol cambiado", icon: ArrowRightLeft, color: "bg-warning/10 text-warning" },
  user_created: { label: "Usuario creado", icon: UserPlus, color: "bg-blue-500/10 text-blue-500" },
  user_deleted: { label: "Usuario eliminado", icon: UserMinus, color: "bg-destructive/10 text-destructive" },
  permission_changed: { label: "Permiso modificado", icon: Shield, color: "bg-violet-500/10 text-violet-500" },
};

const AuditoriaActivityLog = ({ entries, profiles }: Props) => {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        No hay actividad registrada aún. Los cambios en roles se registrarán automáticamente.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const config = actionConfig[entry.action] || actionConfig.role_assigned;
        const Icon = config.icon;
        const userName = profiles[entry.user_id] || "Usuario desconocido";
        const details = entry.details as Record<string, string>;

        let description = "";
        if (entry.action === "role_assigned") {
          description = `Se asignó el rol "${details.role}" a ${userName}`;
        } else if (entry.action === "role_removed") {
          description = `Se eliminó el rol "${details.role}" de ${userName}`;
        } else if (entry.action === "role_changed") {
          description = `Se cambió el rol de ${userName} de "${details.old_role}" a "${details.new_role}"`;
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
                {format(new Date(entry.created_at), "d MMM yyyy, HH:mm", { locale: es })}
              </p>
            </div>
            <Badge variant="outline" className={`shrink-0 text-[10px] ${config.color}`}>
              {config.label}
            </Badge>
          </div>
        );
      })}
    </div>
  );
};

export default AuditoriaActivityLog;
