import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Database } from "lucide-react";

export interface EntryDetail {
  date: string;
  amount: number;
}

interface Props {
  creator: string;
  source: "excel" | "system";
  entries: EntryDetail[];
}

const AuditEntryDetail = ({ creator, source, entries }: Props) => {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const isExcel = source === "excel";

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {isExcel ? <FileSpreadsheet className="h-4 w-4" /> : <Database className="h-4 w-4" />}
        <span className="capitalize">{creator}</span> — {isExcel ? "Excel" : "Sistema"} ({entries.length} entradas)
      </div>
      <div className="rounded border bg-background max-h-60 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs text-right">Gross</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((e, i) => (
              <TableRow key={i} className="text-xs">
                <TableCell>{e.date}</TableCell>
                <TableCell className="text-right">
                  ${e.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold text-xs border-t-2">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">
                ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AuditEntryDetail;
