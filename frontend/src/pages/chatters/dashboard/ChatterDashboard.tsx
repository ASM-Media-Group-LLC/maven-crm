import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, CalendarOff, ChevronRight, Clock, DollarSign, Gauge, Megaphone, Target, TrendingUp } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const cardTitle = "text-base font-semibold";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Mismo encabezado que el dashboard general */}
      <header className="shrink-0 border-b border-white/10 bg-background/30 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{nombre ? `Hola, ${nombre}` : "Tu día"}</h1>
            <p className="text-sm capitalize text-muted-foreground">{fechaLarga}</p>
          </div>
          <div className="flex items-center gap-2">
            {miFila && (hoyLibre
              ? <Badge variant="outline" className="gap-1 border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"><CalendarOff className="h-3.5 w-3.5" /> Hoy descansás</Badge>
              : <TurnoBadge shift={miFila.shift} conHoras />)}
            <DateRangePresets range={range} activePreset={preset} onChange={(r, p) => { setRange(r); setPreset(p); setDiaSel(null); }} />
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 overflow-auto p-6">
        {/* KPIs: mismos stat-chips que el dashboard general */}
        {cargando ? <Skeleton className="h-16 w-full rounded-xl" /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatChip label="Nota Maven" icon={<Gauge className="h-3.5 w-3.5" />} value={resumen.notaPromedio == null ? "—" : resumen.notaPromedio.toFixed(1)}
              color={resumen.notaPromedio == null ? undefined : resumen.notaPromedio >= 8 ? "bg-success" : resumen.notaPromedio >= 6 ? "bg-warning" : "bg-destructive"}
              hint={resumen.notaPromedio == null ? "sin datos" : `${resumen.diasConNota} de ${diasDelPeriodo} días`} />
            <StatChip label="Ventas BLU" icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" value={money(resumen.ventas)} hint={`${resumen.diasConVentas} días con venta`} />
            <StatChip label="Vs. esperado" icon={<Target className="h-3.5 w-3.5" />} color={cumplimiento == null ? undefined : cumplimiento >= 100 ? "bg-success" : cumplimiento >= 70 ? "bg-warning" : "bg-destructive"}
              value={cumplimiento == null ? "—" : `${Math.round(cumplimiento)}%`} hint={resumen.esperado > 0 ? `meta ${money(resumen.esperado)}` : "sin meta"} />
            <StatChip label="Horas" icon={<Clock className="h-3.5 w-3.5" />} value={resumen.horas ? resumen.horas.toFixed(0) : "—"} hint="Hubstaff" />
            <StatChip label="Masivos" icon={<Megaphone className="h-3.5 w-3.5" />} value={resumen.masivos} hint={resumen.masivosConversion == null ? undefined : `${resumen.masivosConversion.toFixed(1)}% conversión`} />
            <StatChip label="Mejor día" icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success"
              value={resumen.mejorDia ? money(resumen.mejorDia.ventas) : "—"} hint={resumen.mejorDia ? format(fechaDe(resumen.mejorDia.dia), "EEE d", { locale: es }) : undefined} />
          </div>
        )}

        {/* Fila 1: hoy (turno, creadoras, descanso) + ventas por día */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className={cardTitle}>Hoy</CardTitle>
              <CardDescription>{miGrupo ? `${miGrupo.name} · ${miGrupo.agency === "plus" ? "Plus" : "Massive"}` : "Tu turno y tus creadoras"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!miFila ? (
                <p className="text-sm text-muted-foreground">{identidad.isLoading ? "…" : "Todavía no estás en un grupo de horarios. Cuando un supervisor te asigne, acá vas a ver tu turno, tus creadoras y tu descanso."}</p>
              ) : (
                <>
                  <div>
                    <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Tus creadoras · {misCreadoras.length}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {misCreadoras.map((c) => {
                        const url = urlCreadora(c);
                        const cls = "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px]";
                        return url
                          ? <Link key={c.id} to={url} className={cn(cls, "hover:border-primary/40 hover:bg-primary/5")}>@{c.creator_handle}</Link>
                          : <span key={c.id} className={cn(cls, "text-muted-foreground")} title="Sin ficha en Maven">@{c.creator_handle}</span>;
                      })}
                      {misCreadoras.length === 0 && <span className="text-sm text-muted-foreground">Sin creadoras cargadas.</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Descanso de la semana</p>
                      <p className="text-sm font-semibold">{descansoSemana ? etiquetaDia(semanaHoy, descansoSemana.weekday) : "Sin cargar"}</p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">{descansoSemana?.covered_by_identity_id ? <>Te cubre<br /><span className="text-foreground">{nombres[descansoSemana.covered_by_identity_id] ?? "…"}</span></> : descansoSemana ? "Sin cobertura" : ""}</p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="w-full justify-between"><Link to="/chatters/horarios">Ver mi semana <ChevronRight className="h-4 w-4" /></Link></Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className={cardTitle}>Ventas por día</CardTitle>
              <CardDescription>Barras: lo que vendiste · línea: lo esperado por tus modelos</CardDescription>
            </CardHeader>
            <CardContent>
              {serie.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Sin días calculados en este rango.</p> : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serie} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid {...CHART_GRID} />
                      <XAxis dataKey="etiqueta" {...CHART_AXIS} />
                      <YAxis {...CHART_AXIS} tickFormatter={(v) => `$${v}`} />
                      <Tooltip content={<MavenTooltip formatter={(v: number) => money(v)} labelFormatter={(l: string, p: Array<{ payload?: { dia: string } }>) => p?.[0]?.payload?.dia ?? l} />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                      <Bar dataKey="ventas" name="Ventas" fill={CHART_COLOR.azul} radius={[4, 4, 0, 0]} maxBarSize={22} />
                      <Line type="monotone" dataKey="esperado" name="Esperado" stroke={CHART_COLOR.ambar} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fila 2: calendario de movimiento + detalle del día + ranking */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className={cardTitle}>Calendario de movimiento</CardTitle>
                  <CardDescription>Cada día con el color de su nota. Tocá uno para ver el detalle.</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-success/50" />≥8</span>
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-warning/50" />6–8</span>
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-destructive/50" />&lt;6</span>
                  <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm border border-dashed border-border" />descanso</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6">
              {meses.map((m) => (
                <CalendarioMovimiento key={m.toISOString()} mes={m} dias={dias} descansos={misDescansos} desde={desde} hasta={hasta} diaSel={diaSel} onDia={setDiaSel} hoy={hoy} />
              ))}
              <div className="min-w-[220px] flex-1 border-l pl-6">
                {diaSel ? (
                  <DetalleDia dia={diaSel} fila={diaDetalle} identityId={yo} libre={misDescansos.some((r) => { const d = fechaDe(r.week_start); d.setDate(d.getDate() + r.weekday); return isoDe(d) === diaSel; })} />
                ) : (
                  <div className="flex h-full min-h-[120px] items-center text-sm text-muted-foreground">Elegí un día para ver qué vendiste, cuántas horas hiciste y cómo salió la nota.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className={cardTitle}>Tus mejores creadoras</CardTitle>
              <CardDescription>Lo que vendiste con cada una, según BLU</CardDescription>
            </CardHeader>
            <CardContent>
              {modelos.isLoading ? <Skeleton className="h-24 w-full" /> : !modelos.data?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas cruzadas con creadoras en este rango.</p>
              ) : (() => {
                const total = modelos.data.reduce((s, m) => s + m.sales, 0) || 1;
                const medalla = ["text-amber-500", "text-slate-400", "text-amber-700"];
                return (
                  <ol className="space-y-2">
                    {modelos.data.slice(0, 8).map((m, i) => (
                      <li key={m.blu_model_id} className="flex items-center gap-3 text-sm">
                        <span className={cn("w-5 text-center font-display font-bold tabular-nums", i < 3 ? medalla[i] : "text-muted-foreground")}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-medium">{m.model_name ?? `Modelo ${m.blu_model_id}`}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{money(m.sales)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${Math.max(2, (100 * m.sales) / total)}%` }} /></div>
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </CardContent>
          </Card>
        </div>
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
        <p className="text-sm font-semibold capitalize leading-tight">{fecha}</p>
        {libre && <Badge variant="outline" className="mt-1 gap-1 border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"><CalendarOff className="h-3 w-3" /> Descanso</Badge>}
      </div>
      {!fila ? (
        <p className="text-sm text-muted-foreground">{libre ? "Era tu día de descanso: no se esperaba venta." : "De este día todavía no hay nota calculada."}</p>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Nota</p>
              <p className={cn("mt-1 inline-block rounded-lg border px-2 py-0.5 text-lg font-bold tabular-nums", tonoDeNota(fila.nota))}>{fila.nota == null ? "—" : fila.nota.toFixed(1)}</p></div>
            <div className="text-right"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ventas</p>
              <p className="text-lg font-bold tabular-nums">{money(fila.ventas)}</p>
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

