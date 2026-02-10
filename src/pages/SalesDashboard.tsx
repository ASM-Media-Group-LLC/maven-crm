import { useState, useMemo } from "react";
import { startOfDay, endOfDay, startOfWeek, startOfMonth, subDays } from "date-fns";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import DashboardFilters from "./sales-dashboard/DashboardFilters";
import EarningsSummary from "./sales-dashboard/EarningsSummary";
import EarningsTrendChart from "./sales-dashboard/EarningsTrendChart";
import CreatorStatsCards from "./sales-dashboard/CreatorStatsCards";
import ConcentrationChart from "./sales-dashboard/ConcentrationChart";
import CreatorsTable from "./sales-dashboard/CreatorsTable";
import { useEarningsData } from "./sales-performance/useEarningsData";
import type { ViewTab, TimePeriod } from "./sales-dashboard/DashboardFilters";

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
  }
};

const SalesDashboard = () => {
  const [activeView, setActiveView] = useState<ViewTab>("Vista General");
  const [activePeriod, setActivePeriod] = useState<TimePeriod>("Esta semana");
  const { data: allRows = [], isLoading } = useEarningsData();

  const dateRange = useMemo(() => getDateRange(activePeriod), [activePeriod]);

  const filteredRows = useMemo(() => {
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    return allRows.filter((r) => {
      const d = new Date(r.effective_date);
      return d >= from && d <= to;
    });
  }, [allRows, dateRange]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-8">
            <DashboardFilters
              activeView={activeView}
              onViewChange={setActiveView}
              activePeriod={activePeriod}
              onPeriodChange={setActivePeriod}
              dateFrom={dateRange.from}
              dateTo={dateRange.to}
            />
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando datos…</div>
            ) : (
              <>
                <EarningsSummary rows={filteredRows} />
                <EarningsTrendChart rows={filteredRows} />
                <CreatorStatsCards rows={filteredRows} />
                <ConcentrationChart rows={filteredRows} />
                <CreatorsTable rows={filteredRows} />
              </>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SalesDashboard;
