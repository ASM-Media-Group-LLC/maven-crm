import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ALL_COLUMNS, type EarningsRow, type SortField, type SortDirection, type ColumnDef } from "./types";
import LinkCreatorModal from "./LinkCreatorModal";

interface EarningsTableProps {
  rows: EarningsRow[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  visibleColumns: Set<SortField>;
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

const formatCell = (row: EarningsRow, col: ColumnDef): string => {
  const val = row[col.key];
  if (val == null) return "—";
  switch (col.format) {
    case "currency":
      return "$" + (val as number).toLocaleString("en-US", { minimumFractionDigits: 2 });
    case "number":
      return (val as number).toLocaleString("en-US");
    case "percent":
      return (val as number).toFixed(2) + "%";
    case "date":
      return formatDate(val as string);
    case "time":
      return String(val);
    case "document":
      return (val as string).slice(0, 8) + "…";
    default:
      return String(val);
  }
};

const EarningsTable = ({ rows, sortField, sortDirection, onSort, visibleColumns }: EarningsTableProps) => {
  const columns = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const [linkModal, setLinkModal] = useState<{ open: boolean; pendingCreator: string; rowId: string }>({
    open: false,
    pendingCreator: "",
    rowId: "",
  });

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={`text-xs ${col.align === "right" ? "text-right" : ""}`}>
                  <button
                    className={`flex items-center gap-1 ${col.align === "right" ? "justify-end w-full" : ""}`}
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                    <SortIcon field={col.key} current={sortField} direction={sortDirection} />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isUnlinked = !row.creator_id && !!row.pending_creator;
              return (
                <TableRow key={row.id}>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`text-sm ${col.align === "right" ? "text-right" : ""} ${
                        col.format === "document" ? "font-mono text-xs text-muted-foreground" :
                        col.format === "text" && col.key === "artistic_name" ? "font-medium text-foreground" :
                        col.format === "text" ? "text-muted-foreground" :
                        col.format === "currency" ? "font-medium text-foreground" :
                        "text-foreground"
                      }`}
                    >
                      {col.key === "pending_creator" && isUnlinked ? (
                        <div className="flex items-center gap-1.5">
                          <span>{formatCell(row, col)}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                                onClick={() =>
                                  setLinkModal({
                                    open: true,
                                    pendingCreator: row.pending_creator!,
                                    rowId: row.id,
                                  })
                                }
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Vincular a creador</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : (
                        formatCell(row, col)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground text-sm py-8">
                  Sin resultados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <LinkCreatorModal
        open={linkModal.open}
        onOpenChange={(o) => setLinkModal((prev) => ({ ...prev, open: o }))}
        pendingCreator={linkModal.pendingCreator}
        earningsRowId={linkModal.rowId}
      />
    </TooltipProvider>
  );
};

export default EarningsTable;
