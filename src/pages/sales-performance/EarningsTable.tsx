import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EarningsRow, SortField, SortDirection } from "./types";

interface EarningsTableProps {
  rows: EarningsRow[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
};

const SortIcon = ({ field, current, direction }: { field: SortField; current: SortField; direction: SortDirection }) => {
  if (field !== current) return <ArrowUpDown className="h-3 w-3" />;
  return direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
};

const EarningsTable = ({ rows, sortField, sortDirection, onSort }: EarningsTableProps) => (
  <div className="rounded-lg border border-border bg-card overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs">
            <button className="flex items-center gap-1" onClick={() => onSort("artistic_name")}>
              Artistic Name <SortIcon field="artistic_name" current={sortField} direction={sortDirection} />
            </button>
          </TableHead>
          <TableHead className="text-xs">Creator OF</TableHead>
          <TableHead className="text-xs text-right">
            <button className="flex items-center justify-end gap-1 w-full" onClick={() => onSort("date")}>
              Fecha <SortIcon field="date" current={sortField} direction={sortDirection} />
            </button>
          </TableHead>
          <TableHead className="text-xs text-right">
            <button className="flex items-center justify-end gap-1 w-full" onClick={() => onSort("total_earnings_gross")}>
              Total Earnings Gross <SortIcon field="total_earnings_gross" current={sortField} direction={sortDirection} />
            </button>
          </TableHead>
          <TableHead className="text-xs">Document ID</TableHead>

        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="text-sm font-medium text-foreground">
              {row.artistic_name ?? "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {row.pending_creator ?? "—"}
            </TableCell>
            <TableCell className="text-right text-sm text-foreground">{formatDate(row.date)}</TableCell>
            <TableCell className="text-right text-sm font-medium text-foreground">
              ${(row.total_earnings_gross ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground font-mono">
              {row.document_id ? `${row.document_id.slice(0, 8)}…` : "—"}
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
              Sin resultados
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </div>
);

export default EarningsTable;
