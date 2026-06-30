import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, CalendarClock, AlertTriangle, Users, CheckCircle2, LogIn } from "lucide-react";
import { useQaAttendance, type QaRole } from "./useQaHubstaff";
import { useHubstaffSyncStatus } from "./chatters-qa/useHubstaffEffort";
import { periodLabel } from "./chatters-qa/useChatterScorecards";

// Panel GENÉRICO de Asistencia (check-in + puntualidad) — idéntico para los 4 QA por rol.
// Deriva el turno de la 1ª actividad de Hubstaff (vista v_qa_attendance, management-only).
// Tolerancia 10 min = a tiempo (llegar antes cuenta a tiempo).

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

const hhmm = (min: number | null | undefined) => {
  if (min == null) return "—";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default function QaAttendancePanel({ role }: { role: QaRole }) {
  const { data: rows = [], isLoading } = useQaAttendance(role);
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const avgPunct = Math.round(rows.reduce((s, r) => s + (r.pct_a_tiempo ?? 0), 0) / rows.length);
    const totalTard = rows.reduce((s, r) => s + (r.tardanzas ?? 0), 0);
    const aRevisar = rows.filter((r) => (r.pct_a_tiempo ?? 100) < 80).length;
    return { count: rows.length, avgPunct, totalTard, aRevisar, period: rows[0].period };
  }, [rows]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando asistencia…</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><CalendarClock className="h-4 w-4" /> Asistencia</div>
          Todavía no hay datos de asistencia para este rol. El micro <code>hubstaff-bridge</code> sincroniza la 1ª actividad del día cada 6h.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="h-4 w-4 text-emerald-500" /> Asistencia · check-in y puntualidad
          </h3>
          <p className="text-sm text-muted-foreground">
            Hora de entrada (1ª actividad) vs turno deducido — {stats && periodLabel(stats.period)}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Users} label="Personas" value={String(stats.count)} />
          <StatCard icon={CheckCircle2} label="Puntualidad prom." value={`${stats.avgPunct}%`}
            tone={stats.avgPunct >= 90 ? "ok" : stats.avgPunct >= 75 ? "warn" : "bad"} />
          <StatCard icon={Clock} label="Tardanzas (total)" value={String(stats.totalTard)}
            tone={stats.totalTard ? "warn" : "ok"} />
          <StatCard icon={AlertTriangle} label="A revisar" value={String(stats.aRevisar)}
            tone={stats.aRevisar ? "bad" : "ok"} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Persona</th>
                  <th className="px-3 py-3 text-left font-semibold">Turno</th>
                  <th className="px-3 py-3 text-right font-semibold">Días</th>
                  <th className="px-3 py-3 text-right font-semibold"><LogIn className="inline h-3 w-3" /> Entrada</th>
                  <th className="px-3 py-3 text-right font-semibold">A tiempo</th>
                  <th className="px-3 py-3 text-right font-semibold">Tardanzas</th>
                  <th className="px-3 py-3 text-right font-semibold">Retraso prom.</th>
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.pct_a_tiempo ?? 0;
                  const smallSample = (r.dias ?? 0) < 4;
                  const pctTone = pct >= 90 ? "text-emerald-500" : pct >= 80 ? "text-amber-500" : "text-rose-500";
                  const rowTint = pct < 80 ? "bg-rose-500/5" : "";
                  return (
                    <tr key={r.hubstaff_user_id} className={`border-b border-border/60 ${rowTint}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.turno ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.dias}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{hhmm(r.checkin_prom_min)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${pctTone}`}>{pct}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.tardanzas || "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.min_tarde_prom != null ? `+${r.min_tarde_prom}m` : "—"}
                      </td>
                      <td className="px-4 py-2.5">{statusPill(pct, smallSample)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        El <strong>turno</strong> se deduce de los horarios de inicio (mañana 8–4, tarde 4–12, madrugada 12–8).
        "A tiempo" = arrancó dentro de <strong>10 min</strong> del inicio de su turno (llegar antes cuenta a tiempo).
        Muestras &lt;4 días = "pocos datos" — el % se afina con el mes.
      </p>
    </div>
  );
}

function statusPill(pct: number, smallSample: boolean) {
  if (smallSample) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">pocos datos</span>;
  }
  if (pct < 80) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-600">
        <AlertTriangle className="h-3 w-3" /> impuntual
      </span>
    );
  }
  if (pct >= 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> puntual
      </span>
    );
  }
  return <span className="text-[11px] text-muted-foreground">—</span>;
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const toneCls =
    tone === "warn" ? "bg-amber-500/15 text-amber-600"
    : tone === "bad" ? "bg-rose-500/15 text-rose-600"
    : "bg-muted text-muted-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`rounded-lg p-2 ${toneCls}`}><Icon className="h-4 w-4" /></div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-bold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
