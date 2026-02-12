import { useState, useMemo, useCallback } from "react";
import { Download } from "lucide-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import EarningsFilters from "../sales-performance/EarningsFilters";
import EarningsTable from "../sales-performance/EarningsTable";
import EarningsPagination from "../sales-performance/EarningsPagination";
import CustomMetrics from "../sales-performance/CustomMetrics";
import { ALL_COLUMNS, type SortField, type SortDirection, type EarningsRow } from "../sales-performance/types";

interface SalesReportSectionProps {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
}

const SalesReportSection = ({ rows, comparedRows }: SalesReportSectionProps) => {
  const [documentFilter, setDocumentFilter] = useState<string[]>([]);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const [visibleColumns, setVisibleColumns] = useState<Set<SortField>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  const documentIds = useMemo(() => {
    return [...new Set(rows.map((r) => r.document_id).filter(Boolean))].sort() as string[];
  }, [rows]);

  const creatorNames = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.artistic_name || r.pending_creator).filter(Boolean))] as string[];
    return names.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const relatedCreatorNames = useMemo(() => {
    let subset = rows;
    if (documentFilter.length > 0)
      subset = subset.filter((r) => documentFilter.includes(r.document_id ?? ""));
    if (dateFrom) {
      const from = startOfDay(dateFrom);
      subset = subset.filter((r) => new Date(r.effective_date) >= from);
    }
    if (dateTo) {
      const to = endOfDay(dateTo);
      subset = subset.filter((r) => new Date(r.effective_date) <= to);
    }
    return new Set(subset.map((r) => r.artistic_name || r.pending_creator).filter(Boolean) as string[]);
  }, [rows, documentFilter, dateFrom, dateTo]);

  const relatedDocumentIds = useMemo(() => {
    let subset = rows;
    if (creatorFilter.length > 0)
      subset = subset.filter((r) => creatorFilter.includes(r.artistic_name ?? "") || creatorFilter.includes(r.pending_creator ?? ""));
    if (dateFrom) {
      const from = startOfDay(dateFrom);
      subset = subset.filter((r) => new Date(r.effective_date) >= from);
    }
    if (dateTo) {
      const to = endOfDay(dateTo);
      subset = subset.filter((r) => new Date(r.effective_date) <= to);
    }
    return new Set(subset.map((r) => r.document_id).filter(Boolean) as string[]);
  }, [rows, creatorFilter, dateFrom, dateTo]);

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

    if (documentFilter.length > 0) {
      result = result.filter((r) => documentFilter.includes(r.document_id ?? ""));
    }
    if (creatorFilter.length > 0) {
      result = result.filter(
        (r) => creatorFilter.includes(r.artistic_name ?? "") || creatorFilter.includes(r.pending_creator ?? "")
      );
    }

    if (dateFrom) {
      const from = startOfDay(dateFrom);
      result = result.filter((r) => new Date(r.effective_date) >= from);
    }
    if (dateTo) {
      const to = endOfDay(dateTo);
      result = result.filter((r) => new Date(r.effective_date) <= to);
    }

    // Build comparison map: pending_creator -> total gross in compared period
    const compMap = new Map<string, number>();
    if (comparedRows) {
      for (const r of comparedRows) {
        const key = r.pending_creator || r.artistic_name || "";
        compMap.set(key, (compMap.get(key) || 0) + (r.total_earnings_gross ?? 0));
      }
    }

    // Calculate grand total for participation
    const grandTotal = result.reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);

    // Current period totals per creator for variation
    const currentMap = new Map<string, number>();
    for (const r of result) {
      const key = r.pending_creator || r.artistic_name || "";
      currentMap.set(key, (currentMap.get(key) || 0) + (r.total_earnings_gross ?? 0));
    }

    // Enrich rows with calculated fields
    const enriched = result.map((r) => {
      const gross = r.total_earnings_gross ?? 0;
      const net_earnings = gross * 0.80;
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

      return { ...r, net_earnings, variation_percent, trend, participation_percent };
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
  }, [rows, searchQuery, documentFilter, creatorFilter, dateFrom, dateTo, sortField, sortDirection, comparedRows]);

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

  const handleDocumentFilter = (v: string[]) => { setDocumentFilter(v); setCurrentPage(1); };
  const handleCreatorFilter = (v: string[]) => { setCreatorFilter(v); setCurrentPage(1); };
  const handleSearchChange = (v: string) => { setSearchQuery(v); setCurrentPage(1); };
  const handlePageSizeChange = (v: number | "all") => { setPageSize(v); setCurrentPage(1); };

  const handleToday = () => {
    const d = new Date();
    setDateFrom(d);
    setDateTo(d);
    setCurrentPage(1);
  };

  const handleYesterday = () => {
    const d = subDays(new Date(), 1);
    setDateFrom(d);
    setDateTo(d);
    setCurrentPage(1);
  };

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Estadísticas de creadoras</h2>
        <div className="flex items-center gap-2">
          <CustomMetrics visibleColumns={visibleColumns} onToggleColumn={handleToggleColumn} />
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <EarningsFilters
        documentFilter={documentFilter}
        onDocumentFilterChange={handleDocumentFilter}
        documentIds={documentIds}
        relatedDocumentIds={relatedDocumentIds}
        creatorFilter={creatorFilter}
        onCreatorFilterChange={handleCreatorFilter}
        creatorNames={creatorNames}
        relatedCreatorNames={relatedCreatorNames}
        totalCount={filtered.length}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(d) => { setDateFrom(d); setCurrentPage(1); }}
        onDateToChange={(d) => { setDateTo(d); setCurrentPage(1); }}
        onToday={handleToday}
        onYesterday={handleYesterday}
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
      />

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
