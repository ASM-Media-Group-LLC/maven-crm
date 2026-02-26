import { useState, useMemo } from "react";
import { startOfWeek, startOfToday, endOfDay, subMonths, startOfMonth as som } from "date-fns";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import SalesOverviewHeader from "./sales-overview/SalesOverviewHeader";
import SalesOverviewFilters from "./sales-overview/SalesOverviewFilters";
import SalesKPICards from "./sales-overview/SalesKPICards";
import SalesOperationalCards from "./sales-overview/SalesOperationalCards";
import CardDetailModal from "./sales-overview/CardDetailModal";
import EarningsTrendChart from "./sales-dashboard/EarningsTrendChart";
import EarningsByChannelChart from "./sales-dashboard/EarningsByChannelChart";
import TopCreatorsTable from "./sales-overview/TopCreatorsTable";
import { usePeriodComparison } from "./sales-overview/usePeriodComparison";
import { useEarningsData } from "./sales-performance/useEarningsData";
import ClariAiFab from "@/components/ClariAiFab";

const SalesOverview = () => {
  const today = startOfToday();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(startOfWeek(today, { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState<Date | undefined>(today);
  const [modalType, setModalType] = useState<string | null>(null);
  const { data: allRows = [], isLoading } = useEarningsData();

  const dateRange = useMemo(() => ({
    from: dateFrom ?? today,
    to: dateTo ?? today,
  }), [dateFrom, dateTo, today]);

  const comparison = usePeriodComparison(allRows, dateRange);

  const handleDateChange = (from: Date | undefined, to: Date | undefined) => {
    setDateFrom(from);
    setDateTo(to);
  };

  // Filtered rows for charts
  const filteredRows = useMemo(() => {
    const from = dateFrom ?? today;
    const to = dateTo ?? today;
    return allRows.filter((r) => {
      const d = new Date(r.effective_date);
      return d >= from && d <= endOfDay(to);
    });
  }, [allRows, dateFrom, dateTo, today]);

  // Sparkline: last 4 months totals
  const sparklineData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, i) => {
      const mStart = som(subMonths(now, 3 - i));
      const mEnd = endOfDay(new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0));
      const total = allRows
        .filter((r) => {
          const d = new Date(r.effective_date);
          return d >= mStart && d <= mEnd;
        })
        .reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);
      return { value: total };
    });
  }, [allRows]);

  const getModalCreators = () => {
    if (!modalType) return [];
    switch (modalType) {
      case "gross": case "net": case "creators": return comparison.creators;
      case "rising": return comparison.rising;
      case "at_risk": return comparison.atRisk;
      case "falling": return comparison.falling;
      case "high_potential": return comparison.highPotential;
      case "top10": return comparison.top10;
      case "alerts": return [...comparison.atRisk, ...comparison.falling];
      case "todas": case "comparatives": return comparison.creators;
      default: return [];
    }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 space-y-6">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando datos…</div>
            ) : (
              <>
                <SalesOverviewHeader
                  totalEarnings={comparison.totalCurrent}
                  changePercent={comparison.totalChangePercent}
                  activeCreators={comparison.activeCreators}
                />
                <SalesOverviewFilters
                  from={dateFrom}
                  to={dateTo}
                  onDateChange={handleDateChange}
                />
                <SalesKPICards data={comparison} onCardClick={setModalType} />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <EarningsTrendChart rows={filteredRows} earningsMode="net" />
                  <EarningsByChannelChart rows={filteredRows} earningsMode="net" />
                </div>
                <TopCreatorsTable creators={comparison.top10} />
                <SalesOperationalCards
                  data={comparison}
                  onCardClick={setModalType}
                  sparklineData={sparklineData}
                />
                <CardDetailModal
                  open={!!modalType}
                  onOpenChange={(open) => !open && setModalType(null)}
                  cardType={modalType || ""}
                  creators={getModalCreators()}
                />
              </>
            )}
          </main>
        </div>
      </div>
      <ClariAiFab />
    </SidebarProvider>
  );
};

export default SalesOverview;
