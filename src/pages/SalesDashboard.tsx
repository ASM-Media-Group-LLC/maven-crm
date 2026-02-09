import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
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
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Logo size="sm" />
          </div>
          <span className="text-sm text-muted-foreground">Sales Dashboard</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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
  );
};

export default SalesDashboard;
