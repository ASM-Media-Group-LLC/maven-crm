import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { startOfDay, endOfDay, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import Logo from "@/components/Logo";
import { useEarningsData } from "./sales-performance/useEarningsData";
import EarningsFilters from "./sales-performance/EarningsFilters";
import EarningsTable from "./sales-performance/EarningsTable";
import EarningsPagination from "./sales-performance/EarningsPagination";
import EarningsSummaryCards from "./sales-performance/EarningsSummaryCards";
import CustomMetrics from "./sales-performance/CustomMetrics";
import { ALL_COLUMNS, type SortField, type SortDirection } from "./sales-performance/types";

const SalesPerformanceCreator = () => {
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

  const { data: rows = [], isLoading } = useEarningsData();

  const documentIds = useMemo(() => {
    return [...new Set(rows.map((r) => r.document_id).filter(Boolean))].sort() as string[];
  }, [rows]);

  const creatorNames = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.artistic_name || r.pending_creator).filter(Boolean))] as string[];
    return names.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Cross-filter: compute which options are related based on OTHER active filters
  const relatedCreatorNames = useMemo(() => {
    let subset = rows;
    if (documentFilter.length > 0)
      subset = subset.filter((r) => documentFilter.includes(r.document_id ?? ""));
    if (dateFrom) {
      const from = startOfDay(dateFrom);
      subset = subset.filter((r) => new Date(r.date) >= from);
    }
    if (dateTo) {
      const to = endOfDay(dateTo);
      subset = subset.filter((r) => new Date(r.date) <= to);
    }
    return new Set(subset.map((r) => r.artistic_name || r.pending_creator).filter(Boolean) as string[]);
  }, [rows, documentFilter, dateFrom, dateTo]);

  const relatedDocumentIds = useMemo(() => {
    let subset = rows;
    if (creatorFilter.length > 0)
      subset = subset.filter((r) => creatorFilter.includes(r.artistic_name ?? "") || creatorFilter.includes(r.pending_creator ?? ""));
    if (dateFrom) {
      const from = startOfDay(dateFrom);
      subset = subset.filter((r) => new Date(r.date) >= from);
    }
    if (dateTo) {
      const to = endOfDay(dateTo);
      subset = subset.filter((r) => new Date(r.date) <= to);
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
      result = result.filter((r) => new Date(r.date) >= from);
    }
    if (dateTo) {
      const to = endOfDay(dateTo);
      result = result.filter((r) => new Date(r.date) <= to);
    }

    return result.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      const va = a[sortField];
      const vb = b[sortField];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, searchQuery, documentFilter, creatorFilter, dateFrom, dateTo, sortField, sortDirection]);

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/salesdashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <CustomMetrics visibleColumns={visibleColumns} onToggleColumn={handleToggleColumn} />
            <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
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

        <EarningsSummaryCards rows={filtered} />

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Cargando datos…</div>
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
};

export default SalesPerformanceCreator;
