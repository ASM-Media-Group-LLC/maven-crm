import { useState, useMemo } from "react";
import { format, startOfMonth as som, startOfToday, subMonths } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import SalesOverviewHeader from "./sales-overview/SalesOverviewHeader";
import SalesKPICards from "./sales-overview/SalesKPICards";
import SalesOperationalCards from "./sales-overview/SalesOperationalCards";
import CardDetailModal from "./sales-overview/CardDetailModal";
import VentasSubtabs from "./sales-overview/VentasSubtabs";
import EarningsTrendChart from "./sales-dashboard/EarningsTrendChart";
import EarningsByChannelChart from "./sales-dashboard/EarningsByChannelChart";
import TopCreatorsTable from "./sales-overview/TopCreatorsTable";
import { buildComparisonRanges, usePeriodComparison } from "./sales-overview/usePeriodComparison";
import { useDashboard2Summary } from "./sales-performance/useDashboard2Summary";
import { useSalesDailyTotals, useSalesMonthlyTotals } from "./sales-overview/useSalesTotals";
import { rangeForPreset, type RangePreset } from "@/lib/range-presets";
import type { EarningsRow } from "./sales-performance/types";

const SPARKLINE_MONTHS = 4;

const day = (d: Date) => format(d, "yyyy-MM-dd");

// Charts compartidos con /salesdashboard esperan EarningsRow[]; acá les damos UNA fila
// sintética por día (ya agregada server-side) — agrupan por effective_date y suman, así
// que el resultado es idéntico al de las filas crudas, con ~31 filas en vez de ~2.000.
const toChartRows = (daily: { date: string; total_gross: number; subscription_gross: number; tips_gross: number; message_gross: number }[]): EarningsRow[] =>
  daily.map((d) => ({
    id: d.date,
    date: d.date,
    total_earnings_gross: d.total_gross,
    subscription_gross: d.subscription_gross,
    new_subscriptions_sub_gross: null,
    recurring_sub_gross: null,
    message_gross: d.message_gross,
    tips_gross: d.tips_gross,
    active_fans: null,
    new_fans: null,
    following: null,
    of_ranking: null,
    contribution: null,
    fans_renew_on: null,
    renew_on_percentage: null,
    change_expired_fan_count: null,
    avg_spend_per_spender_gross: null,
    avg_spend_per_transaction_gross: null,
    avg_earnings_per_fan_gross: null,
    document_id: null,
    pending_creator: null,
    creator_id: null,
    artistic_name: null,
    report_time: null,
    effective_date: d.date,
  }));

const SalesOverview = () => {
  // `today` estable durante toda la sesión de la página: startOfToday() crea un Date
  // NUEVO en cada render y rompía los useMemo aguas abajo (re-agregaban todo cada vez).
  const [today] = useState(() => startOfToday());
  // Default "Este mes" (rango explícito) para que SIEMPRE se vea de qué fecha son los números.
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => rangeForPreset("this_month", new Date()).from);
  const [dateTo, setDateTo] = useState<Date | undefined>(() => rangeForPreset("this_month", new Date()).to);
  const [activePreset, setActivePreset] = useState<RangePreset | null>("this_month");
  const [modalType, setModalType] = useState<string | null>(null);

  // Rangos JUSTOS: `to` clampeado a hoy + período anterior con los mismos días
  // transcurridos (ago 1-24 vs jul 1-24, no vs julio completo).
  const ranges = useMemo(
    () => buildComparisonRanges(dateFrom ?? today, dateTo ?? today, today),
    [dateFrom, dateTo, today],
  );

  // 2 llamadas paralelas al RPC de resumen por creadora (~80 filas c/u) — reemplaza la
  // bajada del histórico completo de creator_daily_earnings (~40.9k filas, 43 requests).
  const currentQ = useDashboard2Summary(day(ranges.from), day(ranges.effTo));
  const previousQ = useDashboard2Summary(day(ranges.prevFrom), day(ranges.prevTo));
  const comparison = usePeriodComparison(currentQ.data, previousQ.data);

  // Charts: totales por día del rango (1 fila/día, server-side).
  const dailyQ = useSalesDailyTotals(day(ranges.from), day(ranges.effTo));
  const chartRows = useMemo(() => toChartRows(dailyQ.data ?? []), [dailyQ.data]);

  // Sparkline: total por mes de los últimos 4 meses (1 fila/mes, server-side).
  const monthlyQ = useSalesMonthlyTotals(SPARKLINE_MONTHS);
  const sparklineData = useMemo(() => {
    const byMonth = new Map((monthlyQ.data ?? []).map((m) => [m.month, m.total_gross]));
    return Array.from({ length: SPARKLINE_MONTHS }, (_, i) => {
      const key = day(som(subMonths(today, SPARKLINE_MONTHS - 1 - i)));
      return { value: byMonth.get(key) ?? 0 };
    });
  }, [monthlyQ.data, today]);

  const kpisLoading = currentQ.isLoading || previousQ.isLoading;

  const handleDateChange = (from: Date | undefined, to: Date | undefined) => {
    setDateFrom(from);
    setDateTo(to);
    setActivePreset(null); // selección manual en el calendario → sin pill activo
  };
  const handlePreset = (key: RangePreset) => {
    const r = rangeForPreset(key, new Date());
    setDateFrom(r.from);
    setDateTo(r.to);
    setActivePreset(key);
  };

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
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Topbar fijo con VentasSubtabs — misma posición en /sales-overview,
          /salesdashboard, /aisales y /sales-audit para que cambiar de tab
          no genere salto visual. */}
      <div className="border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-3 shrink-0">
        <VentasSubtabs />
      </div>
      {/* Header SIEMPRE visible (título + filtros); los números muestran skeleton
          mientras cargan en vez de ocultar la página entera. */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b bg-background">
        <SalesOverviewHeader
          totalEarnings={comparison.totalCurrent}
          changePercent={comparison.totalChangePercent}
          activeCreators={comparison.activeCreators}
          isLoading={kpisLoading}
          comparisonLabel={ranges.comparisonLabel}
          includesToday={ranges.includesToday}
          from={dateFrom}
          to={dateTo}
          onDateChange={handleDateChange}
          activePreset={activePreset}
          onPreset={handlePreset}
        />
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {kpisLoading ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          </>
        ) : (
          <>
            <SalesKPICards data={comparison} onCardClick={setModalType} />
            <SalesOperationalCards
              data={comparison}
              onCardClick={setModalType}
              sparklineData={sparklineData}
            />
          </>
        )}
        {dailyQ.isLoading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <EarningsTrendChart rows={chartRows} earningsMode="net" />
            <EarningsByChannelChart rows={chartRows} earningsMode="net" />
          </div>
        )}
        {kpisLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <TopCreatorsTable creators={comparison.top10} />
        )}
        <CardDetailModal
          open={!!modalType}
          onOpenChange={(open) => !open && setModalType(null)}
          cardType={modalType || ""}
          creators={getModalCreators()}
        />
      </div>
    </main>
  );
};

export default SalesOverview;
