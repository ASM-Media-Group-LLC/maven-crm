import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, DollarSign, Users, AlertTriangle, TrendingUp, Phone, Clock } from "lucide-react";
import { useCloserHubstaff } from "./useCloserHubstaff";
import { useHubstaffSyncStatus } from "./chatters-qa/useHubstaffEffort";
import { periodLabel } from "./chatters-qa/useChatterScorecards";

// Subtab "Hubstaff" de Closers QA. Esfuerzo (horas de Hubstaff) × Cierre (pipeline + QA de llamadas).
// La actividad% de un closer es baja por naturaleza (está en llamadas) → contexto, no veredicto.

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

const money = (n: number | null | undefined) => "$" + Math.round(n ?? 0).toLocaleString("en-US");

export default function AgencyCloserHubstaff() {
  const { data: rows = [], isLoading } = useCloserHubstaff();
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    return {
      closers: rows.length,
      totalHours: Math.round(rows.reduce((s, r) => s + (r.total_hours ?? 0), 0)),
      totalMonet: rows.reduce((s, r) => s + (r.monetizacion_usd ?? 0), 0),
      sinCierres: rows.filter((r) => r.sin_cierres).length,
      period: rows[0].period,
    };
  }, [rows]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando datos de Hubstaff…</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Clock className="h-4 w-4" /> Hubstaff</div>
          Todavía no hay actividad de closers cruzada con el pipeline. El micro <code>hubstaff-bridge</code> sincroniza cada 6h.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" /> Esfuerzo vs Cierre
          </h3>
          <p className="text-sm text-muted-foreground">
            Horas de Hubstaff cruzadas con el pipeline y la QA de llamadas — {stats && periodLabel(stats.period)}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="Closers" value={String(stats.closers)} />
          <StatCard icon={Clock} label="Horas totales" value={`${stats.totalHours}h`} />
          <StatCard icon={DollarSign} label="Monetización" value={money(stats.totalMonet)} />
          <StatCard icon={AlertTriangle} label="Sin cierres" value={String(stats.sinCierres)}
            tone={stats.sinCierres ? "warn" : "ok"} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Closer</th>
                  <th className="px-3 py-3 text-right font-semibold">Horas</th>
                  <th className="px-3 py-3 text-right font-semibold">Activ.</th>
                  <th className="px-3 py-3 text-right font-semibold">Leads</th>
                  <th className="px-3 py-3 text-right font-semibold">Cerradas</th>
                  <th className="px-3 py-3 text-right font-semibold">Monetización</th>
                  <th className="px-3 py-3 text-right font-semibold"><DollarSign className="inline h-3 w-3" />/hora</th>
                  <th className="px-3 py-3 text-right font-semibold"><Phone className="inline h-3 w-3" /> QA</th>
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const uph = r.usd_por_hora ?? 0;
                  const uphTone = uph >= 50 ? "text-success" : uph > 0 ? "text-foreground" : "text-muted-foreground";
                  return (
                    <tr key={r.name} className={`border-b border-border/60 ${r.sin_cierres ? "bg-warning/5" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.total_hours}h</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.avg_activity_pct}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.leads}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.cerradas}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(r.monetizacion_usd)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${uphTone}`}>{money(uph)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.qa_calls ? `${r.qa_calls} · ${r.avg_qa_score ?? "—"}` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.sin_cierres ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                            <AlertTriangle className="h-3 w-3" /> trabaja, no cierra
                          </span>
                        ) : r.cerradas > 0 && uph >= 50 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                            <TrendingUp className="h-3 w-3" /> rinde
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
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
        <strong>Actividad%</strong> en closers suele ser baja porque están en llamadas (hablan, no teclean) — es contexto, no se castiga.
        <strong> Monetización</strong> y <strong>cerradas</strong> salen del pipeline actual (Confirmada/Completada); <strong>QA</strong> = nº de llamadas analizadas · score promedio.
        "Trabaja, no cierra" = ≥20h sin cierres en el pipeline → revisar.
      </p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`rounded-lg p-2 ${tone === "warn" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-bold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
