import { useState, useMemo } from "react";
import { startOfDay, startOfWeek, startOfMonth, subMonths, endOfDay, differenceInDays, getDaysInMonth, getDate } from "date-fns";
import { useEarningsData } from "../sales-performance/useEarningsData";
import { usePeriodComparison } from "./usePeriodComparison";
import ComparativasHeader from "./comparativas/ComparativasHeader";
import ComparativasKPIs from "./comparativas/ComparativasKPIs";
import EvolucionChart from "./comparativas/EvolucionChart";
import ComparacionDirectaChart from "./comparativas/ComparacionDirectaChart";
import ProyeccionCard from "./comparativas/ProyeccionCard";
import DesgloseRevenueCard from "./comparativas/DesgloseRevenueCard";
import RankingCards from "./comparativas/RankingCards";
import ComparativaTable from "./comparativas/ComparativaTable";

type Period = "Hoy" | "7 días" | "Este mes";

const getDateRange = (period: Period) => {
  const now = new Date();
  const today = startOfDay(now);
  switch (period) {
    case "Hoy": return { from: today, to: today };
    case "7 días": return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today };
    case "Este mes": return { from: startOfMonth(today), to: today };
  }
};

const ComparativasPage = () => {
  const [activePeriod, setActivePeriod] = useState<Period>("Este mes");
  const { data: allRows = [], isLoading } = useEarningsData();
  const dateRange = useMemo(() => getDateRange(activePeriod), [activePeriod]);
  const comparison = usePeriodComparison(allRows, dateRange);

  // Monthly evolution (last 4 months)
  const monthlyEvolution = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, i) => {
      const mStart = startOfMonth(subMonths(now, 3 - i));
      const mEnd = endOfDay(new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0));
      const total = allRows
        .filter((r) => { const d = new Date(r.effective_date); return d >= mStart && d <= mEnd; })
        .reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);
      const labels = ["3M ago", "2M ago", "Prev", "Current"];
      return { label: labels[i], value: total };
    });
  }, [allRows]);

  // Revenue breakdown for current period
  const revenueBreakdown = useMemo(() => {
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    const rows = allRows.filter((r) => { const d = new Date(r.effective_date); return d >= from && d <= to; });
    const subs = rows.reduce((s, r) => s + (r.subscription_gross ?? 0), 0);
    const msgs = rows.reduce((s, r) => s + (r.message_gross ?? 0), 0);
    const tips = rows.reduce((s, r) => s + (r.tips_gross ?? 0), 0);
    const total = subs + msgs + tips;
    return [
      { label: "Subscriptions", value: subs, percent: total > 0 ? (subs / total) * 100 : 0 },
      { label: "Messages", value: msgs, percent: total > 0 ? (msgs / total) * 100 : 0 },
      { label: "Tips", value: tips, percent: total > 0 ? (tips / total) * 100 : 0 },
    ];
  }, [allRows, dateRange]);

  // Projection
  const projection = useMemo(() => {
    const now = new Date();
    const daysInMonth = getDaysInMonth(now);
    const dayOfMonth = getDate(now);
    const dailyAvg = dayOfMonth > 0 ? comparison.totalCurrent / dayOfMonth : 0;
    const projected = dailyAvg * daysInMonth;
    const daysRemaining = daysInMonth - dayOfMonth;
    const progressPercent = (dayOfMonth / daysInMonth) * 100;
    return { projected, dailyAvg, daysRemaining, progressPercent };
  }, [comparison.totalCurrent]);

  // Today vs yesterday
  const todayVsYesterday = useMemo(() => {
    const today = startOfDay(new Date());
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const todayTotal = allRows.filter(r => r.effective_date === todayStr).reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);
    const yesterdayTotal = allRows.filter(r => r.effective_date === yesterdayStr).reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);
    const change = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : 0;
    return { today: todayTotal, yesterday: yesterdayTotal, changePercent: change };
  }, [allRows]);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando datos…</div>
            ) : (
              <>
                <ComparativasHeader
                  activePeriod={activePeriod}
                  onPeriodChange={setActivePeriod}
                />
                <ComparativasKPIs
                  comparison={comparison}
                  todayVsYesterday={todayVsYesterday}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <EvolucionChart data={monthlyEvolution} />
                  <ComparacionDirectaChart
                    current={comparison.totalCurrent}
                    previous={comparison.totalPrevious}
                  />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ProyeccionCard projection={projection} />
                  <DesgloseRevenueCard breakdown={revenueBreakdown} />
                </div>
                <RankingCards comparison={comparison} />
                <ComparativaTable creators={comparison.creators} />
              </>
            )}
    </main>
  );
};

export default ComparativasPage;
