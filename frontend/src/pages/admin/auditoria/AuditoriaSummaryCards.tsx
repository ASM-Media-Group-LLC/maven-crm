import { Users, Shield, AlertTriangle, Key, UserCheck } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import type { AuditoriaSummary } from "./useAuditoriaData";

interface Props {
  summary: AuditoriaSummary;
}

const AuditoriaSummaryCards = ({ summary }: Props) => {
  const cards = [
    { label: "Total Usuarios", value: String(summary.total_users), icon: Users, color: "bg-blue-500" },
    { label: "Con Rol", value: String(summary.users_with_roles), icon: UserCheck, color: "bg-emerald-500" },
    { label: "Sin Rol", value: String(summary.users_without_roles), icon: AlertTriangle, color: summary.users_without_roles > 0 ? "bg-rose-500" : "bg-slate-500" },
    { label: "Roles Activos", value: String(summary.active_roles), icon: Shield, color: "bg-amber-500" },
    { label: "Permisos Config.", value: String(summary.total_permissions), icon: Key, color: "bg-violet-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <KpiCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} />
      ))}
    </div>
  );
};

export default AuditoriaSummaryCards;
