import { useState, useMemo, useCallback } from "react";
import { startOfDay, endOfDay, startOfWeek, startOfMonth, subDays, format } from "date-fns";
import { Download } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import DashboardFilters from "./sales-dashboard/DashboardFilters";
import EarningsTrendChart from "./sales-dashboard/EarningsTrendChart";
import EarningsByChannelChart from "./sales-dashboard/EarningsByChannelChart";
import CreatorStatsCards from "./sales-dashboard/CreatorStatsCards";
import ConcentrationChart from "./sales-dashboard/ConcentrationChart";
import SalesReportSection from "./sales-dashboard/SalesReportSection";
import CreatorPerformanceView from "./sales-dashboard/CreatorPerformanceView";
import { useEarningsData } from "./sales-performance/useEarningsData";
import { ALL_COLUMNS } from "./sales-performance/types";
import { Button } from "@/components/ui/button";
import ClariAiFab from "@/components/ClariAiFab";
import type { ViewTab, TimePeriod, EarningsMode } from "./sales-dashboard/DashboardFilters";
import type { EarningsRow } from "./sales-performance/types";

const getDateRange = (period: TimePeriod): { from: Date; to: Date } => {
  const now = new Date();
  const today = startOfDay(now);
  switch (period) {
    case "Ayer":
      return { from: subDays(today, 1), to: subDays(today, 1) };
    case "Hoy":
      return { from: today, to: today };
    case "Esta semana":
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today };
    case "Este mes":
      return { from: startOfMonth(today), to: today };
    case "Últimos 7 días":
      return { from: subDays(today, 6), to: today };
    case "Últimos 30 días":
      return { from: subDays(today, 29), to: today };
    case "Últimos 90 días":
      return { from: subDays(today, 89), to: today };
  }
};

const SalesDashboard = () => {
  const [activeView, setActiveView] = useState<ViewTab>("Vista General");
  const [activePeriod, setActivePeriod] = useState<TimePeriod>("Últimos 7 días");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [compareMode, setCompareMode] = useState(false);
  const [compareRange, setCompareRange] = useState<{ from?: Date; to?: Date }>({});
  const [earningsMode, setEarningsMode] = useState<EarningsMode>("net");
  const { data: allRows = [], isLoading } = useEarningsData();

  const dateRange = useMemo(() => {
    if (activePeriod === "Personalizado" && customRange.from && customRange.to) {
      return { from: customRange.from, to: customRange.to };
    }
    return getDateRange(activePeriod as Exclude<TimePeriod, "Personalizado">);
  }, [activePeriod, customRange]);

  const filteredRows = useMemo(() => {
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    return allRows.filter((r) => {
      const d = new Date(r.effective_date);
      return d >= from && d <= to;
    });
  }, [allRows, dateRange]);

  const comparedRows = useMemo(() => {
    if (!compareMode || !compareRange.from || !compareRange.to) return undefined;
    const from = startOfDay(compareRange.from);
    const to = endOfDay(compareRange.to);
    return allRows.filter((r) => {
      const d = new Date(r.effective_date);
      return d >= from && d <= to;
    });
  }, [allRows, compareMode, compareRange]);

  const handleToggleCompare = () => {
    setCompareMode((prev) => !prev);
    if (compareMode) setCompareRange({});
  };

  const handleCompareDateChange = (from: Date | undefined, to: Date | undefined) => {
    setCompareRange({ from, to });
  };

  const escapeCsv = (val: unknown) => {
    const s = val == null ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rowsToCsv = useCallback((rows: EarningsRow[]) => {
    const headers = ALL_COLUMNS.map((c) => c.label);
    const lines = rows.map((r) =>
      ALL_COLUMNS.map((c) => escapeCsv(r[c.key])).join(",")
    );
    return [headers.join(","), ...lines].join("\n");
  }, []);

  const handleExportCSV = useCallback(() => {
    let csv = rowsToCsv(filteredRows);
    if (comparedRows && comparedRows.length > 0) {
      csv += "\n\n--- Periodo B ---\n" + rowsToCsv(comparedRows);
    }
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-ventas-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows, comparedRows, rowsToCsv]);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <div className="shrink-0 flex items-center justify-between border-b border-border bg-background px-6 pt-6 pb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reporte de Ventas</h1>
              <p className="text-sm text-muted-foreground">Rendimiento de ventas y análisis por creadora</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          <main className="flex-1 overflow-auto p-6 space-y-8">
            <DashboardFilters
              activeView={activeView}
              onViewChange={setActiveView}
              activePeriod={activePeriod}
              onPeriodChange={setActivePeriod}
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              compareMode={compareMode}
              onToggleCompare={handleToggleCompare}
              compareDateFrom={compareRange.from}
              compareDateTo={compareRange.to}
              onCompareDateChange={handleCompareDateChange}
              earningsMode={earningsMode}
              onEarningsModeChange={setEarningsMode}
            />
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando datos…</div>
            ) : activeView === "Vista General" ? (
              <>
                <EarningsTrendChart rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} />
                <EarningsByChannelChart rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} />
                <ConcentrationChart rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} />
                <CreatorStatsCards rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} />
                <SalesReportSection rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} />
              </>
            ) : (
              <CreatorPerformanceView rows={filteredRows} earningsMode={earningsMode} />
            )}
          </main>
        </div>
      </div>
      <ClariAiFab />
    </SidebarProvider>
  );
};

export default SalesDashboard;
