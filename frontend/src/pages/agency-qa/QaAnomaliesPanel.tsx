import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Activity, Hourglass, Timer, CheckCircle2, ShieldAlert } from "lucide-react";
import { useQaAnomalies, type QaRole, type AnomalyTipo } from "./useQaHubstaff";
import { useHubstaffSyncStatus } from "./chatters-qa/useHubstaffEffort";
import { periodLabel } from "./chatters-qa/useChatterScorecards";

// Panel GENÉRICO de Anomalías de actividad — idéntico para los 4 QA por rol.
// baja_actividad solo aplica a roles de escritorio (chatter/LLG); closers/managers están en
// llamadas, así que la vista no les genera ese flag.

const TIPO_META: Record<AnomalyTipo, { label: string; tone: string; icon: any }> = {
  baja_actividad: { label: "Online inactivo", tone: "bg-destructive/15 text-destructive",  icon: Activity },
  dia_corto:      { label: "Jornada corta",   tone: "bg-warning/15 text-warning", icon: Hourglass },
  dia_largo:      { label: "Jornada larga",   tone: "bg-primary/15 text-primary",     icon: Timer },
};

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const detalle = (tipo: AnomalyTipo, hours: number, act: number) => {
  if (tipo === "baja_actividad") return `${hours}h trabajadas · ${act}% actividad`;
  if (tipo === "dia_largo") return `${hours}h (revisar tiempo manual)`;
  return hours < 0.1 ? "casi sin tiempo registrado" : `solo ${hours}h trabajadas`;
};

export default function QaAnomaliesPanel({ role }: { role: QaRole }) {
  const { data: rows = [], isLoading } = useQaAnomalies(role);
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const byTipo: Record<string, number> = {};
    for (const r of rows) byTipo[r.tipo] = (byTipo[r.tipo] ?? 0) + 1;
    return { total: rows.length, byTipo, period: rows[0].period };
  }, [rows]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando anomalías…</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" /> Sin anomalías de actividad en el período. 👌
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert className="h-4 w-4 text-warning" /> Anomalías de actividad
          </h3>
          <p className="text-sm text-muted-foreground">
            Días que merecen una mirada — {stats && periodLabel(stats.period)}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={AlertTriangle} label="Días anómalos" value={String(stats.total)} tone="warn" />
          <StatCard icon={Activity} label="Online inactivo" value={String(stats.byTipo["baja_actividad"] ?? 0)}
            tone={stats.byTipo["baja_actividad"] ? "bad" : "ok"} />
          <StatCard icon={Hourglass} label="Jornadas cortas" value={String(stats.byTipo["dia_corto"] ?? 0)}
            tone={stats.byTipo["dia_corto"] ? "warn" : "ok"} />
          <StatCard icon={Timer} label="Jornadas largas" value={String(stats.byTipo["dia_largo"] ?? 0)} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Persona</th>
                  <th className="px-3 py-3 text-left font-semibold">Día</th>
                  <th className="px-3 py-3 text-left font-semibold">Anomalía</th>
                  <th className="px-4 py-3 text-left font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const meta = TIPO_META[r.tipo];
                  const Icon = meta.icon;
                  return (
                    <tr key={`${r.hubstaff_user_id}-${r.date}-${i}`} className="border-b border-border/60">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{dayLabel(r.date)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{detalle(r.tipo, r.hours, r.act)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        <strong>Jornada corta</strong> = &lt;2.5h trabajadas (apareció poco). <strong>Jornada larga</strong> = &gt;12h.
        <strong> Online inactivo</strong> (≥2h con &lt;35% actividad) solo aplica a roles de escritorio; en llamadas (closers/managers) no se mide.
        Señales para revisar/coachear, no sanciones automáticas.
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
