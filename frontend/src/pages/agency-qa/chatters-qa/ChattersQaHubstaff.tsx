import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, TrendingUp, AlertTriangle, Activity, DollarSign, Wallet, Scale } from "lucide-react";
import { useHubstaffEffort, useHubstaffSyncStatus } from "./useHubstaffEffort";
import { periodLabel } from "./useChatterScorecards";

// Subtab "Hubstaff" de Chatters QA. Cruza ESFUERZO (Hubstaff: horas + % actividad) ×
// RESULTADO (BLU: ventas) y, para management, la RENTABILIDAD: ingreso de la agencia
// (venta × 80% neto OF × % efectivo firmado) vs el costo del chatter (salario base).
// Datos del micro hubstaff-bridge (cada 6h). Costo/ROI solo visible para management
// (la vista oculta esas columnas al resto vía RLS de chatter_cost_config).

const relativeTime = (iso: string | null): string => {
  if (!iso) return "sin sincronizar";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
};

const money = (n: number | null | undefined) =>
  (n != null && n < 0 ? "-$" : "$") + Math.abs(Math.round(n ?? 0)).toLocaleString("en-US");

export default function ChattersQaHubstaff() {
  const { data: rows = [], isLoading } = useHubstaffEffort();
  const { data: sync } = useHubstaffSyncStatus();

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const flaggedEffort = rows.filter((r) => r.online_improductivo).length;
    const avgAct = Math.round(rows.reduce((s, r) => s + (r.avg_activity_pct ?? 0), 0) / rows.length);
    const totalHours = Math.round(rows.reduce((s, r) => s + (r.total_hours ?? 0), 0));
    // Finanzas (solo si la vista devolvió costo → management).
    const hasCost = rows.some((r) => r.cost_usd != null);
    const totalCost = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    const totalAgencyRev = rows.reduce((s, r) => s + (r.agency_revenue_usd ?? 0), 0);
    const totalMargin = rows.reduce((s, r) => s + (r.margin_usd ?? 0), 0);
    const noRentables = rows.filter((r) => r.no_rentable).length;
    const costPer = rows.find((r) => r.cost_usd != null)?.cost_usd ?? null;
    const rate = rows.find((r) => r.agency_rate_used != null)?.agency_rate_used ?? null;
    return {
      chatters: rows.length, flaggedEffort, avgAct, totalHours, period: rows[0].period,
      hasCost, totalCost, totalAgencyRev, totalMargin, noRentables, costPer, rate,
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
            <Activity className="h-4 w-4 text-emerald-500" /> Esfuerzo · Resultado · Rentabilidad
          </h3>
          <p className="text-sm text-muted-foreground">
            {stats?.chatters} chatters · {stats?.avgAct}% actividad prom. · {stats?.totalHours}h · {stats?.flaggedEffort} online improductivos — {stats && periodLabel(stats.period)}.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
      </div>

      {/* Cards de rentabilidad (solo management). */}
      {stats?.hasCost && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Scale} label="Margen neto equipo" value={money(stats.totalMargin)}
            tone={stats.totalMargin >= 0 ? "ok" : "bad"} />
          <StatCard icon={DollarSign} label="Ingreso agencia" value={money(stats.totalAgencyRev)} />
          <StatCard icon={Wallet} label="Costo equipo" value={money(stats.totalCost)} />
          <StatCard icon={AlertTriangle} label="No rentables" value={`${stats.noRentables}/${stats.chatters}`}
            tone={stats.noRentables ? "warn" : "ok"} />
        </div>
      )}

      {/* Tabla esfuerzo-vs-resultado-vs-rentabilidad */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Chatter</th>
                  <th className="px-3 py-3 text-right font-semibold">Horas</th>
                  <th className="px-3 py-3 text-right font-semibold">Activ.</th>
                  <th className="px-3 py-3 text-right font-semibold">Venta</th>
                  {stats?.hasCost && <th className="px-3 py-3 text-right font-semibold">Ing. agencia</th>}
                  {stats?.hasCost && <th className="px-3 py-3 text-right font-semibold">Margen</th>}
                  {stats?.hasCost && <th className="px-3 py-3 text-right font-semibold">ROI</th>}
                  <th className="px-3 py-3 text-right font-semibold">Resp.</th>
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const roi = r.roi_x ?? null;
                  const margin = r.margin_usd ?? 0;
                  const rowTint = r.no_rentable ? "bg-rose-500/5" : r.online_improductivo ? "bg-amber-500/5" : "";
                  return (
                    <tr key={r.blu_employee_id} className={`border-b border-border/60 ${rowTint}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.total_hours}h</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.avg_activity_pct}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.sales)}</td>
                      {stats?.hasCost && (
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(r.agency_revenue_usd)}</td>
                      )}
                      {stats?.hasCost && (
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${margin >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {money(margin)}
                        </td>
                      )}
                      {stats?.hasCost && (
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${roi == null ? "text-muted-foreground" : roi >= 1 ? "text-emerald-500" : "text-rose-500"}`}>
                          {roi == null ? "—" : `${roi.toFixed(2)}×`}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.avg_response_min != null ? `${r.avg_response_min}m` : "—"}
                      </td>
                      <td className="px-4 py-2.5">{statusPill(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {stats?.hasCost ? (
          <>
            <strong>Ingreso agencia</strong> = venta bruta × 80% (neto OF) × {stats.rate}% (comisión efectiva ponderada).
            <strong> Costo</strong> = {money(stats.costPer)}/mes por chatter (salario base, <em>sin comisión</em>) @ tipo de cambio en vivo.
            ROI &lt; 1 (rojo) = la agencia recibe menos de lo que cuesta el chatter ese mes. Las filas en $0 pueden incluir gaps de match BLU↔Hubstaff → revisar antes de concluir.
          </>
        ) : (
          <>🚩 "online, poca venta" = ≥25h y ≥50% actividad pero baja venta. Las notas de Puntualidad y Productividad del scorecard salen de estos mismos datos.</>
        )}
      </p>
    </div>
  );
}

function statusPill(r: { no_rentable: boolean | null; online_improductivo: boolean; roi_x: number | null }) {
  if (r.no_rentable) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-600">
        <AlertTriangle className="h-3 w-3" /> no rentable
      </span>
    );
  }
  if (r.online_improductivo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600">
        <AlertTriangle className="h-3 w-3" /> online, poca venta
      </span>
    );
  }
  if ((r.roi_x ?? 0) >= 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" /> rinde
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
