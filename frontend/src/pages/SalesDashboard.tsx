import { useState, useMemo, useCallback } from "react";
import { startOfDay, endOfDay, format } from "date-fns";
import { Download } from "lucide-react";
import DashboardFilters from "./sales-dashboard/DashboardFilters";
import EarningsTrendChart from "./sales-dashboard/EarningsTrendChart";
import EarningsByChannelChart from "./sales-dashboard/EarningsByChannelChart";
import CreatorStatsCards from "./sales-dashboard/CreatorStatsCards";
import ConcentrationChart from "./sales-dashboard/ConcentrationChart";
import SalesReportSection from "./sales-dashboard/SalesReportSection";
import CreatorPerformanceView from "./sales-dashboard/CreatorPerformanceView";
import { useBluEarningsData as useEarningsData } from "./sales-performance/useBluEarningsData";
import { ALL_COLUMNS } from "./sales-performance/types";
import { Button } from "@/components/ui/button";
import type { ViewTab, TimePeriod, EarningsMode } from "./sales-dashboard/DashboardFilters";
import type { EarningsRow } from "./sales-performance/types";
import VentasSubtabs from "./sales-overview/VentasSubtabs";

const getDateRange = (_period: TimePeriod): { from: Date; to: Date } => {
  // Sin presets de período — fallback al día de hoy hasta que el usuario
  // pickee algo en el DateRangePicker (estado "Personalizado").
  const today = startOfDay(new Date());
  return { from: today, to: today };
};

const SalesDashboard = () => {
  const [activeView, setActiveView] = useState<ViewTab>("Vista General");
  const [activePeriod, setActivePeriod] = useState<TimePeriod>("Personalizado");
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

  const handleCustomDateChange = (from: Date | undefined, to: Date | undefined) => {
    setCustomRange({ from, to });
    if (from && to) {
      setActivePeriod("Personalizado");
    }
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
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Topbar fijo con VentasSubtabs — misma posición en todas las
          tabs de Ventas para que cambiar no genere salto visual. */}
      <div className="border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-3 shrink-0">
        <VentasSubtabs />
      </div>
      <div className="shrink-0 flex items-center justify-between border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Reporte de Ventas</h1>
              <p className="text-sm text-muted-foreground">Rendimiento de ventas y análisis por creadora</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-6 space-y-8">
            <DashboardFilters
              activeView={activeView}
              onViewChange={setActiveView}
              activePeriod={activePeriod}
              onPeriodChange={setActivePeriod}
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
              onCustomDateChange={handleCustomDateChange}
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
                <CreatorStatsCards rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} dateFrom={dateRange.from} dateTo={dateRange.to} />
                <SalesReportSection rows={filteredRows} comparedRows={comparedRows} earningsMode={earningsMode} dateFrom={dateRange.from} dateTo={dateRange.to} />
              </>
            ) : (
              <CreatorPerformanceView rows={filteredRows} earningsMode={earningsMode} />
            )}
          </div>
    </main>
  );
};

export default SalesDashboard;
