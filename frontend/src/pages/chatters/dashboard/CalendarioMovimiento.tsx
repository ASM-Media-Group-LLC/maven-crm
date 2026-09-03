import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { tonoDeNota, money, type DiaDeChatter } from "@/pages/chatters/useChatterRendimiento";
import { DIAS_CORTOS, fechaDe, isoDe, type Descanso } from "@/pages/chatters/horarios/types";

// CALENDARIO DE MOVIMIENTO: el mes en cuadritos de 36px (los mismos de la tira
// de días de Rendimiento), coloreados por la nota. Gris = sin dato, que no es
// lo mismo que un mal día. Descanso = borde punteado. Compacto a propósito: va
// dentro de una tarjeta del dashboard, no ocupa la pantalla.
export default function CalendarioMovimiento({ mes, dias, descansos, desde, hasta, diaSel, onDia, hoy = new Date() }: {
  mes: Date;
  dias: DiaDeChatter[];
  descansos: Descanso[];
  desde: string; hasta: string;
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
  const offset = (primero.getDay() + 6) % 7;
  const diasMes = new Date(y, m + 1, 0).getDate();
  const celdas: Array<Date | null> = [...Array<null>(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => new Date(y, m, i + 1))];
  const hoyIso = isoDe(hoy);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="w-fit">
        <p className="mb-1.5 text-xs font-medium capitalize text-muted-foreground">{primero.toLocaleDateString("es", { month: "long", year: "numeric" })}</p>
        <div className="grid grid-cols-7 gap-1">
          {DIAS_CORTOS.map((d) => <div key={d} className="w-9 text-center text-[10px] uppercase text-muted-foreground">{d[0]}</div>)}
          {celdas.map((fecha, i) => {
            if (!fecha) return <div key={`v${i}`} className="h-9 w-9" />;
            const iso = isoDe(fecha);
            const d = porDia.get(iso);
            const libre = descansoEn.has(iso);
            const futuro = iso > hoyIso;
            const enRango = iso >= desde && iso <= hasta;
            const sel = diaSel === iso;
            const boton = (
              <button type="button" disabled={futuro} onClick={() => onDia(sel ? null : iso)}
                className={cn(
                  "relative h-9 w-9 rounded-lg border text-[11px] font-medium tabular-nums transition-all",
                  d ? tonoDeNota(d.nota) : "border-border/60 text-muted-foreground",
                  libre && "border-dashed",
                  (!enRango || futuro) && "opacity-35",
                  iso === hoyIso && "ring-1 ring-foreground/40",
                  sel && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                )}>
                {fecha.getDate()}
                {d?.ventas != null && Number(d.ventas) > 0 && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current opacity-70" />}
              </button>
            );
            if (futuro) return <div key={iso}>{boton}</div>;
            return (
              <Tooltip key={iso}>
                <TooltipTrigger asChild>{boton}</TooltipTrigger>
                <TooltipContent className="text-xs">
                  <p className="font-medium">{fecha.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" })}{libre ? " · descanso" : ""}</p>
                  {d ? <p>Nota {d.nota?.toFixed(1) ?? "—"} · vendió {money(d.ventas)} · esperado {money(d.ventas_esperadas)}</p> : <p>Sin dato</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
