import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock, Users } from "lucide-react";
import { useQaEffort, type QaRole } from "./useQaHubstaff";
import { useHubstaffSyncStatus } from "./chatters-qa/useHubstaffEffort";
import { periodLabel } from "./chatters-qa/useChatterScorecards";

// Panel de Productividad "solo esfuerzo" (horas/actividad/días) — para roles SIN fuente de
// resultado poblada (managers). La actividad% es contexto (gran parte del trabajo de un manager
// es en reuniones/llamadas, no tecleando), no un veredicto.

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

export default function QaEffortPanel({ role }: { role: QaRole }) {
  const { data: rows = [], isLoading } = useQaEffort(role);
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    return {
      count: rows.length,
      totalHours: Math.round(rows.reduce((s, r) => s + (r.total_hours ?? 0), 0)),
      avgAct: Math.round(rows.reduce((s, r) => s + (r.avg_activity_pct ?? 0), 0) / rows.length),
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
          <div className="flex items-center gap-2 font-medium text-foreground"><Clock className="h-4 w-4" /> Productividad</div>
          Todavía no hay actividad de Hubstaff para este rol. El micro <code>hubstaff-bridge</code> sincroniza cada 6h.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" /> Productividad · esfuerzo
          </h3>
          <p className="text-sm text-muted-foreground">
            Horas trabajadas y actividad de Hubstaff — {stats && periodLabel(stats.period)}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Users} label="Personas" value={String(stats.count)} />
          <StatCard icon={Clock} label="Horas totales" value={`${stats.totalHours}h`} />
          <StatCard icon={Activity} label="Actividad prom." value={`${stats.avgAct}%`} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Persona</th>
                  <th className="px-3 py-3 text-right font-semibold">Días</th>
                  <th className="px-3 py-3 text-right font-semibold">Horas</th>
                  <th className="px-4 py-3 text-right font-semibold">Actividad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hubstaff_user_id} className="border-b border-border/60">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.dias}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.total_hours}h</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.avg_activity_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Solo esfuerzo (horas + actividad): para este rol todavía no hay una fuente de resultado en Maven para cruzar.
        La actividad% es contexto (mucho trabajo es en reuniones/llamadas), no un veredicto.
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
