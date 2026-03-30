import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export interface DataTableShellProps {
  children: React.ReactNode;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Extra classes on the scroll area */
  className?: string;
  /** Forward scroll events from the internal scrollable area */
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * Standardised shell for high-volume data tables.
 *
 * Layout:
 *  ┌─────────────────────────────────┐
 *  │  overflow-auto (v + h scroll)   │  ← flex-1
 *  │  children (<Table>)             │
 *  ├─────────────────────────────────┤
 *  │  counter  │  page-size │ pager  │  ← shrink-0
 *  └─────────────────────────────────┘
 */
const DataTableShell = ({
  children,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
  onScroll,
}: DataTableShellProps) => {
  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Scrollable table area */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border" onScroll={onScroll}>
        {children}
      </div>

      {/* Footer — always visible */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-1 pt-3 pb-1">
        {/* Counter */}
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          Mostrando {from}–{to} de {totalCount} registros
        </p>

        <div className="flex items-center gap-3">
          {/* Page size selector */}
          {onPageSizeChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filas:</span>
              <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
                <SelectTrigger className="h-8 w-[68px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Page number buttons — show max 5 */}
              {(() => {
                const pages: (number | "ellipsis")[] = [];
                if (totalPages <= 5) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 3) pages.push("ellipsis");
                  for (
                    let i = Math.max(2, currentPage - 1);
                    i <= Math.min(totalPages - 1, currentPage + 1);
                    i++
                  ) {
                    pages.push(i);
                  }
                  if (currentPage < totalPages - 2) pages.push("ellipsis");
                  pages.push(totalPages);
                }
                return pages.map((p, idx) =>
                  p === "ellipsis" ? (
                    <span key={`e${idx}`} className="text-xs text-muted-foreground px-1">
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === currentPage ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 text-xs"
                      onClick={() => onPageChange(p)}
                    >
                      {p}
                    </Button>
                  ),
                );
              })()}

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataTableShell;
