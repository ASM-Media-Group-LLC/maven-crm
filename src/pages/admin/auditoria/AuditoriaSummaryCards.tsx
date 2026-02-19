import { Users, Shield, AlertTriangle, Key, UserCheck } from "lucide-react";
import type { AuditoriaSummary } from "./useAuditoriaData";

interface Props {
  summary: AuditoriaSummary;
}

const AuditoriaSummaryCards = ({ summary }: Props) => {
  const cards = [
    { label: "Total Usuarios", value: summary.total_users, icon: Users, color: "text-primary" },
    { label: "Con Rol", value: summary.users_with_roles, icon: UserCheck, color: "text-emerald-500" },
    { label: "Sin Rol", value: summary.users_without_roles, icon: AlertTriangle, color: summary.users_without_roles > 0 ? "text-destructive" : "text-muted-foreground" },
    { label: "Roles Activos", value: summary.active_roles, icon: Shield, color: "text-amber-500" },
    { label: "Permisos Config.", value: summary.total_permissions, icon: Key, color: "text-blue-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-muted ${c.color}`}>
            <c.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AuditoriaSummaryCards;
