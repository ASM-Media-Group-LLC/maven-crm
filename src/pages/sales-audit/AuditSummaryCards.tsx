import { FileSpreadsheet, AlertTriangle, CheckCircle, TrendingDown } from "lucide-react";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

interface Props {
  totalExcel: number;
  totalSystem: number;
  matchCount: number;
  diffCount: number;
}

const AuditSummaryCards = ({ totalExcel, totalSystem, matchCount, diffCount }: Props) => {
  const netDiff = totalExcel - totalSystem;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <DashboardMetricCard
        label="Total Excel (Gross)"
        value={`$${totalExcel.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        icon={FileSpreadsheet}
        color="primary"
      />
      <DashboardMetricCard
        label="Total Sistema (Gross)"
        value={`$${totalSystem.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        icon={FileSpreadsheet}
        color="accent"
      />
      <DashboardMetricCard
        label="Coinciden"
        value={String(matchCount)}
        icon={CheckCircle}
        color="success"
      />
      <DashboardMetricCard
        label="Diferencias"
        value={String(diffCount)}
        icon={diffCount > 0 ? AlertTriangle : CheckCircle}
        color={diffCount > 0 ? "destructive" : "success"}
      />
    </div>
  );
};

export default AuditSummaryCards;
