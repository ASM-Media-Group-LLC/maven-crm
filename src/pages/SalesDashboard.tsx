import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import DashboardFilters from "./sales-dashboard/DashboardFilters";
import EarningsSummary from "./sales-dashboard/EarningsSummary";
import EarningsTrendChart from "./sales-dashboard/EarningsTrendChart";
import CreatorStatsCards from "./sales-dashboard/CreatorStatsCards";
import ConcentrationChart from "./sales-dashboard/ConcentrationChart";
import CreatorsTable from "./sales-dashboard/CreatorsTable";
import type { ViewTab, TimePeriod } from "./sales-dashboard/DashboardFilters";

const SalesDashboard = () => {
  const [activeView, setActiveView] = useState<ViewTab>("Vista General");
  const [activePeriod, setActivePeriod] = useState<TimePeriod>("Esta semana");

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
            />
            <EarningsSummary />
            <EarningsTrendChart />
            <CreatorStatsCards />
            <ConcentrationChart />
            <CreatorsTable />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SalesDashboard;
