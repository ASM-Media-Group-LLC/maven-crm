import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CalendarClock, AlertTriangle, Users, CheckCircle2, LogIn, CalendarCheck2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useHrAttendance, HR_ROLE_LABEL } from "./useHrAttendance";
import { useHubstaffSyncStatus } from "@/pages/agency-qa/chatters-qa/useHubstaffEffort";
import { periodLabel } from "@/pages/agency-qa/chatters-qa/useChatterScorecards";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { periodoDelMes, TURNO_ASISTENCIA } from "./etiquetasRrhh";
import { idiomaFuente } from "@/lib/idiomas";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Panel de Asistencia automática (RRHH) — TODO el personal trackeado en Hubstaff,
// derivado de v_qa_attendance. Check-in (1ª actividad) vs horario cargado/turno deducido.
// Tolerancia 10 min = a tiempo. Filtro por rol porque acá conviven todos los roles.

const relativeTime = (iso: string | null, t: T): string => {
  if (!iso) return t("hr.att.neverSynced");
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("hr.att.justNow");
  if (min < 60) return t("hr.att.minAgo", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("hr.att.hoursAgo", { n: h });
  return t("hr.att.daysAgo", { n: Math.floor(h / 24) });
};

const hhmm = (min: number | null | undefined) => {
  if (min == null) return "—";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default function HrAttendanceAuto() {
  const { t, language } = useLanguage();
  const { data: rows = [], isLoading } = useHrAttendance();
  const { data: sync } = useHubstaffSyncStatus();
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const roles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.role).filter(Boolean))).sort(),
    [rows],
  );
  const filtered = useMemo(
    () => (roleFilter === "all" ? rows : rows.filter((r) => r.role === roleFilter)),
    [rows, roleFilter],
  );

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const avgPunct = Math.round(filtered.reduce((s, r) => s + (r.pct_a_tiempo ?? 0), 0) / filtered.length);
    const totalTard = filtered.reduce((s, r) => s + (r.tardanzas ?? 0), 0);
    const aRevisar = filtered.filter((r) => (r.pct_a_tiempo ?? 100) < 80).length;
    return { count: filtered.length, avgPunct, totalTard, aRevisar, period: filtered[0].period };
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><CalendarClock className="h-4 w-4" /> {t("hr.att.autoTitle")}</div>
          {t("hr.att.emptyA")} <code>hubstaff-bridge</code> {t("hr.att.emptyB")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4 text-success" /> {t("hr.att.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("hr.att.subtitle", { period: stats ? periodoDelMes(stats.period, idiomaFuente(language), periodLabel) : "" })}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{t("hr.att.synced", { when: relativeTime(sync?.last_sync_at ?? null, t) })}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label={t("hr.att.people")} value={String(stats.count)} />
          <StatCard icon={CheckCircle2} label={t("hr.att.avgPunctuality")} value={`${stats.avgPunct}%`}
            tone={stats.avgPunct >= 90 ? "ok" : stats.avgPunct >= 75 ? "warn" : "bad"} />
          <StatCard icon={Clock} label={t("hr.att.lateTotal")} value={String(stats.totalTard)}
            tone={stats.totalTard ? "warn" : "ok"} />
          <StatCard icon={AlertTriangle} label={t("hr.att.toReview")} value={String(stats.aRevisar)}
            tone={stats.aRevisar ? "bad" : "ok"} />
        </div>
      )}

      {roles.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {["all", ...roles].map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] ${roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {r === "all" ? t("common.all") : (HR_ROLE_LABEL[r] ?? r)}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">{t("hr.att.person")}</th>
                  <th className="px-3 py-3 text-left font-semibold">{t("common.role")}</th>
                  <th className="px-3 py-3 text-left font-semibold">{t("hr.card.shift")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("common.days")}</th>
                  <th className="px-3 py-3 text-right font-semibold"><LogIn className="inline h-3 w-3" /> {t("hr.att.checkIn")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("hr.card.onTime")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("hr.card.lateArrivals")}</th>
                  <th className="px-3 py-3 text-right font-semibold">{t("hr.att.avgDelay")}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pct = r.pct_a_tiempo ?? 0;
                  const smallSample = (r.dias ?? 0) < 4;
                  const pctTone = pct >= 90 ? "text-success" : pct >= 80 ? "text-warning" : "text-destructive";
                  const rowTint = pct < 80 ? "bg-destructive/5" : "";
                  return (
                    <tr key={r.hubstaff_user_id} className={`border-b border-border/60 ${rowTint}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{HR_ROLE_LABEL[r.role] ?? r.role}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {r.turno && TURNO_ASISTENCIA[r.turno] ? t(TURNO_ASISTENCIA[r.turno]) : (r.turno ?? "—")}
                          {r.horario_cargado && <CalendarCheck2 className="h-3 w-3 text-success" aria-label={t("hr.att.scheduleLoaded")} />}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.dias}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{hhmm(r.checkin_prom_min)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${pctTone}`}>{pct}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.tardanzas || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.min_tarde_prom != null ? `+${r.min_tarde_prom}m` : "—"}
                      </td>
                      <td className="px-4 py-2.5">{statusPill(pct, smallSample, t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {t("hr.att.legendA")} <CalendarCheck2 className="inline h-3 w-3 text-success" /> {t("hr.att.legendB")} <strong>{t("hr.att.legendLoaded")}</strong>
        {" "}{t("hr.att.legendC")} <em>{t("hr.staffSched.title")}</em>{t("hr.att.legendD")}
        {" "}{t("hr.att.legendE")} <strong>{t("hr.att.legendTenMin")}</strong> {t("hr.att.legendF")}
      </p>
    </div>
  );
}

function statusPill(pct: number, smallSample: boolean, t: T) {
  if (smallSample) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("hr.att.fewData")}</span>;
  }
  if (pct < 80) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" /> {t("hr.att.unpunctual")}
      </span>
    );
  }
  if (pct >= 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
        <CheckCircle2 className="h-3 w-3" /> {t("hr.att.punctual")}
      </span>
    );
  }
  return <span className="text-[11px] text-muted-foreground">—</span>;
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const toneCls =
    tone === "warn" ? "bg-warning/15 text-warning"
    : tone === "bad" ? "bg-destructive/15 text-destructive"
    : "bg-muted text-muted-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`rounded-lg p-2 ${toneCls}`}><Icon className="h-4 w-4" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
