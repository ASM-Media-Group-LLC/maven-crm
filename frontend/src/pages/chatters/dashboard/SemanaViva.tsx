import { useMemo } from "react";
import { Flame, Moon, Sun, Sunset, CalendarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { money, type DiaDeChatter } from "@/pages/chatters/useChatterRendimiento";
import { DIAS_CORTOS, fechaDe, isoDe, lunesDe, sumarDias, type Descanso, type Shift } from "@/pages/chatters/horarios/types";

// TU SEMANA: siete fichas, una por día, con la nota como color y las ventas
// como número; a la izquierda, el último día cerrado como anillo de meta y la
// racha de días buenos. Reemplaza al calendario mensual, que repetía lo que ya
// muestra el gráfico de ventas por día.

const ICONO_TURNO: Record<Shift, typeof Sun> = { am: Sun, pm: Sunset, mad: Moon };

function tono(nota: number | null | undefined) {
  if (nota == null) return { fondo: "bg-muted/40 border-border/60", texto: "text-muted-foreground", barra: "bg-muted-foreground/40" };
  if (nota >= 8) return { fondo: "bg-success/15 border-success/40", texto: "text-success", barra: "bg-success" };
  if (nota >= 6) return { fondo: "bg-warning/15 border-warning/40", texto: "text-warning", barra: "bg-warning" };
  return { fondo: "bg-destructive/15 border-destructive/40", texto: "text-destructive", barra: "bg-destructive" };
}

export default function SemanaViva({ dias, descansos, shift, hoy = new Date(), onDia, diaSel }: {
  dias: DiaDeChatter[]; descansos: Descanso[]; shift: Shift | null; hoy?: Date; onDia: (d: string | null) => void; diaSel: string | null;
}) {
  const semana = lunesDe(hoy);
  const hoyIso = isoDe(hoy);
  const porDia = useMemo(() => new Map(dias.map((d) => [d.dia, d])), [dias]);
  const libres = useMemo(() => {
    const s = new Set<string>();
    for (const r of descansos) if (r.identity_id) { const d = fechaDe(r.week_start); d.setDate(d.getDate() + r.weekday); s.add(isoDe(d)); }
    return s;
  }, [descansos]);

  // Último día cerrado (con nota) y racha de días con nota ≥ 8 terminando ahí.
  const cerrados = useMemo(() => dias.filter((d) => d.nota != null).sort((a, b) => a.dia.localeCompare(b.dia)), [dias]);
  const ultimo = cerrados.length ? cerrados[cerrados.length - 1] : null;
  let racha = 0;
  for (let i = cerrados.length - 1; i >= 0 && (cerrados[i].nota ?? 0) >= 8; i--) racha++;
  const ult7 = cerrados.slice(-7);
  const prom7 = ult7.length ? ult7.reduce((s, d) => s + (d.nota ?? 0), 0) / ult7.length : null;
  const pct = ultimo && Number(ultimo.ventas_esperadas) > 0 ? Math.min(150, (100 * Number(ultimo.ventas ?? 0)) / Number(ultimo.ventas_esperadas)) : null;
  const Icono = shift ? ICONO_TURNO[shift] : Sun;

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      {/* Último día cerrado: anillo de meta + racha */}
      <div className="flex flex-col items-center justify-center rounded-xl border bg-gradient-to-b from-primary/10 to-transparent p-4 text-center">
        <p className="text-xs text-muted-foreground">{ultimo ? `Último cierre · ${fechaDe(ultimo.dia).toLocaleDateString("es", { weekday: "short", day: "numeric" })}` : "Sin cierres todavía"}</p>
        <Anillo pct={pct} nota={ultimo?.nota ?? null} />
        <p className="text-sm"><span className="font-semibold tabular-nums">{money(ultimo?.ventas)}</span> <span className="text-muted-foreground">de {money(ultimo?.ventas_esperadas)}</span></p>
        <div className="mt-3 flex w-full items-center justify-center gap-3 text-xs">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", racha > 0 ? "bg-orange-500/15 text-orange-600 dark:text-orange-400" : "bg-muted text-muted-foreground")}>
            <Flame className="h-3.5 w-3.5" /> {racha} {racha === 1 ? "día" : "días"} ≥ 8
          </span>
          {prom7 != null && <span className="text-muted-foreground">7 días: <b className={tono(prom7).texto}>{prom7.toFixed(1)}</b></span>}
        </div>
      </div>

      {/* Las siete fichas */}
      <div className="grid grid-cols-7 gap-2">
        {DIAS_CORTOS.map((label, i) => {
          const iso = sumarDias(semana, i);
          const d = porDia.get(iso);
          const esHoy = iso === hoyIso;
          const futuro = iso > hoyIso;
          const libre = libres.has(iso);
          const t = tono(d?.nota);
          const sel = diaSel === iso;
          return (
            <button key={iso} type="button" disabled={futuro && !libre} onClick={() => onDia(sel ? null : iso)}
              className={cn(
                "group relative flex min-h-[132px] flex-col rounded-xl border p-2.5 text-left transition-all",
                libre ? "border-dashed bg-transparent" : d ? t.fondo : "bg-card",
                esHoy && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
                sel && "ring-2 ring-foreground",
                !futuro && " hover:shadow-md",
                futuro && !libre && "opacity-40",
              )}>
              <div className="flex items-baseline justify-between">
                <span className={cn("text-xs font-semibold", esHoy ? "text-primary" : "text-muted-foreground")}>{label}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{fechaDe(iso).getDate()}</span>
              </div>
              {libre ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground">
                  <CalendarOff className="h-5 w-5" /><span className="text-xs">Descanso</span>
                </div>
              ) : d ? (
                <>
                  <div className={cn("mt-2 font-display text-3xl font-extrabold leading-none tabular-nums", t.texto)}>{d.nota == null ? "—" : d.nota.toFixed(1)}</div>
                  <div className="mt-auto space-y-1">
                    <div className="text-sm font-semibold tabular-nums">{money(d.ventas)}</div>
                    <div className="h-1 w-full rounded-full bg-background/60"><div className={cn("h-1 rounded-full", t.barra)} style={{ width: `${Math.min(100, Number(d.ventas_esperadas) > 0 ? (100 * Number(d.ventas ?? 0)) / Number(d.ventas_esperadas) : 0)}%` }} /></div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{d.horas != null ? `${d.horas.toFixed(1)} h` : "sin horas"}{d.detalle?.actividad_pct != null ? ` · ${Math.round(d.detalle.actividad_pct)}%` : ""}</div>
                  </div>
                </>
              ) : esHoy ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 text-primary">
                  <Icono className="h-5 w-5" /><span className="text-xs font-semibold">En curso</span>
                  <span className="text-[10px] text-muted-foreground">cierra mañana</span>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xl text-muted-foreground/50">·</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Anillo({ pct, nota }: { pct: number | null; nota: number | null }) {
  const r = 44, c = 2 * Math.PI * r;
  const p = pct == null ? 0 : Math.min(100, pct) / 100;
  const t = tono(nota);
  return (
    <div className="relative my-2 h-[112px] w-[112px]">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-700", t.texto)} strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-display text-3xl font-extrabold leading-none tabular-nums", t.texto)}>{nota == null ? "—" : nota.toFixed(1)}</span>
        <span className="mt-0.5 text-xs text-muted-foreground">{pct == null ? "Sin meta" : `${Math.round(pct)}% meta`}</span>
      </div>
    </div>
  );
}
