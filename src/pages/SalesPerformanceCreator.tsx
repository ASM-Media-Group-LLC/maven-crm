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
import type { SortField, SortDirection } from "./sales-performance/types";

const PAGE_SIZE = 25;

const SalesPerformanceCreator = () => {
  const [documentFilter, setDocumentFilter] = useState("all");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);

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
      if (sortField === "date") {
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
      }
      if (sortField === "total_earnings_gross") {
        return ((a.total_earnings_gross ?? 0) - (b.total_earnings_gross ?? 0)) * dir;
      }
      if (sortField === "pending_creator") {
        const pa = (a.pending_creator || "").toLowerCase();
        const pb = (b.pending_creator || "").toLowerCase();
        return pa.localeCompare(pb) * dir;
      }
      if (sortField === "document_id") {
        const da = (a.document_id || "").toLowerCase();
        const db = (b.document_id || "").toLowerCase();
        return da.localeCompare(db) * dir;
      }
      // artistic_name
      const na = (a.artistic_name || a.pending_creator || "").toLowerCase();
      const nb = (b.artistic_name || b.pending_creator || "").toLowerCase();
      return na.localeCompare(nb) * dir;
    });
  }, [rows, documentFilter, creatorFilter, sortField, sortDirection]);

  const totalEarnings = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.total_earnings_gross ?? 0), 0),
    [filtered]
  );

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

  // Reset page when filters change
  const handleDocumentFilter = (v: string) => { setDocumentFilter(v); setCurrentPage(1); };
  const handleCreatorFilter = (v: string) => { setCreatorFilter(v); setCurrentPage(1); };

  const handleDownloadExcel = useCallback(() => {
    const exportData = filtered.map((r) => ({
      "Artistic Name": r.artistic_name ?? "",
      "Creator OF": r.pending_creator ?? "",
      Fecha: r.date,
      "Total Earnings Gross": r.total_earnings_gross ?? 0,
      "Document ID": r.document_id ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Earnings");
    XLSX.writeFile(wb, "earnings_export.xlsx");
  }, [filtered]);

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
          <span className="text-sm text-muted-foreground">Rendimiento por Creadora</span>
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

        {/* Total Earnings Indicator + Download */}
        <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Total Earnings Gross (filtrado)</span>
            <span className="text-xl font-bold text-foreground">
              ${totalEarnings.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} className="gap-2">
            <Download className="h-4 w-4" />
            Descargar Excel
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Cargando datos…</div>
        ) : (
          <>
            <EarningsTable
              rows={paginatedRows}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
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
