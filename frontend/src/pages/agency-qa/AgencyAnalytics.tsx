import { useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trophy, Users, BarChart3, TrendingUp } from "lucide-react";
import StatChip from "@/components/StatChip";
import { ConFormato } from "@/pages/admin/ConFormato";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import {
  useQaAnalytics,
  scoreColor,
  type QaWindow,
} from "@/hooks/useAgencyQa";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// Analytics subtab — supervisor dashboard for Agency QA. Aggregates
// every qa_calls row in the chosen window and surfaces:
//   1. KPI strip (total calls, close rate, avg score, active closers)
//   2. Outcome donut (cerro / no_cerro / en_espera / unscored)
//   3. Weekly volume line (last 12 ISO-weeks bucketed)
//   4. Closer leaderboard (top 10 by avg score)
//   5. Top models by # calls (top 10)
//
// Out of scope (next slices): drill-down a closer/modelo individual,
// export PDF, period-vs-period comparison, audio metrics rollup.

// `value` es el parámetro de la consulta (no se traduce); label/hint son claves.
const WINDOW_OPTIONS: Array<{ value: QaWindow; label: TranslationKey; hint: TranslationKey }> = [
  { value: "7d",  label: "agencyQa.window.7d",     hint: "agencyQa.analytics.hint.7d" },
  { value: "30d", label: "agencyQa.window.30d",    hint: "agencyQa.analytics.hint.30d" },
  { value: "90d", label: "agencyQa.window.90d",    hint: "agencyQa.analytics.hint.90d" },
  { value: "all", label: "common.entireHistory",   hint: "agencyQa.analytics.hint.all" },
];

const OUTCOME_COLORS: Record<string, string> = {
  cerro:     "#16a34a",
  no_cerro:  "#dc2626",
  en_espera: "#ca8a04",
  unscored:  "#71717a",
};
const OUTCOME_LABELS: Record<string, TranslationKey> = {
  cerro:     "agencyQa.outcome.closed",
  no_cerro:  "agencyQa.outcome.notClosed",
  en_espera: "agencyQa.outcome.waiting",
  unscored:  "agencyQa.outcome.unscored",
};

const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const fmtWeekShort = (iso: string, locale: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
};

// ─── KPI card — wrapper sobre KpiCard estándar ──────────────────────
const Kpi = ({
  label,
  value,
  hint,
  color,
  icon,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color: string;
  icon: ReactNode;
  onClick?: () => void;
}) => (
  <StatChip label={label} value={value} icon={icon} color={color} hint={hint} onClick={onClick} />
);

// ─── Main ──────────────────────────────────────────────────────────────
const AgencyAnalytics = () => {
  const { t } = useLanguage();
  const f = useFormato();
  const [window, setWindow] = useState<QaWindow>("30d");
  type KpiKey = "totales" | "close_rate" | "score" | "closers";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const q = useQaAnalytics(window);
  const data = q.data;

  const outcomeData = data
    ? [
        { key: "cerro", value: data.cerro },
        { key: "no_cerro", value: data.no_cerro },
        { key: "en_espera", value: data.en_espera },
        { key: "unscored", value: data.unscored },
      ].filter((d) => d.value > 0)
    : [];

  const weeklyData = (data?.weekly_volume ?? []).map((w) => ({
    label: fmtWeekShort(w.week_start, f.intl("es-ES")),
    calls: w.count,
    avg: w.avg_score,
  }));

  return (
    <div className="space-y-5">
      {/* Header + window selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("agencyQa.analytics.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("agencyQa.analytics.subtitle")}</p>
        </div>
        <Select value={window} onValueChange={(v) => setWindow(v as QaWindow)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          <p className="font-semibold text-destructive">{t("agencyQa.analytics.loadError")}</p>
          <p className="mt-1 text-xs text-destructive/80">
            {(q.error as Error)?.message ?? t("agencyQa.analytics.unknownError")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            <ConFormato
              texto={t("agencyQa.analytics.migrationsHint")}
              piezas={{ file: <code className="mx-1 rounded bg-muted/40 px-1">scripts/manual-pending-migrations.sql</code> }}
            />
          </p>
        </div>
      ) : q.isLoading || !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.total_calls === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm font-medium">{t("agencyQa.analytics.emptyTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("agencyQa.analytics.emptyHint", { tab: t("agencyQa.tab.newQa") })}
          </p>
        </div>
      ) : (
        <>
          {/* KPI strip — clickeables, abren modal */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label={t("agencyQa.totalAnalyses")}
              value={data.total_calls}
              hint={t(WINDOW_OPTIONS.find((w) => w.value === data.window)?.hint ?? "agencyQa.analytics.hint.all")}
              color="bg-primary"
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              onClick={() => setKpiPopup("totales")}
            />
            <Kpi
              label="Close rate"
              value={formatPct(data.close_rate)}
              hint={t("agencyQa.analytics.closes", { n: data.cerro })}
              color="bg-success"
              icon={<Trophy className="h-3.5 w-3.5" />}
              onClick={() => setKpiPopup("close_rate")}
            />
            <Kpi
              label={t("agencyQa.avgScore")}
              value={data.avg_score}
              hint={`/ 100`}
              color={data.avg_score >= 70 ? "bg-success" : data.avg_score >= 50 ? "bg-warning" : "bg-destructive"}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              onClick={() => setKpiPopup("score")}
            />
            <Kpi
              label={t("agencyQa.analytics.activeClosers")}
              value={data.active_closers}
              hint={t("agencyQa.analytics.modelsWithCalls", { n: data.active_models })}
              color="bg-primary"
              icon={<Users className="h-3.5 w-3.5" />}
              onClick={() => setKpiPopup("closers")}
            />
          </div>

          {/* Two-column row: outcome donut + weekly volume */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Outcome donut */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                {t("agencyQa.analytics.distribution")}
              </h3>
              {outcomeData.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("agencyQa.analytics.noOutcomes")}
                </p>
              ) : (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={outcomeData}
                          dataKey="value"
                          nameKey="key"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                          stroke="hsl(var(--card))"
                          strokeWidth={2}
                        >
                          {outcomeData.map((d) => (
                            <Cell key={d.key} fill={OUTCOME_COLORS[d.key]} />
                          ))}
                        </Pie>
                        <RTooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(value: number, _name: string, item: any) => [
                            value,
                            t(OUTCOME_LABELS[item.payload.key]),
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 space-y-2 text-sm">
                    {outcomeData.map((d) => {
                      const pct = data.total_calls > 0 ? (d.value / data.total_calls) * 100 : 0;
                      return (
                        <li key={d.key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: OUTCOME_COLORS[d.key] }}
                            />
                            {t(OUTCOME_LABELS[d.key])}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            <span className="text-foreground">{d.value}</span> · {pct.toFixed(1)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Weekly volume line */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                {t("agencyQa.analytics.weekly")}
              </h3>
              {weeklyData.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("agencyQa.analytics.noWeekly")}
                </p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="calls"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Calls"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Two-column row: closer leaderboard + top models */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Closer leaderboard */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                {t("agencyQa.analytics.leaderboard")}
              </h3>
              {data.closer_leaderboard.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("agencyQa.analytics.noClosers")}
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.closer_leaderboard}
                      layout="vertical"
                      margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                    >
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="closer_name"
                        width={120}
                        tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                      />
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string, item: any) => {
                          if (name === "avg_score") return [value, t("agencyQa.scoreAvg")];
                          if (name === "calls") return [value, "Calls"];
                          if (name === "close_rate") return [`${(value * 100).toFixed(0)}%`, "Close rate"];
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="avg_score" radius={[0, 4, 4, 0]}>
                        {data.closer_leaderboard.map((c) => (
                          <Cell key={c.closer_id} fill={scoreColor(c.avg_score)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top models */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                {t("agencyQa.analytics.topModels")}
              </h3>
              {data.top_models.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("agencyQa.analytics.noModels")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.top_models.map((m) => {
                    const max = data.top_models[0]?.calls || 1;
                    const pct = (m.calls / max) * 100;
                    return (
                      <li key={m.model_id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="min-w-0 truncate font-medium">{m.model_name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            <span className="text-foreground">{m.calls}</span> {t("agencyQa.analytics.callsAvg")}{" "}
                            <span className="font-bold" style={{ color: scoreColor(m.avg_score) }}>
                              {m.avg_score}
                            </span>
                          </span>
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
          </div>
        </>
      )}

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("agencyQa.analytics.noRecords")}
        title={(() => {
          if (!kpiPopup || !data) return "";
          switch (kpiPopup) {
            case "totales": return t("agencyQa.analytics.popupTotal", { n: data.total_calls });
            case "close_rate": return t("agencyQa.analytics.popupCloseRate", { pct: formatPct(data.close_rate) });
            case "score": return t("agencyQa.analytics.popupScore", { n: data.avg_score });
            case "closers": return t("agencyQa.analytics.popupClosers", { n: data.active_closers });
          }
        })()}
        subtitle={t("agencyQa.analytics.windowLabel", { window: t(WINDOW_OPTIONS.find((w) => w.value === window)?.label ?? "common.entireHistory") })}
        rows={(() => {
          if (!kpiPopup || !data) return [];
          if (kpiPopup === "close_rate") {
            return [
              { primary: t("agencyQa.analytics.totalAnalyses"), right: String(data.total_calls) },
              { primary: t("agencyQa.analytics.closesRow"), right: String(data.cerro), rightTone: "success" as const },
              { primary: "Close rate", right: formatPct(data.close_rate), rightTone: "default" as const },
            ];
          }
          if (kpiPopup === "score") {
            return [
              { primary: t("agencyQa.avgScore"), right: String(data.avg_score), rightTone: data.avg_score >= 70 ? "success" as const : "warning" as const },
              { primary: t("agencyQa.analytics.included"), right: String(data.total_calls) },
            ];
          }
          if (kpiPopup === "closers") {
            const top = (data as any).top_closers ?? [];
            return top.map((c: any): KpiRow => ({
              primary: c.name ?? c.closer_name ?? t("agencyQa.noNameBare"),
              secondary: c.calls !== undefined ? t("agencyQa.analytics.nAnalyses", { n: c.calls }) : undefined,
              right: c.score !== undefined ? String(c.score) : undefined,
            }));
          }
          if (kpiPopup === "totales") {
            return [
              { primary: t("agencyQa.analytics.totalAnalyses"), right: String(data.total_calls), rightTone: "default" as const },
              { primary: t("agencyQa.analytics.closesRow"), right: String(data.cerro), rightTone: "success" as const },
              { primary: t("agencyQa.analytics.activeClosers"), right: String(data.active_closers) },
              { primary: t("agencyQa.analytics.modelsWithCallsRow"), right: String(data.active_models) },
              { primary: t("agencyQa.avgScore"), right: String(data.avg_score) },
            ];
          }
          return [];
        })()}
      />
    </div>
  );
};

export default AgencyAnalytics;
