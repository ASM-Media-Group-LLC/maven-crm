import { FileSpreadsheet, AlertTriangle, CheckCircle } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";

interface Props {
  totalExcel: number;
  totalSystem: number;
  matchCount: number;
  diffCount: number;
}

// Cards de resumen de auditoría — estáticas (la tabla de detalle vive
// abajo en la misma vista, así que click no aporta valor adicional).
const AuditSummaryCards = ({ totalExcel, totalSystem, matchCount, diffCount }: Props) => {
  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard label="Total Excel (Gross)" value={fmt(totalExcel)} icon={FileSpreadsheet} color="bg-blue-500" />
      <KpiCard label="Total Sistema (Gross)" value={fmt(totalSystem)} icon={FileSpreadsheet} color="bg-violet-500" />
      <KpiCard label="Coinciden" value={String(matchCount)} icon={CheckCircle} color="bg-emerald-500" />
      <KpiCard
        label="Diferencias"
        value={String(diffCount)}
        icon={diffCount > 0 ? AlertTriangle : CheckCircle}
        color={diffCount > 0 ? "bg-rose-500" : "bg-emerald-500"}
      />
    </div>
  );
};

export default AuditSummaryCards;
