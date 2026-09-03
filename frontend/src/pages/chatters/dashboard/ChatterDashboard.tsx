import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, CalendarDays, CalendarOff, Clock, DollarSign, Gauge, Megaphone, Target, TrendingUp } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StatChip from "@/components/StatChip";
import DateRangePresets, { rangeForPreset, type DateRange, type RangePreset } from "@/components/dashboard/DateRangePresets";
import { CHART_AXIS, CHART_COLOR, CHART_GRID } from "@/lib/chartTheme";
import { MavenTooltip } from "@/components/charts/MavenTooltip";
import { useMyProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";
import { money, tonoDeNota, useModelosDelDia, NOMBRE_FALTANTE } from "@/pages/chatters/useChatterRendimiento";
import { useDescansos, useMiIdentidad, useNombres, useRoster } from "@/pages/chatters/horarios/useHorarios";
import { diaSemanaDe, etiquetaDia, fechaDe, isoDe, lunesDe, sumarDias, urlCreadora } from "@/pages/chatters/horarios/types";
import { TurnoBadge } from "@/pages/chatters/horarios/MiSemana";
import CalendarioMovimiento from "./CalendarioMovimiento";
import { useResumenChatter, useVentasPorModelo } from "./useChatterDashboard";

// DASHBOARD DEL CHATTER. Lo que una persona del equipo de chat quiere ver al
// entrar: su turno de hoy y sus creadoras, cómo le fue en el rango elegido
// (nota Maven, ventas BLU, horas), el mes día por día, y su descanso.
// Todo sale de tablas que RLS ya le deja leer sobre sí misma.
export default function ChatterDashboard({ hoy = new Date() }: { hoy?: Date }) {
  const { data: perfil } = useMyProfile();
  const identidad = useMiIdentidad();
  const yo = identidad.data ?? null;

  const [range, setRange] = useState<DateRange>(() => rangeForPreset("this_month", hoy));
  const [preset, setPreset] = useState<RangePreset | null>("this_month");
  const desde = isoDe(range.from), hasta = isoDe(range.to);
  const diasDelPeriodo = differenceInCalendarDays(range.to, range.from) + 1;
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const { dias, resumen, cargando } = useResumenChatter(yo, desde, hasta, diasDelPeriodo);
  const modelos = useVentasPorModelo(yo, desde, hasta);

  // Horario: mi grupo, mis creadoras, mis descansos del mes visible.
  const { grupos, miembros, creadoras } = useRoster();
  const miFila = miembros.find((m) => m.identity_id === yo) ?? null;
  const miGrupo = miFila ? grupos.find((g) => g.id === miFila.group_id) ?? null : null;
  const misCreadoras = useMemo(() => creadoras.filter((c) => miFila && c.group_id === miFila.group_id), [creadoras, miFila]);
  const semanaHoy = lunesDe(hoy);
  const descansos = useDescansos(lunesDe(fechaDe(desde)), lunesDe(fechaDe(hasta)) > sumarDias(semanaHoy, 7) ? lunesDe(fechaDe(hasta)) : sumarDias(semanaHoy, 7));
  const misDescansos = (descansos.data ?? []).filter((d) => d.identity_id === yo);
  const descansoSemana = misDescansos.find((d) => d.week_start === semanaHoy) ?? null;
  const hoyLibre = descansoSemana?.weekday === diaSemanaDe(hoy);
  const nombres = useNombres([descansoSemana?.covered_by_identity_id ?? ""]);

  const nombre = perfil?.full_name?.split(" ")[0] ?? "";
  const fechaLarga = format(hoy, "EEEE d 'de' MMMM", { locale: es });

  // Meses que abarca el rango (normalmente uno): un calendario por mes, máximo tres.
  const meses = useMemo(() => {
    const out: Date[] = []; const d = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (d <= range.to && out.length < 3) { out.push(new Date(d)); d.setMonth(d.getMonth() + 1); }
    return out;
  }, [range]);

  const serie = useMemo(() => dias.map((d) => ({
    dia: d.dia, etiqueta: fechaDe(d.dia).getDate().toString(),
    ventas: Number(d.ventas ?? 0), esperado: Number(d.ventas_esperadas ?? 0), nota: d.nota,
  })), [dias]);
  const cumplimiento = resumen.esperado > 0 ? (100 * resumen.ventas) / resumen.esperado : null;
  const diaDetalle = diaSel ? dias.find((d) => d.dia === diaSel) ?? null : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Encabezado: quién soy y qué me toca hoy */}
      <header className="shrink-0 border-b border-white/10 bg-background/30 px-6 py-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{nombre ? `Hola, ${nombre}` : "Tu día"}</h1>
            <p className="text-sm capitalize text-muted-foreground">{fechaLarga}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {miFila && (hoyLibre
              ? <Badge variant="outline" className="gap-1 border-orange-500/30 bg-orange-500/10 font-semibold text-orange-700 dark:text-orange-300"><CalendarOff className="h-3.5 w-3.5" /> Hoy descansás</Badge>
              : <TurnoBadge shift={miFila.shift} conHoras />)}
            {miGrupo && <Badge variant="secondary" className="font-normal">{miGrupo.name} · {miGrupo.agency === "plus" ? "Plus" : "Massive"}</Badge>}
            <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full"><Link to="/chatters/horarios"><CalendarDays className="h-3.5 w-3.5" /> Mi horario</Link></Button>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 overflow-auto p-6">
        {/* Hoy: creadoras + descanso, una sola franja */}
        {miFila ? (
          <section className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tus creadoras hoy · {misCreadoras.length}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {misCreadoras.map((c) => {
                  const url = urlCreadora(c);
                  const cls = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[12px]";
                  return url
                    ? <Link key={c.id} to={url} className={cn(cls, "hover:border-primary/40 hover:bg-primary/5")} title="Abrir perfil">@{c.creator_handle}{c.mad && <span className="text-[9px] text-muted-foreground">MAD</span>}</Link>
                    : <span key={c.id} className={cn(cls, "text-muted-foreground")} title="Sin ficha en Maven">@{c.creator_handle}</span>;
                })}
                {misCreadoras.length === 0 && <span className="text-sm text-muted-foreground">Tu grupo todavía no tiene creadoras cargadas.</span>}
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tu descanso esta semana</p>
              {descansoSemana ? (
                <>
                  <p className="mt-1 font-display text-xl font-bold">{etiquetaDia(semanaHoy, descansoSemana.weekday)}</p>
                  <p className="text-xs text-muted-foreground">{descansoSemana.covered_by_identity_id ? `Te cubre ${nombres[descansoSemana.covered_by_identity_id] ?? "…"}` : "Sin cobertura asignada"}{descansoSemana.note ? ` · ${descansoSemana.note}` : ""}</p>
                </>
              ) : <p className="mt-1 text-sm text-muted-foreground">Todavía sin cargar.</p>}
            </div>
          </section>
        ) : !identidad.isLoading && (
          <section className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Tu usuario todavía no está en un grupo de horarios. Cuando un supervisor te asigne, acá vas a ver tu turno, tus creadoras y tu descanso.
          </section>
        )}

        {/* Rango */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Tu rendimiento</h2>
            <p className="text-xs text-muted-foreground">
              {resumen.diasConNota} de {diasDelPeriodo} días con nota. La nota se calcula cada mañana con el día anterior.
            </p>
          </div>
          <DateRangePresets range={range} activePreset={preset} onChange={(r, p) => { setRange(r); setPreset(p); setDiaSel(null); }} />
        </section>

        {/* KPIs */}
        {cargando ? <Skeleton className="h-20 w-full rounded-xl" /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatChip label="Nota Maven" icon={<Gauge className="h-3.5 w-3.5" />}
              value={resumen.notaPromedio == null ? "—" : <span className={cn("rounded-md border px-1.5", tonoDeNota(resumen.notaPromedio))}>{resumen.notaPromedio.toFixed(1)}</span>}
              hint={resumen.notaPromedio == null ? "sin datos" : "/10 promedio"} />
            <StatChip label="Ventas BLU" icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" value={money(resumen.ventas)} hint={`${resumen.diasConVentas} días con venta`} />
            <StatChip label="Vs. esperado" icon={<Target className="h-3.5 w-3.5" />} color={cumplimiento == null ? undefined : cumplimiento >= 100 ? "bg-success" : cumplimiento >= 70 ? "bg-warning" : "bg-destructive"}
              value={cumplimiento == null ? "—" : `${Math.round(cumplimiento)}%`} hint={resumen.esperado > 0 ? `meta ${money(resumen.esperado)}` : "sin meta"} />
            <StatChip label="Horas" icon={<Clock className="h-3.5 w-3.5" />} value={resumen.horas ? resumen.horas.toFixed(0) : "—"} hint="Hubstaff" />
            <StatChip label="Masivos" icon={<Megaphone className="h-3.5 w-3.5" />} value={resumen.masivos} hint={resumen.masivosConversion == null ? "" : `${resumen.masivosConversion.toFixed(1)}% conversión`} />
            <StatChip label="Mejor día" icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success"
              value={resumen.mejorDia ? money(resumen.mejorDia.ventas) : "—"} hint={resumen.mejorDia ? format(fechaDe(resumen.mejorDia.dia), "EEE d", { locale: es }) : ""} />
          </div>
        )}

        {/* Calendario + detalle del día */}
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className={cn("rounded-2xl border bg-card p-4", meses.length > 1 && "grid gap-6 md:grid-cols-2")}>
            {meses.map((m) => (
              <CalendarioMovimiento key={m.toISOString()} mes={m} dias={dias} descansos={misDescansos} desde={desde} hasta={hasta} diaSel={diaSel} onDia={setDiaSel} hoy={hoy} />
            ))}
          </div>
          <aside className="rounded-2xl border bg-card p-4">
            {diaSel ? (
              <DetalleDia dia={diaSel} fila={diaDetalle} identityId={yo} libre={misDescansos.some((r) => { const d = fechaDe(r.week_start); d.setDate(d.getDate() + r.weekday); return isoDe(d) === diaSel; })} />
            ) : (
              <div className="flex h-full flex-col justify-center text-center text-sm text-muted-foreground">
                <CalendarDays className="mx-auto mb-2 h-6 w-6 opacity-40" />
                Tocá un día del calendario para ver qué vendiste, cuántas horas hiciste y cómo salió la nota.
              </div>
            )}
          </aside>
        </section>

        {/* Ventas vs esperado */}
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-display text-sm font-semibold">Ventas por día</h3>
            <p className="text-[11px] text-muted-foreground">Barras: lo que vendiste · línea: lo que se esperaba por tus modelos</p>
          </div>
          {serie.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sin días calculados en este rango.</p> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="etiqueta" {...CHART_AXIS} />
                  <YAxis {...CHART_AXIS} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<MavenTooltip formatter={(v: number) => money(v)} labelFormatter={(l: string, p: Array<{ payload?: { dia: string } }>) => p?.[0]?.payload?.dia ?? l} />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="ventas" name="Ventas" fill={CHART_COLOR.azul} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="esperado" name="Esperado" stroke={CHART_COLOR.ambar} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Ranking de creadoras: con cuál vendés más */}
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-display text-sm font-semibold">Tus mejores creadoras</h3>
            <p className="text-[11px] text-muted-foreground">Lo que vendiste con cada una en el rango, según BLU</p>
          </div>
          {modelos.isLoading ? <Skeleton className="h-24 w-full" /> : !modelos.data?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas cruzadas con creadoras en este rango.</p>
          ) : (() => {
            const total = modelos.data.reduce((s, m) => s + m.sales, 0) || 1;
            const max = modelos.data[0].sales || 1;
            const medalla = ["text-amber-500", "text-slate-400", "text-amber-700"];
            return (
              <ol className="divide-y">
                {modelos.data.slice(0, 12).map((m, i) => (
                  <li key={m.blu_model_id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm sm:grid-cols-[28px_minmax(0,200px)_1fr_auto]">
                    <span className={cn("font-display text-base font-bold tabular-nums", i < 3 ? medalla[i] : "text-muted-foreground")}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.model_name ?? `Modelo ${m.blu_model_id}`}</p>
                      <p className="text-[11px] text-muted-foreground">{m.fans.toLocaleString("es")} fans · {m.dias} {m.dias === 1 ? "día" : "días"}</p>
                    </div>
                    <div className="hidden h-2 rounded-full bg-muted sm:block"><div className={cn("h-2 rounded-full", i === 0 ? "bg-primary" : "bg-primary/60")} style={{ width: `${Math.max(2, (100 * m.sales) / max)}%` }} /></div>
                    <div className="text-right">
                      <p className="font-display font-bold tabular-nums">{money(m.sales)}</p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">{Math.round((100 * m.sales) / total)}% de tus ventas</p>
                    </div>
                  </li>
                ))}
              </ol>
            );
          })()}
        </section>
      </main>
    </div>
  );
}

// Un día: ventas, esperado, horas y las tres notas que componen la final.
function DetalleDia({ dia, fila, identityId, libre }: { dia: string; fila: ReturnType<typeof useResumenChatter>["dias"][number] | null; identityId: string | null; libre: boolean }) {
  const modelos = useModelosDelDia(identityId, dia);
  const fecha = format(fechaDe(dia), "EEEE d 'de' MMMM", { locale: es });
  const faltan = fila?.detalle?.faltantes ?? [];
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Día</p>
        <p className="font-display text-lg font-bold capitalize leading-tight">{fecha}</p>
        {libre && <Badge variant="outline" className="mt-1 gap-1 border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"><CalendarOff className="h-3 w-3" /> Descanso</Badge>}
      </div>
      {!fila ? (
        <p className="text-sm text-muted-foreground">{libre ? "Era tu día de descanso: no se esperaba venta." : "De este día todavía no hay nota calculada."}</p>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Nota</p>
              <p className={cn("mt-1 inline-block rounded-lg border px-2 py-0.5 font-display text-2xl font-bold tabular-nums", tonoDeNota(fila.nota))}>{fila.nota == null ? "—" : fila.nota.toFixed(1)}</p></div>
            <div className="text-right"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ventas</p>
              <p className="font-display text-2xl font-bold tabular-nums">{money(fila.ventas)}</p>
              <p className="text-[11px] text-muted-foreground">esperado {money(fila.ventas_esperadas)}</p></div>
          </div>
          <ul className="space-y-1 text-sm">
            <Componente etiqueta="Ventas" nota={fila.nota_ventas} peso="50%" />
            <Componente etiqueta={`Tiempo${fila.horas != null ? ` · ${fila.horas.toFixed(1)} h` : ""}`} nota={fila.nota_tiempo} peso="30%" />
            <Componente etiqueta="Cowork" nota={fila.nota_meet} peso="20%" />
          </ul>
          {faltan.length > 0 && <p className="text-xs text-warning">Calculada sin: {faltan.map((f) => NOMBRE_FALTANTE[f] ?? f).join(", ")}.</p>}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Modelos atendidas</p>
            {modelos.isLoading ? <Skeleton className="h-6 w-full" /> : !modelos.data?.length ? <p className="text-xs text-muted-foreground">Sin cruce con modelos ese día.</p> : (
              <ul className="space-y-0.5 text-xs">
                {modelos.data.map((m) => <li key={m.blu_model_id} className="flex justify-between gap-2"><span className="truncate">{m.model_name ?? `Modelo ${m.blu_model_id}`}</span><span className="tabular-nums font-medium">{money(m.sales)}</span></li>)}
              </ul>
            )}
          </div>
        </>
      )}
      <Link to="/chatter-evaluator/rendimiento" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Cómo se calcula la nota <ArrowRight className="h-3 w-3" /></Link>
    </div>
  );
}

function Componente({ etiqueta, nota, peso }: { etiqueta: string; nota: number | null; peso: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{etiqueta}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted"><div className={cn("h-1.5 rounded-full", nota == null ? "bg-transparent" : nota >= 8 ? "bg-success" : nota >= 6 ? "bg-warning" : "bg-destructive")} style={{ width: `${((nota ?? 0) / 10) * 100}%` }} /></div>
      <span className="w-8 text-right tabular-nums font-medium">{nota == null ? "—" : nota.toFixed(1)}</span>
      <span className="w-8 text-right text-[10px] text-muted-foreground">{peso}</span>
    </li>
  );
}

