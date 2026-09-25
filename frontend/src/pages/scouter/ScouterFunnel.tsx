import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, MessageSquare, Handshake, Trophy, XCircle, EyeOff } from "lucide-react";
import {
  useScouterFunnel,
  useScouterCompanies,
  type FunnelWindow,
} from "@/hooks/useScouterLeads";
import { ManagerDashboard } from "@/components/scouter/ManagerDashboard";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// Funnel subtab — pipeline metrics for Scouter Assist. Reuses the
// counts in scouter_leads (no new tables needed) and renders:
//   - Window selector (7d / 30d / 90d / all)
//   - 4-stage horizontal bar funnel: Descubiertos → Contactados →
//     Confirmados → Activos, with per-step conversion %
//   - Side cards for outcomes that fall OFF the funnel: Rechazados,
//     Descartados
//   - Top discovery sources table
//   - Per-company breakdown (with conversion to active%)

const WINDOW_OPTIONS: Array<{ value: FunnelWindow; labelKey: TranslationKey }> = [
  { value: "7d",  labelKey: "scouter.funnel.last7" },
  { value: "30d", labelKey: "scouter.funnel.last30" },
  { value: "90d", labelKey: "scouter.funnel.last90" },
  { value: "all", labelKey: "common.entireHistory" },
];

const STAGES = [
  { key: "discovered", labelKey: "scouter.funnel.stage.discovered", icon: Search,        color: "rgb(99 102 241)" },
  { key: "contacted",  labelKey: "scouter.funnel.stage.contacted",  icon: MessageSquare, color: "rgb(14 165 233)" },
  { key: "confirmed",  labelKey: "scouter.funnel.stage.confirmed",  icon: Handshake,     color: "rgb(22 163 74)" },
  { key: "active",     labelKey: "scouter.funnel.stage.active",     icon: Trophy,        color: "rgb(34 197 94)" },
] as const;

const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const ScouterFunnel = () => {
  const { t } = useLanguage();
  const [window, setWindow] = useState<FunnelWindow>("30d");
  const funnelQ = useScouterFunnel(window);
  const companiesQ = useScouterCompanies();
  const data = funnelQ.data;
  // ManagerDashboard date — controlled state, antes vivía en Home y se
  // movió acá para liberar el Home.
  const [managerDate, setManagerDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );

  const companyById = new Map(companiesQ.data?.map((c) => [c.id, c]) ?? []);

  const max = data
    ? Math.max(
        data.funnel.discovered,
        data.funnel.contacted,
        data.funnel.confirmed,
        data.funnel.active,
      )
    : 0;

  // Conversion from each stage to the next, in stage-order.
  const stepRates: Array<number | null> = data
    ? [null, data.rates.contactRate, data.rates.confirmRate, data.rates.closeRate]
    : [null, null, null, null];

  return (
    <div className="space-y-6">
      {/* ─── Sección: Funnel ────────────────────────────────────────── */}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Funnel</h2>
          <p className="text-xs text-muted-foreground">
            {t("scouter.funnel.subtitle")}
          </p>
        </div>
        <Select value={window} onValueChange={(v) => setWindow(v as FunnelWindow)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {funnelQ.isLoading || !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Funnel bars */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="space-y-3">
              {STAGES.map((stage, i) => {
                const value = data.funnel[stage.key];
                const widthPct = max > 0 ? (value / max) * 100 : 0;
                const stepRate = stepRates[i];
                const Icon = stage.icon;
                return (
                  <div key={stage.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: stage.color }} />
                        <span className="font-medium">{t(stage.labelKey)}</span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        <span className="font-bold">{value}</span>
                        {stepRate != null && (
                          <span className="text-xs text-muted-foreground">
                            ↓ {formatPct(stepRate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-7 overflow-hidden rounded-md bg-muted/30">
                      <div
                        className="h-full rounded-md transition-[width] duration-500"
                        style={{ width: `${widthPct}%`, background: stage.color, opacity: 0.85 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("scouter.funnel.overall")}</span>
              <span className="font-bold tabular-nums" style={{ color: "rgb(34 197 94)" }}>
                {formatPct(data.rates.overall)}
              </span>
            </div>
          </div>

          {/* Outcomes off the funnel */}
          <div className="grid grid-cols-2 gap-3">
            <OutcomeCard
              icon={XCircle}
              label={t("scouter.funnel.rejected")}
              value={data.funnel.rejected}
              hint={t("scouter.funnel.rejectedHint")}
              color="rgb(248 113 113)"
            />
            <OutcomeCard
              icon={EyeOff}
              label={t("scouter.funnel.discarded")}
              value={data.funnel.discarded}
              hint={t("scouter.funnel.discardedHint")}
              color="rgb(161 161 170)"
            />
          </div>

          {/* Two-column lower section */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top sources */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                {t("scouter.funnel.topSources")}
              </h3>
              {data.topSources.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("scouter.funnel.noSources")}</p>
              ) : (
                <ul className="space-y-2">
                  {data.topSources.map((s) => {
                    const total = data.topSources.reduce((a, b) => a + b.count, 0);
                    const pct = total > 0 ? (s.count / total) * 100 : 0;
                    return (
                      <li key={s.source} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-mono text-xs">{s.source}</span>
                          <span className="tabular-nums text-muted-foreground">{s.count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Per-company breakdown */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                {t("scouter.funnel.byCompany")}
              </h3>
              {data.perCompany.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("scouter.funnel.noCompanies")}</p>
              ) : (
                <ul className="space-y-2">
                  {data.perCompany.slice(0, 8).map((c) => {
                    const meta = companyById.get(c.company_id);
                    const conv = c.total > 0 ? c.active / c.total : 0;
                    return (
                      <li key={c.company_id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {meta?.name ?? meta?.slug ?? c.company_id.slice(0, 8)}
                        </span>
                        <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                          <span>
                            <span className="text-foreground">{c.total}</span> total
                          </span>
                          <span>
                            <span className="font-bold" style={{ color: "rgb(34 197 94)" }}>
                              {c.active}
                            </span>{" "}
                            {t("scouter.funnel.activeSuffix")}
                          </span>
                          <span className="rounded-md bg-muted/40 px-1.5 py-0.5">
                            {formatPct(conv)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Sección: Progreso del equipo ─────────────────────────────
          Vivía en ScouterHome arriba de los filtros, pero ocupaba mucho
          espacio vertical en una vista enfocada a Listado. Acá tiene su
          lugar natural junto al Funnel. */}
      <div className="pt-2 border-t border-border/60">
        <div className="pt-4">
          <h2 className="text-base font-semibold mb-3">{t("scouter.teamProgress")}</h2>
          <ManagerDashboard date={managerDate} onDateChange={setManagerDate} />
        </div>
      </div>
    </div>
  );
};

const OutcomeCard = ({
  icon: Icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number;
  hint: string;
  color: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
          {value}
        </div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <Icon className="h-5 w-5 shrink-0" style={{ color, opacity: 0.7 }} />
    </div>
  </div>
);

export default ScouterFunnel;
