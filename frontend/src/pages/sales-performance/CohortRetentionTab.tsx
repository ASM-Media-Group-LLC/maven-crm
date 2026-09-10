import { Brain } from "lucide-react";
import type { CohortRow } from "./useCohortRetention";

// Matriz de cohortes de retención: filas = cohorte de alta, columnas = días desde el
// alta, celda = % de fans aún activos. Color del verde (alta retención) al rojo (baja).
// Fuente: RPC dashboard2_cohort_retention (agrega creator_fan_retention de BLU).

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtCohort = (ymd: string) => {
  const p = ymd.split("-");
  return `${Number(p[2])} ${MESES[Number(p[1]) - 1] ?? ""}`;
};

// Retención clusterea alto (90-100%); la escala separa esa banda + cae a ámbar/rojo.
const cellStyle = (v: number | null): string => {
  if (v == null) return "bg-muted/15 text-muted-foreground/30";
  if (v >= 97) return "bg-emerald-500/85 text-white";
  if (v >= 93) return "bg-emerald-500/60 text-white";
  if (v >= 88) return "bg-emerald-500/35 text-foreground";
  if (v >= 80) return "bg-amber-500/45 text-foreground";
  if (v >= 70) return "bg-orange-500/50 text-foreground";
  return "bg-red-500/55 text-white";
};

interface Props {
  rows: CohortRow[];
  maxOffset: number;
  loading: boolean;
  periodLabel?: string;
}

const CohortRetentionTab = ({ rows, maxOffset, loading, periodLabel }: Props) => {
  const dayCols = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  // Resumen: total fans en cohortes + retención promedio ponderada en el último día observado.
  const totalFans = rows.reduce((s, r) => s + r.cohort_size, 0);
  const lastDay = maxOffset;
  const lastVals = rows.filter((r) => r.cells[lastDay] != null);
  const wAvgLast = lastVals.length
    ? lastVals.reduce((s, r) => s + (r.cells[lastDay] as number) * r.cohort_size, 0) /
      lastVals.reduce((s, r) => s + r.cohort_size, 0)
    : null;
  // Mejor cohorte por retención en el último día observado (con ≥10 fans para que sea significativa).
  const best = [...rows]
    .filter((r) => r.cohort_size >= 10 && r.cells[lastDay] != null)
    .sort((a, b) => (b.cells[lastDay] as number) - (a.cells[lastDay] as number))[0];

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-amber-400" /> Cohortes de retención de fans
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Cada fila es un grupo de fans según el día en que se suscribieron; cada columna es cuántos
          días pasaron desde el alta. La celda = % del grupo que sigue activo. Retención temprana
          (hasta D{maxOffset}); se profundiza con el tiempo. Fuente:{" "}
          <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_fan_retention</code> (BLU).
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Cargando cohortes…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card text-center py-12 text-sm text-muted-foreground">
          Sin cohortes en {periodLabel ?? "el rango seleccionado"}.
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Cohortes</p>
              <p className="text-lg font-bold tabular-nums">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Fans nuevos</p>
              <p className="text-lg font-bold tabular-nums">{totalFans.toLocaleString("en-US")}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Retención D{lastDay}</p>
              <p className="text-lg font-bold tabular-nums">{wAvgLast != null ? `${wAvgLast.toFixed(1)}%` : "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Mejor cohorte</p>
              <p className="text-lg font-bold tabular-nums">{best ? fmtCohort(best.cohort_date) : "—"}</p>
            </div>
          </div>

          {/* Matriz heatmap */}
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="tabla-movil w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Cohorte</th>
                  <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Fans</th>
                  {dayCols.map((d) => (
                    <th key={d} className="px-2 py-2 text-center font-semibold text-muted-foreground tabular-nums">D{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cohort_date} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium whitespace-nowrap">{fmtCohort(r.cohort_date)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.cohort_size.toLocaleString("en-US")}</td>
                    {dayCols.map((d) => {
                      const v = r.cells[d];
                      return (
                        <td key={d} className={`px-2 py-1.5 text-center tabular-nums font-medium ${cellStyle(v)}`}>
                          {v != null ? `${v.toFixed(0)}` : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Valores en %. Verde = mayor retención · ámbar/rojo = caída. Celda vacía = ese día aún no se observó para esa cohorte.
          </p>
        </>
      )}
    </div>
  );
};

export default CohortRetentionTab;
