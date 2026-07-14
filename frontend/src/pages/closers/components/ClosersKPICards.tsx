import { useState } from "react";
import { Users, CheckCircle, Trophy, XCircle, TrendingUp, Layers, Crown, Repeat } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { es } from "date-fns/locale";
import KpiCard from "@/components/dashboard/KpiCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import BestCloserMonthlyDialog from "@/components/dashboard/BestCloserMonthlyDialog";
import { useBestCloser } from "@/hooks/useOperationsDashboard";

interface Props {
  statusCounts: Record<string, number>;
  platformRevenue: Record<string, number>;
  ofMonetizationTotal: number;
  subscriptionRevenueTotal: number;
  dateFrom?: Date;
  dateTo?: Date;
  onPipelineClick?: (key: "total" | "asignadas" | "confirmadas" | "completadas" | "cerradas" | "no_interesadas") => void;
  onRevenueClick?: (platform: string) => void;
}

// Compact money formatter — evita truncamiento en cards angostas.
const fmtMoney = (n: number) => {
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

// Cada plataforma tiene un color distintivo. Mantengo paleta consistente
// con badges/charts del resto de la app — violet para "premium", verde
// para revenue principal, etc.
const PLATFORM_COLORS: Record<string, { bar: string; dot: string }> = {
  Trafix:     { bar: "bg-violet-500",  dot: "bg-violet-500" },
  Blu:        { bar: "bg-blue-500",    dot: "bg-blue-500" },
  Piclink:    { bar: "bg-pink-500",    dot: "bg-pink-500" },
  "Content Protector": { bar: "bg-amber-500", dot: "bg-amber-500" },
  ORA:        { bar: "bg-emerald-500", dot: "bg-emerald-500" },
};

const ClosersKPICards = ({
  statusCounts,
  platformRevenue,
  ofMonetizationTotal,
  subscriptionRevenueTotal,
  dateFrom,
  dateTo,
  onPipelineClick,
  onRevenueClick,
}: Props) => {
  const asignadas = statusCounts["Asignada"] || 0;
  const confirmadas = statusCounts["Confirmada"] || 0;
  const completadas = statusCounts["Completada"] || 0;
  const noInteresadas = statusCounts["No interesada"] || 0;
  const cerradas = confirmadas + completadas;
  const total = asignadas + confirmadas + completadas + noInteresadas;

  // Mismo hook que usa Panel de Control — 70% cierres normalizados +
  // 30% calif QA promedio del rango. Si el filter de la página NO tiene
  // rango activo, defaulteamos a mes en curso (igual que Panel de
  // Control). Sin este default, el hero contaría TODO el histórico y se
  // mostraría desincronizado con el card de Panel de Control.
  const today = new Date();
  const bestCloserRange =
    dateFrom || dateTo
      ? { from: dateFrom, to: dateTo }
      : { from: startOfMonth(today), to: endOfMonth(today) };
  const { data: bestCloser, isLoading: bestCloserLoading } = useBestCloser(bestCloserRange);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  const salePlatforms = ["Trafix", "Blu", "Piclink", "Content Protector", "ORA"];
  const revPlataformas = salePlatforms.reduce((s, p) => s + (platformRevenue[p] || 0), 0);
  const revTotal = ofMonetizationTotal + revPlataformas + subscriptionRevenueTotal;

  const pipelineCards = [
    { key: "total" as const, label: "Total", count: total, icon: Users, color: "bg-slate-500" },
    { key: "asignadas" as const, label: "Asignadas", count: asignadas, icon: Users, color: "bg-blue-500" },
    { key: "confirmadas" as const, label: "Confirmadas", count: confirmadas, icon: CheckCircle, color: "bg-emerald-500" },
    { key: "completadas" as const, label: "Completadas", count: completadas, icon: Trophy, color: "bg-emerald-600" },
    { key: "cerradas" as const, label: "Cerradas", count: cerradas, icon: CheckCircle, color: "bg-violet-500" },
    { key: "no_interesadas" as const, label: "No interesadas", count: noInteresadas, icon: XCircle, color: "bg-rose-500" },
  ];

  // Hero del revenue — 3 cards grandes y prominentes (lo que importa).
  const heroRevenue = [
    { label: "Rev. Plataformas", amount: revPlataformas, icon: Layers, color: "bg-violet-500" },
    { label: "Rev. OnlyFans", amount: ofMonetizationTotal, icon: TrendingUp, color: "bg-emerald-500" },
    { label: "Rev. Suscripciones", amount: subscriptionRevenueTotal, icon: Repeat, color: "bg-cyan-500" },
    { label: "Rev. Total", amount: revTotal, icon: Crown, color: "bg-blue-600" },
  ];

  // Datos para el stacked bar de plataformas. Si todo es $0, mostramos
  // un placeholder en vez de barra vacía.
  const platformBreakdown = salePlatforms.map((p) => ({
    key: p,
    amount: platformRevenue[p] || 0,
  }));
  const platformsTotal = revPlataformas;

  return (
    <div className="space-y-6">
      {/* Mejor cerrador — hero card clickeable. Click abre el dialog
          con el ranking por mes. */}
      <button
        type="button"
        onClick={() => setMonthlyOpen(true)}
        className="w-full text-left"
      >
        <Card className="p-5 border-2 border-amber-500/30 relative overflow-hidden transition-all duration-200 hover:scale-[1.01] hover:border-amber-500/60 hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.4)] cursor-pointer">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-30 bg-amber-500" />
          <div className="relative flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-widest text-amber-500/90 font-bold">
                Mejor cerrador <span className="text-muted-foreground/80 font-semibold">· {format(today, "MMMM yyyy", { locale: es })}</span>
              </p>
              {bestCloserLoading ? (
                <Skeleton className="mt-1 h-7 w-48" />
              ) : bestCloser ? (
                <>
                  <p className="text-2xl font-bold leading-tight mt-1 truncate">
                    {bestCloser.name}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="tabular-nums">
                      <strong className="text-foreground">{bestCloser.closes.toLocaleString("es")}</strong> cierres
                    </span>
                    <span className="text-border">·</span>
                    <span className="tabular-nums">
                      Calif. QA promedio <strong className="text-foreground">{Math.round(bestCloser.avgScore)}/100</strong>
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Sin calls en el rango seleccionado.
                </p>
              )}
            </div>
          </div>
        </Card>
      </button>

      <BestCloserMonthlyDialog open={monthlyOpen} onOpenChange={setMonthlyOpen} />

      {/* Pipeline — primera sección */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Pipeline
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {pipelineCards.map((card) => (
            <KpiCard
              key={card.label}
              label={card.label}
              value={card.count}
              icon={card.icon}
              color={card.color}
              onClick={onPipelineClick ? () => onPipelineClick(card.key) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Revenue Hero — 3 cards grandes con los totales relevantes */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Revenue
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {heroRevenue.map((card) => (
            <KpiCard
              key={card.label}
              label={card.label}
              value={fmtMoney(card.amount)}
              icon={card.icon}
              color={card.color}
              onClick={onRevenueClick ? () => onRevenueClick(card.label) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Por plataforma — stacked bar horizontal + leyenda. Cada
          segmento es clickeable y abre el popup detalle. Si platformsTotal
          es 0 (todas en cero), se muestra una barra placeholder gris. */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Por plataforma
        </h3>
        <Card className="p-4 space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {platformsTotal === 0 ? (
              <div className="h-full w-full bg-muted" />
            ) : (
              platformBreakdown
                .filter((p) => p.amount > 0)
                .map((p) => {
                  const pct = (p.amount / platformsTotal) * 100;
                  const color = PLATFORM_COLORS[p.key]?.bar ?? "bg-slate-500";
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={onRevenueClick ? () => onRevenueClick(p.key) : undefined}
                      disabled={!onRevenueClick}
                      title={`${p.key}: ${fmtMoney(p.amount)} · ${pct.toFixed(1)}%`}
                      className={`h-full ${color} transition-opacity hover:opacity-80 disabled:hover:opacity-100`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-5">
            {platformBreakdown.map((p) => {
              const pct = platformsTotal > 0 ? (p.amount / platformsTotal) * 100 : 0;
              const dot = PLATFORM_COLORS[p.key]?.dot ?? "bg-slate-500";
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={onRevenueClick ? () => onRevenueClick(p.key) : undefined}
                  disabled={!onRevenueClick}
                  className="flex items-center gap-2 text-left transition-opacity hover:opacity-80 disabled:hover:opacity-100"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                      {p.key}
                    </p>
                    <p className="text-sm font-bold tabular-nums leading-tight">
                      {fmtMoney(p.amount)}
                      {platformsTotal > 0 && p.amount > 0 && (
                        <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ClosersKPICards;
