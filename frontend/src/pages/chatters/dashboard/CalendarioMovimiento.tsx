import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { tonoDeNota, money, type DiaDeChatter } from "@/pages/chatters/useChatterRendimiento";
import { DIAS_CORTOS, fechaDe, isoDe, type Descanso } from "@/pages/chatters/horarios/types";

// CALENDARIO DE MOVIMIENTO: el mes, día por día, con la nota de cada uno como
// color y las ventas del día como número. Gris = no hay dato (no es lo mismo
// un mal día que un día del que no sabemos nada). Los descansos van con un
// borde punteado: ahí no se esperaba venta.
export default function CalendarioMovimiento({ mes, dias, descansos, desde, hasta, diaSel, onDia, hoy = new Date() }: {
  mes: Date;                    // cualquier día del mes a dibujar
  dias: DiaDeChatter[];
  descansos: Descanso[];        // descansos propios (todas las semanas visibles)
  desde: string; hasta: string; // rango elegido: los días fuera del rango se atenúan
  diaSel: string | null; onDia: (d: string | null) => void;
  hoy?: Date;
}) {
  const porDia = useMemo(() => new Map(dias.map((d) => [d.dia, d])), [dias]);
  const descansoEn = useMemo(() => {
    const set = new Set<string>();
    for (const r of descansos) if (r.identity_id) { const d = fechaDe(r.week_start); d.setDate(d.getDate() + r.weekday); set.add(isoDe(d)); }
    return set;
  }, [descansos]);

  const y = mes.getFullYear(), m = mes.getMonth();
  const primero = new Date(y, m, 1);
  const offset = (primero.getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(y, m + 1, 0).getDate();
  const celdas: Array<Date | null> = [...Array<null>(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => new Date(y, m, i + 1))];
  while (celdas.length % 7) celdas.push(null);
  const hoyIso = isoDe(hoy);
  const titulo = primero.toLocaleDateString("es", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold capitalize">{titulo}</h3>
        <Leyenda />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS_CORTOS.map((d) => <div key={d} className="pb-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{d}</div>)}
        {celdas.map((fecha, i) => {
          if (!fecha) return <div key={`v${i}`} />;
          const iso = isoDe(fecha);
          const d = porDia.get(iso);
          const enRango = iso >= desde && iso <= hasta;
          const futuro = iso > hoyIso;
          const libre = descansoEn.has(iso);
          const sel = diaSel === iso;
          return (
            <button key={iso} type="button" disabled={futuro && !libre} onClick={() => onDia(sel ? null : iso)}
              title={d ? `${iso}: nota ${d.nota?.toFixed(1) ?? "—"} · ${money(d.ventas)}` : libre ? `${iso}: descanso` : iso}
              className={cn(
                "relative flex aspect-square flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-all",
                d ? tonoDeNota(d.nota) : "border-border/60 bg-transparent text-muted-foreground",
                libre && "border-dashed",
                !enRango && "opacity-35",
                futuro && "opacity-25",
                sel && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                !futuro && "hover:brightness-95 dark:hover:brightness-110",
              )}>
              <span className={cn("text-[11px] font-semibold tabular-nums leading-none", iso === hoyIso && "underline underline-offset-2 decoration-2")}>{fecha.getDate()}</span>
              {d?.ventas != null && Number(d.ventas) > 0 ? (
                <span className="text-[10px] font-medium tabular-nums leading-none">{money(d.ventas)}</span>
              ) : libre ? (
                <span className="text-[9px] uppercase tracking-wide leading-none opacity-70">desc.</span>
              ) : null}
              {d?.nota != null && <span className="absolute right-1 top-1 text-[9px] font-bold tabular-nums opacity-70">{d.nota.toFixed(0)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-success/40" /> ≥ 8</span>
      <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-warning/40" /> 6–8</span>
      <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-destructive/40" /> &lt; 6</span>
      <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-border" /> descanso</span>
    </div>
  );
}
