import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Activity, Hourglass, Timer, CheckCircle2, ShieldAlert } from "lucide-react";
import { useQaAnomalies, type QaRole, type AnomalyTipo } from "./useQaHubstaff";
import { useHubstaffSyncStatus } from "./chatters-qa/useHubstaffEffort";
import { periodLabel } from "./chatters-qa/useChatterScorecards";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";
import type { Language, TranslationKey } from "@/lib/i18n";
import { haceCuanto } from "./haceCuanto";

// Panel GENÉRICO de Anomalías de actividad — idéntico para los 4 QA por rol.
// baja_actividad solo aplica a roles de escritorio (chatter/LLG); closers/managers están en
// llamadas, así que la vista no les genera ese flag.

// La clave (baja_actividad / dia_corto / dia_largo) es el `tipo` que devuelve la vista: dato.
const TIPO_META: Record<AnomalyTipo, { labelKey: TranslationKey; tone: string; icon: any }> = {
  baja_actividad: { labelKey: "agencyQa.anomaly.lowActivity", tone: "bg-destructive/15 text-destructive",  icon: Activity },
  dia_corto:      { labelKey: "agencyQa.anomaly.shortDay",    tone: "bg-warning/15 text-warning", icon: Hourglass },
  dia_largo:      { labelKey: "agencyQa.anomaly.longDay",     tone: "bg-primary/15 text-primary",     icon: Timer },
};

// dd/mm en español, mm/dd en inglés.
const dayLabel = (iso: string, lang: Language) => {
  const [, m, d] = iso.split("-");
  return lang === "en" ? `${m}/${d}` : `${d}/${m}`;
};

const detalle = (t: (k: TranslationKey, p?: Record<string, string | number>) => string, tipo: AnomalyTipo, hours: number, act: number) => {
  if (tipo === "baja_actividad") return t("agencyQa.anomaly.detailLow", { hours, act });
  if (tipo === "dia_largo") return t("agencyQa.anomaly.detailLong", { hours });
  return hours < 0.1 ? t("agencyQa.anomaly.detailNone") : t("agencyQa.anomaly.detailShort", { hours });
};

export default function QaAnomaliesPanel({ role }: { role: QaRole }) {
  const { t, language } = useLanguage();
  const { data: rows = [], isLoading } = useQaAnomalies(role);
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const byTipo: Record<string, number> = {};
    for (const r of rows) byTipo[r.tipo] = (byTipo[r.tipo] ?? 0) + 1;
    return { total: rows.length, byTipo, period: rows[0].period };
  }, [rows]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("agencyQa.anomaly.loading")}</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" /> {t("agencyQa.anomaly.empty")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert className="h-4 w-4 text-warning" /> {t("agencyQa.anomaly.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("agencyQa.anomaly.subtitle", { period: stats ? periodLabel(stats.period, language) : "" })}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{t("agencyQa.sync.synced", { when: haceCuanto(sync?.last_sync_at ?? null, t) })}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={AlertTriangle} label={t("agencyQa.anomaly.days")} value={String(stats.total)} tone="warn" />
          <StatCard icon={Activity} label={t("agencyQa.anomaly.lowActivity")} value={String(stats.byTipo["baja_actividad"] ?? 0)}
            tone={stats.byTipo["baja_actividad"] ? "bad" : "ok"} />
          <StatCard icon={Hourglass} label={t("agencyQa.anomaly.shortDays")} value={String(stats.byTipo["dia_corto"] ?? 0)}
            tone={stats.byTipo["dia_corto"] ? "warn" : "ok"} />
          <StatCard icon={Timer} label={t("agencyQa.anomaly.longDays")} value={String(stats.byTipo["dia_largo"] ?? 0)} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">{t("agencyQa.person")}</th>
                  <th className="px-3 py-3 text-left font-semibold">{t("common.day")}</th>
                  <th className="px-3 py-3 text-left font-semibold">{t("agencyQa.anomaly.col")}</th>
                  <th className="px-4 py-3 text-left font-semibold">{t("agencyQa.anomaly.detail")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const meta = TIPO_META[r.tipo];
                  const Icon = meta.icon;
                  return (
                    <tr key={`${r.hubstaff_user_id}-${r.date}-${i}`} className="border-b border-border/60">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{dayLabel(r.date, language)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                          <Icon className="h-3 w-3" /> {t(meta.labelKey)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{detalle(t, r.tipo, r.hours, r.act)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        <ConFormato texto={t("agencyQa.anomaly.footnote")} />
      </p>
    </div>
  );
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
