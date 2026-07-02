import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, TrendingUp, AlertTriangle, Activity, DollarSign, Wallet, Scale, Info } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useHubstaffEffort, useHubstaffSyncStatus, useChatterEffortRange, useChatterSalesRange } from "./useHubstaffEffort";
import { periodLabel } from "./useChatterScorecards";

// Subtab "Productividad" de Chatters QA. Cruza ESFUERZO (Hubstaff: horas + % actividad) ×
// RESULTADO (BLU: ventas) y, para management, la RENTABILIDAD: ingreso de la agencia
// (venta × 80% neto OF × % efectivo firmado) vs el costo del chatter (salario base).
// El "calendario de movimiento" (rango de fechas) re-agrega el ESFUERZO por día desde
// hubstaff_daily_data; las columnas de plata (venta/costo/ROI) son del SNAPSHOT MENSUAL de
// BLU y no se recortan por día (se aclara en la UI). Costo/ROI solo visible para management.

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

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const dayLabel = (d: Date) => format(d, "d MMM", { locale: es });

export default function ChattersQaHubstaff() {
  const { data: rows = [], isLoading } = useHubstaffEffort();
  const { data: sync } = useHubstaffSyncStatus();

  // Calendario de movimiento: rango de fechas (default = mes actual). El esfuerzo
  // (horas/actividad/días) se re-agrega por este rango; ventas/costo/ROI quedan del mes.
  const [from, setFrom] = useState<Date>(() => startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(() => endOfMonth(new Date()));
  const { data: rangeRows = [], isLoading: rangeLoading } = useChatterEffortRange(ymd(from), ymd(to));

  const rangeMap = useMemo(() => {
    const m = new Map<number, { total_hours: number; avg_activity_pct: number; days_tracked: number }>();
    for (const r of rangeRows) m.set(r.blu_employee_id, r);
    return m;
  }, [rangeRows]);

  // Venta POR RANGO (chatter_daily_sales vía RPC). Diariza venta/ingreso/margen/ROI.
  const { data: salesRows = [] } = useChatterSalesRange(ymd(from), ymd(to));
  const salesMap = useMemo(() => {
    const m = new Map<number, (typeof salesRows)[number]>();
    for (const s of salesRows) m.set(s.blu_employee_id, s);
    return m;
  }, [salesRows]);
  // Costo prorrateado por los días del rango (igual para todos los chatters).
  const costPerRange = salesRows.find((s) => s.cost_usd != null)?.cost_usd ?? null;

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const rate = rows.find((r) => r.agency_rate_used != null)?.agency_rate_used ?? null;
    const hasCost = costPerRange != null;
    // Financiero POR RANGO: ingreso de la venta diarizada; costo = base prorrateada × nº chatters.
    const totalAgencyRev = salesRows.reduce((s, x) => s + (x.agency_revenue_usd ?? 0), 0);
    const totalCost = hasCost ? Math.round(rows.length * (costPerRange ?? 0)) : 0;
    const totalMargin = totalAgencyRev - totalCost;
    const noRentables = rows.filter((r) => { const sr = salesMap.get(r.blu_employee_id); return sr && sr.sales > 0 && (sr.margin_usd ?? 0) < 0; }).length;
    const sinVentaBlu = rows.filter((r) => { const sr = salesMap.get(r.blu_employee_id); return !sr || sr.sales <= 0; }).length;
    const rangeHours = Math.round(rangeRows.reduce((s, r) => s + (r.total_hours ?? 0), 0));
    const rangeAvgAct = rangeRows.length
      ? Math.round(rangeRows.reduce((s, r) => s + (r.avg_activity_pct ?? 0), 0) / rangeRows.length)
      : 0;
    return {
      chatters: rows.length, period: rows[0].period, hasCost, totalCost, totalAgencyRev,
      totalMargin, noRentables, sinVentaBlu, costPer: costPerRange, rate, rangeHours, rangeAvgAct,
    };
  }, [rows, rangeRows, salesRows, salesMap, costPerRange]);

  if (isLoading) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando datos de Hubstaff…</CardContent></Card>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground"><Clock className="h-4 w-4" /> Productividad</div>
          Todavía no hay datos de actividad cruzados con ventas. El micro <code>hubstaff-bridge</code> sincroniza cada 6h;
          los chatters aparecen acá cuando su email de Hubstaff coincide con el de BLU.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + calendario de rango + estado del sync */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-4 w-4 text-emerald-500" /> Esfuerzo · Resultado · Rentabilidad
          </h3>
          <p className="text-sm text-muted-foreground">
            {stats?.chatters} chatters · {stats?.rangeAvgAct}% actividad · {stats?.rangeHours}h —{" "}
            <strong>{dayLabel(from)}–{dayLabel(to)}</strong> (esfuerzo y venta por el rango elegido).
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DateRangePicker from={from} to={to} onApply={(f, t) => { if (f) setFrom(f); if (t) setTo(t); }} placeholder="Rango de fechas" />
          <span className="text-xs text-muted-foreground">Sincronizado {relativeTime(sync?.last_sync_at ?? null)}</span>
        </div>
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
                  <th className="px-3 py-3 text-right font-semibold">Días</th>
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
                  const eff = rangeMap.get(r.blu_employee_id);
                  const sr = salesMap.get(r.blu_employee_id);
                  const sales = sr?.sales ?? 0;
                  const sinVenta = !sr || sales <= 0;
                  const agencyRev = sr?.agency_revenue_usd ?? 0;
                  const margin = sr?.margin_usd ?? (costPerRange != null ? -costPerRange : 0);
                  const roi = sr?.roi_x ?? (sinVenta ? 0 : null);
                  const noRent = !sinVenta && margin < 0;
                  const rowTint = sinVenta ? "" : noRent ? "bg-destructive/5" : r.online_improductivo ? "bg-warning/5" : "";
                  return (
                    <tr key={r.blu_employee_id} className={`border-b border-border/60 ${rowTint}`}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{eff ? eff.days_tracked : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eff ? `${eff.total_hours}h` : "0h"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eff ? `${eff.avg_activity_pct}%` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{sinVenta ? "—" : money(sales)}</td>
                      {stats?.hasCost && (
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{sinVenta ? "—" : money(agencyRev)}</td>
                      )}
                      {stats?.hasCost && (
                        <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${sinVenta ? "text-muted-foreground" : margin >= 0 ? "text-success" : "text-destructive"}`}>
                          {sinVenta ? "—" : money(margin)}
                        </td>
                      )}
                      {stats?.hasCost && (
                        <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${sinVenta || roi == null ? "text-muted-foreground" : roi >= 1 ? "text-success" : "text-destructive"}`}>
                          {sinVenta || roi == null ? "—" : `${roi.toFixed(2)}×`}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.avg_response_min != null ? `${r.avg_response_min}m` : "—"}
                      </td>
                      <td className="px-4 py-2.5">{statusPill({ no_rentable: noRent, online_improductivo: r.online_improductivo, roi_x: roi, sin_venta_blu: sinVenta })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        <strong>Días/Horas/Actividad y Venta/Ingreso/Margen/ROI</strong> = del rango seleccionado ({dayLabel(from)}–{dayLabel(to)}){rangeLoading ? " (cargando…)" : ""} — venta diaria de BLU.
        {stats?.hasCost ? (
          <>
            {" "}Ingreso agencia = venta × 80% (neto OF) × {stats.rate}% (comisión efectiva ponderada).
            Costo = salario base <em>prorrateado por los días del rango</em> ({money(stats.costPer)} en este rango) @ tipo de cambio en vivo.
            ROI &lt; 1 (rojo) = la agencia recibe menos de lo que cuesta el chatter en el rango. "Sin venta BLU" = no hubo venta registrada en el rango.
          </>
        ) : (
          <> 🚩 "online, poca venta" = ≥25h y ≥50% actividad pero baja venta. Las notas de Puntualidad y Productividad del scorecard salen de estos mismos datos.</>
        )}
      </p>
    </div>
  );
}

function statusPill(r: { no_rentable: boolean | null; online_improductivo: boolean; roi_x: number | null; sin_venta_blu: boolean | null }) {
  if (r.sin_venta_blu) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-600">
        <Info className="h-3 w-3" /> sin venta BLU
      </span>
    );
  }
  if (r.no_rentable) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" /> no rentable
      </span>
    );
  }
  if (r.online_improductivo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
        <AlertTriangle className="h-3 w-3" /> online, poca venta
      </span>
    );
  }
  if ((r.roi_x ?? 0) >= 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
        <TrendingUp className="h-3 w-3" /> rinde
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
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-bold leading-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
