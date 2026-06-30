import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, TrendingUp, AlertTriangle, Activity, DollarSign, Timer } from "lucide-react";
import { useHubstaffEffort, useHubstaffSyncStatus } from "./useHubstaffEffort";
import { periodLabel } from "./useChatterScorecards";

// Subtab "Hubstaff" de Chatters QA. Antes era un ComingSoon; ahora muestra el cruce
// ESFUERZO (Hubstaff: horas + % actividad) × RESULTADO (BLU: ventas + tiempo de respuesta).
// El insight: actividad% sola no es productividad — cruzándola con la venta se ve quién está
// "online pero improductivo". Los datos vienen del micro hubstaff-bridge (cada 6h).

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

const money = (n: number) => "$" + n.toLocaleString("en-US");

export default function ChattersQaHubstaff() {
  const { data: rows = [], isLoading } = useHubstaffEffort();
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const flagged = rows.filter((r) => r.online_improductivo).length;
    const avgAct = Math.round(rows.reduce((s, r) => s + (r.avg_activity_pct ?? 0), 0) / rows.length);
    const totalHours = Math.round(rows.reduce((s, r) => s + (r.total_hours ?? 0), 0));
    return { chatters: rows.length, flagged, avgAct, totalHours, period: rows[0].period };
  }, [rows]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando datos de Hubstaff…</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Clock className="h-4 w-4" /> Hubstaff</div>
          Todavía no hay datos de actividad cruzados con ventas. El micro <code>hubstaff-bridge</code> sincroniza cada 6h;
          los chatters aparecen acá cuando su email de Hubstaff coincide con el de BLU.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + estado del sync */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" /> Esfuerzo vs Resultado
          </h3>
          <p className="text-sm text-muted-foreground">
            Horas y actividad de Hubstaff cruzadas con la venta de BLU — {stats && periodLabel(stats.period)}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {/* Cards resumen */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Clock} label="Chatters" value={String(stats.chatters)} />
          <StatCard icon={Activity} label="Actividad prom." value={`${stats.avgAct}%`} />
          <StatCard icon={Timer} label="Horas totales" value={`${stats.totalHours}h`} />
          <StatCard icon={AlertTriangle} label="A revisar" value={String(stats.flagged)} tone={stats.flagged ? "warn" : "ok"} />
        </div>
      )}

      {/* Tabla esfuerzo-vs-resultado */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Chatter</th>
                  <th className="px-3 py-3 text-right font-semibold">Horas</th>
                  <th className="px-3 py-3 text-right font-semibold">Actividad</th>
                  <th className="px-3 py-3 text-right font-semibold"><DollarSign className="inline h-3 w-3" />/hora</th>
                  <th className="px-3 py-3 text-right font-semibold">Ventas</th>
                  <th className="px-3 py-3 text-right font-semibold">Resp.</th>
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sph = r.sales_per_hour ?? 0;
                  const sphTone = sph >= 60 ? "text-emerald-500" : sph >= 20 ? "text-foreground" : "text-amber-500";
                  return (
                    <tr key={r.blu_employee_id} className={`border-b border-border/60 ${r.online_improductivo ? "bg-amber-500/5" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.total_hours}h</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.avg_activity_pct}%</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${sphTone}`}>{money(sph)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.sales)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.avg_response_min != null ? `${r.avg_response_min}m` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.online_improductivo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> online, poca venta
                          </span>
                        ) : sph >= 60 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
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
      <p className="px-1 text-[11px] text-muted-foreground">
        🚩 "online, poca venta" = bastante esfuerzo (≥25h y ≥50% actividad) pero baja venta por hora — candidato a coaching.
        Las notas de Puntualidad y Productividad del scorecard salen de estos mismos datos.
      </p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`rounded-lg p-2 ${tone === "warn" ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
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
