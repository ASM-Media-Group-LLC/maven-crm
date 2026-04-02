import { CalendarDays, Database, FileSpreadsheet, AlertTriangle } from "lucide-react";

interface Props {
  totalExcelEntries: number;
  totalSystemEntries: number;
  dateLabel: string;
  dateRange: { min: string; max: string } | null;
}

const AuditEntriesInfo = ({ totalExcelEntries, totalSystemEntries, dateLabel, dateRange }: Props) => {
  const diff = totalExcelEntries - totalSystemEntries;
  const hasMismatch = diff !== 0;

  return (
    <div className="space-y-2">
      {dateRange && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg px-4 py-2 bg-card w-fit">
          <CalendarDays className="h-4 w-4" />
          <span>Período comparado: <strong className="text-foreground">{dateLabel}</strong></span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm border rounded-lg px-4 py-3 bg-card">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span>Entradas Excel: <strong className="text-foreground">{totalExcelEntries}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span>Entradas Sistema: <strong className="text-foreground">{totalSystemEntries}</strong></span>
        </div>
        {hasMismatch && (
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">
              {diff > 0
                ? `${diff} entrada(s) extra en Excel — posibles datos no sincronizados al sistema`
                : `${Math.abs(diff)} entrada(s) extra en Sistema — posibles datos que ya no están en el reporte`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditEntriesInfo;
