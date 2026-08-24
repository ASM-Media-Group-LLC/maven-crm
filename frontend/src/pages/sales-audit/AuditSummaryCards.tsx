import { FileSpreadsheet, AlertTriangle, CheckCircle } from "lucide-react";
import StatChip from "@/components/StatChip";

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
      <StatChip label="Total Excel (Gross)" value={fmt(totalExcel)} icon={<FileSpreadsheet className="h-3.5 w-3.5" />} color="bg-primary" />
      <StatChip label="Total Sistema (Gross)" value={fmt(totalSystem)} icon={<FileSpreadsheet className="h-3.5 w-3.5" />} color="bg-primary" />
      <StatChip label="Coinciden" value={String(matchCount)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" />
      <StatChip
        label="Diferencias"
        value={String(diffCount)}
        icon={diffCount > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
        color={diffCount > 0 ? "bg-destructive" : "bg-success"}
      />
    </div>
  );
};

export default AuditSummaryCards;
