import { useState, useMemo, useCallback } from "react";
import { Download, Search, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EarningsTable from "../sales-performance/EarningsTable";
import EarningsPagination from "../sales-performance/EarningsPagination";
import CustomMetrics from "../sales-performance/CustomMetrics";
import { ALL_COLUMNS, type SortField, type SortDirection, type EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

interface SalesReportSectionProps {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
  earningsMode: EarningsMode;
  dateFrom?: Date;
  dateTo?: Date;
}

const SalesReportSection = ({ rows, comparedRows, earningsMode, dateFrom, dateTo }: SalesReportSectionProps) => {
  const dateLabel = dateFrom && dateTo
    ? `${format(dateFrom, "d 'de' MMMM", { locale: es })} al ${format(dateTo, "d 'de' MMMM", { locale: es })}`
    : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const [visibleColumns, setVisibleColumns] = useState<Set<SortField>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  const filtered = useMemo(() => {
    let result = rows;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.artistic_name ?? "").toLowerCase().includes(q) ||
          (r.pending_creator ?? "").toLowerCase().includes(q)
      );
    }

    // Build comparison map
    const compMap = new Map<string, number>();
    if (comparedRows) {
      for (const r of comparedRows) {
        const key = r.pending_creator || r.artistic_name || "";
        compMap.set(key, (compMap.get(key) || 0) + (r.total_earnings_gross ?? 0));
      }
    }

    const grandTotal = result.reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);

    const currentMap = new Map<string, number>();
    for (const r of result) {
      const key = r.pending_creator || r.artistic_name || "";
      currentMap.set(key, (currentMap.get(key) || 0) + (r.total_earnings_gross ?? 0));
    }

    const enriched = result.map((r) => {
      const gross = r.total_earnings_gross ?? 0;
      const netFactor = earningsMode === "net" ? 0.80 : 1;
      const net_earnings = gross * 0.80;
      const total_earnings = gross * netFactor;
      const participation_percent = grandTotal > 0 ? (gross / grandTotal) * 100 : 0;

      const creatorKey = r.pending_creator || r.artistic_name || "";
      const prevTotal = compMap.get(creatorKey);
      let variation_percent: number | null = null;
      let trend: string | null = null;
      if (prevTotal != null && prevTotal > 0) {
        const currentTotal = currentMap.get(creatorKey) ?? 0;
        variation_percent = ((currentTotal - prevTotal) / prevTotal) * 100;
        trend = variation_percent > 5 ? "Creciendo" : variation_percent < -5 ? "Cayendo" : "Estable";
      }

      return { ...r, net_earnings, total_earnings, variation_percent, trend, participation_percent };
    });

    return enriched.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      const va = a[sortField];
      const vb = b[sortField];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, searchQuery, sortField, sortDirection, comparedRows, earningsMode]);

  const effectivePageSize = pageSize === "all" ? filtered.length : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const paginatedRows = pageSize === "all"
    ? filtered
    : filtered.slice((currentPage - 1) * effectivePageSize, currentPage * effectivePageSize);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const handleSearchChange = (v: string) => { setSearchQuery(v); setCurrentPage(1); };
  const handlePageSizeChange = (v: number | "all") => { setPageSize(v); setCurrentPage(1); };

  const handleToggleColumn = (key: SortField) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDownloadExcel = useCallback(() => {
    const cols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));
    const exportData = filtered.map((r) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c) => { obj[c.label] = r[c.key] ?? ""; });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Earnings");
    XLSX.writeFile(wb, "earnings_export.xlsx");
  }, [filtered, visibleColumns]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reporte de Ventas
        </h3>
        {dateLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            Filtro: {dateLabel}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar creadora…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} registros</span>
          <CustomMetrics visibleColumns={visibleColumns} onToggleColumn={handleToggleColumn} />
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <EarningsTable
        rows={paginatedRows}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        visibleColumns={visibleColumns}
      />

      {pageSize !== "all" && (
        <EarningsPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
};

export default SalesReportSection;
