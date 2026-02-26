import { Users, Shield, AlertTriangle, Key, UserCheck } from "lucide-react";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import type { AuditoriaSummary } from "./useAuditoriaData";

interface Props {
  summary: AuditoriaSummary;
}

const AuditoriaSummaryCards = ({ summary }: Props) => {
  const cards = [
    { label: "Total Usuarios", value: String(summary.total_users), icon: Users, color: "primary" as const },
    { label: "Con Rol", value: String(summary.users_with_roles), icon: UserCheck, color: "success" as const },
    { label: "Sin Rol", value: String(summary.users_without_roles), icon: AlertTriangle, color: summary.users_without_roles > 0 ? "destructive" as const : "muted" as const },
    { label: "Roles Activos", value: String(summary.active_roles), icon: Shield, color: "warning" as const },
    { label: "Permisos Config.", value: String(summary.total_permissions), icon: Key, color: "accent" as const },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((c) => (
        <DashboardMetricCard
          key={c.label}
          label={c.label}
          value={c.value}
          icon={c.icon}
          color={c.color}
        />
      ))}
    </div>
  );
};

export default AuditoriaSummaryCards;
