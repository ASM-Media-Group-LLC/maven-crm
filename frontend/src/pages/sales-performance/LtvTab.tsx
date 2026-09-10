import { UserCheck, Info } from "lucide-react";

// LTV ESTIMADO (interim, mientras llega la ingesta per-fan B1):
//   LTV ≈ ARPU mensual × vida media del fan.
//   - ARPU mensual = ingreso del período / fans activos promedio / meses del período.
//   - vida media = promedio de subscription_length_days (de creator_top_fans) / 30.
// Es una ESTIMACIÓN de toda la base (no top-fans sesgado). El LTV medido por fan
// llega con fan-summary (Slice B1).

export interface LtvCreator {
  creator_id: string;
  name: string;
  activeFans: number;     // promedio de fans activos en el período
  arpuMonthly: number;    // ingreso mensual por fan activo
  ltv: number;            // arpuMonthly × vida media (meses)
  gross: number;          // ingreso del período
}
export interface LtvData {
  avgLifespanMonths: number | null;
  aggArpuMonthly: number | null;
  aggLtv: number | null;
  totalActiveFans: number;
  perCreator: LtvCreator[];
}

const money = (n: number | null | undefined) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));

const LtvTab = ({ data, loading, periodLabel }: { data: LtvData | null; loading: boolean; periodLabel?: string }) => {
  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Calculando LTV…</div>;
  if (!data || data.perCreator.length === 0)
    return <div className="rounded-lg border border-border bg-card text-center py-12 text-sm text-muted-foreground">Sin datos de ingreso/fans en {periodLabel ?? "el rango"}.</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-success/5 border border-success/30 px-4 py-2.5">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-success" /> Customer Lifetime Value — estimado
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-start gap-1">
          <Info className="h-3 w-3 mt-px shrink-0" />
          <span>
            <strong>LTV ≈ ARPU mensual × vida media.</strong> ARPU = ingreso / fans activos prom; vida media = duración prom de
            suscripción ({data.avgLifespanMonths != null ? data.avgLifespanMonths.toFixed(1) : "—"} meses). Estimación sobre TODA
            la base (no solo top-fans). El LTV <em>medido por fan</em> llega con la ingesta de Mensajes Pro (B1). Fuente:{" "}
            <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_daily_earnings</code> ×{" "}
            <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_top_fans</code>.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-success/40 bg-success/5 p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">LTV estimado</p>
          <p className="text-xl font-bold tabular-nums text-success">{money(data.aggLtv)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">ARPU / mes</p>
          <p className="text-lg font-bold tabular-nums">{money(data.aggArpuMonthly)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Vida media</p>
          <p className="text-lg font-bold tabular-nums">{data.avgLifespanMonths != null ? `${data.avgLifespanMonths.toFixed(1)} m` : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Fans activos</p>
          <p className="text-lg font-bold tabular-nums">{data.totalActiveFans.toLocaleString("en-US")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="tabla-movil w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Creadora</th>
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Fans activos</th>
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">ARPU / mes</th>
              <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">LTV estimado</th>
            </tr>
          </thead>
          <tbody>
            {data.perCreator.map((c) => (
              <tr key={c.creator_id} className="border-t border-border">
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">{c.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{Math.round(c.activeFans).toLocaleString("en-US")}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(c.arpuMonthly)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-success">{money(c.ltv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LtvTab;
