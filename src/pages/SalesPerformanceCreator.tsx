import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
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

const PAGE_SIZE = 25;

const SalesPerformanceCreator = () => {
  const [documentFilter, setDocumentFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
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

  const filtered = useMemo(() => {
    let result = rows;
    if (documentFilter !== "all") {
      result = result.filter((r) => r.document_id === documentFilter);
    }
    if (creatorFilter !== "all") {
      result = result.filter(
        (r) => r.artistic_name === creatorFilter || r.pending_creator === creatorFilter
      );
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
  }, [rows, documentFilter, creatorFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const handleDocumentFilter = (v: string) => { setDocumentFilter(v); setCurrentPage(1); };
  const handleCreatorFilter = (v: string) => { setCreatorFilter(v); setCurrentPage(1); };

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
          creatorFilter={creatorFilter}
          onCreatorFilterChange={handleCreatorFilter}
          creatorNames={creatorNames}
          totalCount={filtered.length}
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
            <EarningsPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default SalesPerformanceCreator;
