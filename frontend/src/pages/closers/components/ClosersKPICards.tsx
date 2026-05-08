import { Users, CheckCircle, Trophy, XCircle, DollarSign, TrendingUp, Layers, Crown } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";

interface Props {
  statusCounts: Record<string, number>;
  platformRevenue: Record<string, number>;
  ofMonetizationTotal: number;
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

const ClosersKPICards = ({ statusCounts, platformRevenue, ofMonetizationTotal, onPipelineClick, onRevenueClick }: Props) => {
  const asignadas = statusCounts["Asignada"] || 0;
  const confirmadas = statusCounts["Confirmada"] || 0;
  const completadas = statusCounts["Completada"] || 0;
  const noInteresadas = statusCounts["No interesada"] || 0;
  const cerradas = confirmadas + completadas;
  const total = asignadas + confirmadas + completadas + noInteresadas;

  const salePlatforms = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"];
  const revPlataformas = salePlatforms.reduce((s, p) => s + (platformRevenue[p] || 0), 0);
  const revTotal = ofMonetizationTotal + revPlataformas;

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
    { label: "Rev. Total", amount: revTotal, icon: Crown, color: "bg-blue-600" },
  ];

  // Breakdown por plataforma — compacto, secundario.
  const platformBreakdown = [
    { label: "LeakHunter", key: "LeakHunter" },
    { label: "Blu", key: "Blu" },
    { label: "Trafix", key: "Trafix" },
    { label: "ORA", key: "ORA" },
    { label: "Piclink", key: "Piclink" },
  ];

  return (
    <div className="space-y-6">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

      {/* Breakdown por plataforma — fila compacta de pills clickeables.
          No usamos KpiCard aquí porque ocupan demasiado espacio para
          5 ítems secundarios. Estilo minimalista con el mismo lift. */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Por plataforma
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {platformBreakdown.map((p) => {
            const amount = platformRevenue[p.key] || 0;
            return (
              <button
                key={p.key}
                type="button"
                onClick={onRevenueClick ? () => onRevenueClick(p.label) : undefined}
                disabled={!onRevenueClick}
                className="group flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-all duration-200 ease-out hover:scale-[1.015] hover:border-primary/40 hover:shadow-[0_0_16px_-6px_rgba(255,255,255,0.15)] disabled:cursor-default disabled:hover:scale-100"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{p.label}</p>
                  <p className="text-base font-bold tabular-nums leading-tight truncate">{fmtMoney(amount)}</p>
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted shrink-0">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ClosersKPICards;
