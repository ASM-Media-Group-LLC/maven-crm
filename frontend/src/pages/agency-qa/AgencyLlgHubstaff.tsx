import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock, Users, Sparkles, TrendingUp } from "lucide-react";
import { useLlgHubstaff } from "./useQaHubstaff";
import { useHubstaffSyncStatus } from "./chatters-qa/useHubstaffEffort";
import { periodLabel } from "./chatters-qa/useChatterScorecards";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";
import { haceCuanto } from "./haceCuanto";

// Productividad de LLG (lead gen): esfuerzo (horas/actividad de Hubstaff) × resultado (leads
// generados, leadgen_entries del mes). Análogo a esfuerzo-vs-resultado de chatters/closers.

const n = (v: number | null | undefined) => Math.round(v ?? 0).toLocaleString("en-US");

export default function AgencyLlgHubstaff() {
  const { t, language } = useLanguage();
  const { data: rows = [], isLoading } = useLlgHubstaff();
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    return {
      count: rows.length,
      totalHours: Math.round(rows.reduce((s, r) => s + (r.total_hours ?? 0), 0)),
      totalLeads: rows.reduce((s, r) => s + (r.leads ?? 0), 0),
      period: rows[0].period,
    };
  }, [rows]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("agencyQa.hubstaff.loading")}</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Clock className="h-4 w-4" /> {t("agencyQa.tab.productivity")}</div>
          <ConFormato texto={t("agencyQa.llg.empty")} piezas={{ code: <code>hubstaff-bridge</code> }} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" /> {t("agencyQa.llg.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("agencyQa.llg.subtitle", { period: stats ? periodLabel(stats.period, language) : "" })}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{t("agencyQa.sync.synced", { when: haceCuanto(sync?.last_sync_at ?? null, t) })}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Users} label="LLGs" value={String(stats.count)} />
          <StatCard icon={Clock} label={t("common.totalHours")} value={`${stats.totalHours}h`} />
          <StatCard icon={Sparkles} label={t("agencyQa.llg.leadsGenerated")} value={n(stats.totalLeads)} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">LLG</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("common.days")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("common.hours")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("agencyQa.activityShort")}</th>
                  <th className="px-3 py-3 text-right font-semibold"><Sparkles className="inline h-3 w-3" /> Leads</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("agencyQa.llg.leadsPerHour")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lph = r.leads_por_hora ?? 0;
                  const lphTone = lph >= 20 ? "text-success" : lph > 0 ? "text-foreground" : "text-muted-foreground";
                  return (
                    <tr key={r.name} className="border-b border-border/60">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.dias}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.total_hours}h</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.avg_activity_pct}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{n(r.leads)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${lphTone}`}>
                        {lph > 0 ? <><TrendingUp className="inline h-3 w-3" /> {r.leads_por_hora}</> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        <ConFormato texto={t("agencyQa.llg.footnote")} />
      </p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground"><Icon className="h-4 w-4" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
