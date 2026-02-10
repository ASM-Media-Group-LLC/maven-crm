import { useMemo } from "react";
import { DollarSign, Users, Activity, BarChart3, BarChart, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardMetricCard from "./DashboardMetricCard";
import { useEarningsData } from "@/pages/sales-performance/useEarningsData";

const DashboardContent = () => {
  const { data: rows = [], isLoading } = useEarningsData();

  const metrics = useMemo(() => {
    let totalRevenue = 0;
    const creatorSet = new Set<string>();

    for (const r of rows) {
      totalRevenue += r.total_earnings_gross ?? 0;
      const key = r.creator_id || r.pending_creator || r.id;
      creatorSet.add(key);
    }

    const fmt = (v: number) =>
      `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return [
      { label: "Total Revenue", value: isLoading ? "…" : fmt(totalRevenue), icon: DollarSign, trend: "up" as const },
      { label: "Active Creators", value: isLoading ? "…" : String(creatorSet.size), icon: Users, trend: "neutral" as const },
      { label: "Conversion Rate", value: "--", icon: Activity, trend: "neutral" as const },
      { label: "Avg. Session", value: "--", icon: Clock, trend: "neutral" as const },
    ];
  }, [rows, isLoading]);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of earnings data from all creators.</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <DashboardMetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Data area */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart placeholder */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <BarChart className="h-8 w-8" />
                <span className="text-sm">No data</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <BarChart3 className="h-8 w-8" />
                <span className="text-sm">No data</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default DashboardContent;
