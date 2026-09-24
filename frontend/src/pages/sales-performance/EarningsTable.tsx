import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Link2, Unlink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ALL_COLUMNS, type EarningsRow, type SortField, type SortDirection, type ColumnDef } from "./types";
import LinkCreatorModal from "./LinkCreatorModal";
import { useFormato } from "@/hooks/useFormato";

interface EarningsTableProps {
  rows: EarningsRow[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  visibleColumns: Set<SortField>;
}

const formatDate = (d: string, locale: string) => {
  try {
    return new Date(d).toLocaleDateString(locale, {
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

const formatCell = (row: EarningsRow, col: ColumnDef, locale: string): string => {
  const val = row[col.key];
  if (val == null) return "—";
  switch (col.format) {
    case "currency":
      return "$" + (val as number).toLocaleString("en-US", { minimumFractionDigits: 2 });
    case "number":
      return (val as number).toLocaleString("en-US");
    case "percent":
      return (val as number).toFixed(2) + "%";
    case "signed_percent": {
      const n = val as number;
      return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    }
    case "trend":
      return String(val);
    case "date":
      return formatDate(val as string, locale);
    case "time":
      return String(val);
    case "document":
      return (val as string).slice(0, 8) + "…";
    default:
      return String(val);
  }
};

const TrendCell = ({ value }: { value: string | null | undefined }) => {
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value === "Creciendo")
    return <span className="flex items-center gap-1 text-success"><TrendingUp className="h-3.5 w-3.5" />{value}</span>;
  if (value === "Cayendo")
    return <span className="flex items-center gap-1 text-destructive"><TrendingDown className="h-3.5 w-3.5" />{value}</span>;
  return <span className="flex items-center gap-1 text-muted-foreground"><Minus className="h-3.5 w-3.5" />{value}</span>;
};

const EarningsTable = ({ rows, sortField, sortDirection, onSort, visibleColumns }: EarningsTableProps) => {
  const f = useFormato();
  const queryClient = useQueryClient();
  const columns = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
  const [linkModal, setLinkModal] = useState<{ open: boolean; pendingCreator: string; rowId: string }>({
    open: false,
    pendingCreator: "",
    rowId: "",
  });
  const [unlinkTarget, setUnlinkTarget] = useState<{ pendingCreator: string } | null>(null);

  const unlinkMutation = useMutation({
    mutationFn: async (pendingCreator: string) => {
      const { error } = await supabase
        .from("of_gross_earnings")
        .update({ creator_id: null })
        .eq("pending_creator", pendingCreator);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["of_gross_earnings_performance"] });
      toast.success("Vínculo eliminado");
      setUnlinkTarget(null);
    },
    onError: () => toast.error("Error al desvincular"),
  });

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-24rem)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
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
              const isManuallyLinked = !!row.creator_id && !!row.pending_creator;
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
                          <span>{formatCell(row, col, f.intl("es-CL"))}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-warning hover:text-warning/90 hover:bg-warning/10"
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
                      ) : col.key === "pending_creator" && isManuallyLinked ? (
                        <div className="flex items-center gap-1.5">
                          <span>{formatCell(row, col, f.intl("es-CL"))}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setUnlinkTarget({ pendingCreator: row.pending_creator! })}
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Desvincular creador</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : col.format === "trend" ? (
                        <TrendCell value={row[col.key] as string | null} />
                      ) : col.format === "signed_percent" ? (
                        <span className={
                          (row[col.key] as number | null) == null ? "text-muted-foreground" :
                          (row[col.key] as number) > 0 ? "text-success font-medium" :
                          (row[col.key] as number) < 0 ? "text-destructive font-medium" :
                          "text-muted-foreground"
                        }>
                          {formatCell(row, col, f.intl("es-CL"))}
                        </span>
                      ) : (
                        formatCell(row, col, f.intl("es-CL"))
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

      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desvincular creador?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el vínculo de <span className="font-medium">"{unlinkTarget?.pendingCreator}"</span> con el creador asignado. Podrás volver a vincularlo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              onClick={() => unlinkTarget && unlinkMutation.mutate(unlinkTarget.pendingCreator)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default EarningsTable;
