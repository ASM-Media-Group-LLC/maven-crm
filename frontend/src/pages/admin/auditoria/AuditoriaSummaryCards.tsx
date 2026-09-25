import { Users, Shield, AlertTriangle, Key, UserCheck } from "lucide-react";
import StatChip from "@/components/StatChip";
import type { AuditoriaSummary } from "./useAuditoriaData";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  summary: AuditoriaSummary;
}

const AuditoriaSummaryCards = ({ summary }: Props) => {
  const { t } = useLanguage();
  const cards = [
    { label: t("admin.audit.kpiTotalUsers"), value: String(summary.total_users), icon: Users, color: "bg-primary" },
    { label: t("admin.audit.kpiWithRole"), value: String(summary.users_with_roles), icon: UserCheck, color: "bg-success" },
    { label: t("admin.audit.kpiWithoutRole"), value: String(summary.users_without_roles), icon: AlertTriangle, color: summary.users_without_roles > 0 ? "bg-destructive" : "bg-muted-foreground" },
    { label: t("admin.audit.kpiActiveRoles"), value: String(summary.active_roles), icon: Shield, color: "bg-warning" },
    { label: t("admin.audit.kpiPermissions"), value: String(summary.total_permissions), icon: Key, color: "bg-primary" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <StatChip key={c.label} label={c.label} value={c.value} icon={<c.icon className="h-3.5 w-3.5" />} color={c.color} />
      ))}
    </div>
  );
};

export default AuditoriaSummaryCards;
