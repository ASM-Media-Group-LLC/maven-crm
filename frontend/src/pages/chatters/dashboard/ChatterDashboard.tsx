import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, ArrowRight, CalendarOff, ChevronRight, Clock, DollarSign, Gauge, Megaphone, Moon, Sparkles, Sun, Sunset, Target, TrendingUp, Timer } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StatChip from "@/components/StatChip";
import { useMiTiempoCowork, resumirTiempoCowork, pieTiempoCowork } from "@/hooks/useMiTiempoCowork";
import DateRangePresets, { rangeForPreset, type DateRange, type RangePreset } from "@/components/dashboard/DateRangePresets";
import { CHART_AXIS, CHART_COLOR, CHART_GRID } from "@/lib/chartTheme";
import { MavenTooltip } from "@/components/charts/MavenTooltip";
import { useMyProfile } from "@/hooks/useUserProfile";
import { cn } from "@/lib/utils";
import { money, tonoDeNota, useDiasDeChatter, useModelosDelDia, NOMBRE_FALTANTE } from "@/pages/chatters/useChatterRendimiento";
import { useDescansos, useMiIdentidad, useNombres, useRoster } from "@/pages/chatters/horarios/useHorarios";
import { TURNOS, diaSemanaDe, etiquetaDia, fechaDe, isoDe, lunesDe, sumarDias, urlCreadora } from "@/pages/chatters/horarios/types";
import { TurnoBadge } from "@/pages/chatters/horarios/MiSemana";
import SemanaViva from "./SemanaViva";
import { useResumenChatter, useVentasPorModelo } from "./useChatterDashboard";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";

// DASHBOARD DEL CHATTER. Lo que una persona del equipo de chat quiere ver al
// entrar: su turno de hoy y sus creadoras, cómo le fue en el rango elegido
// (nota Maven, ventas BLU, horas), el mes día por día, y su descanso.
// Todo sale de tablas que RLS ya le deja leer sobre sí misma.
const SIN_DIAS: never[] = []; // default estable: un `[]` inline cambia por render

export default function ChatterDashboard({ hoy = new Date() }: { hoy?: Date }) {
  const { data: perfil } = useMyProfile();
  const identidad = useMiIdentidad();
  const yo = identidad.data ?? null;

  // Rango inicial: los últimos 30 días. "Este mes" el día 3 deja el tablero
  // casi vacío; 30 días siempre muestran trabajo.
  const [range, setRange] = useState<DateRange>(() => { const r = rangeForPreset("today", hoy); return { from: fechaDe(sumarDias(isoDe(hoy), -29)), to: r.to }; });
  const [preset, setPreset] = useState<RangePreset | null>(null);
  const desde = isoDe(range.from), hasta = isoDe(range.to);
  const diasDelPeriodo = differenceInCalendarDays(range.to, range.from) + 1;
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const { dias, resumen, cargando } = useResumenChatter(yo, desde, hasta, diasDelPeriodo);
  const { dias: diasCowork, cargando: coworkCargando } = useMiTiempoCowork(desde, hasta);
  const cowork = useMemo(() => resumirTiempoCowork(diasCowork), [diasCowork]);
  const modelos = useVentasPorModelo(yo, desde, hasta);

  // Horario: mi grupo, mis creadoras, mis descansos del mes visible.
  const { grupos, miembros, creadoras } = useRoster();
  const miFila = miembros.find((m) => m.identity_id === yo) ?? null;
  const miGrupo = miFila ? grupos.find((g) => g.id === miFila.group_id) ?? null : null;
  const misCreadoras = useMemo(() => creadoras.filter((c) => miFila && c.group_id === miFila.group_id), [creadoras, miFila]);
  const semanaHoy = lunesDe(hoy);
  // La semana en curso se pide aparte: no depende del rango elegido arriba.
  const diasSemana = useDiasDeChatter(yo, semanaHoy, sumarDias(semanaHoy, 6));
  const descansos = useDescansos(lunesDe(fechaDe(desde)), lunesDe(fechaDe(hasta)) > sumarDias(semanaHoy, 7) ? lunesDe(fechaDe(hasta)) : sumarDias(semanaHoy, 7));
  const misDescansos = (descansos.data ?? []).filter((d) => d.identity_id === yo);
  const descansoSemana = misDescansos.find((d) => d.week_start === semanaHoy) ?? null;
  const hoyLibre = descansoSemana?.weekday === diaSemanaDe(hoy);
  const nombres = useNombres([descansoSemana?.covered_by_identity_id ?? ""]);

  const nombre = perfil?.full_name?.split(" ")[0] ?? "";
  const fechaLarga = format(hoy, "EEEE d 'de' MMMM", { locale: es });

  // La serie cubre TODOS los días del rango (los sin nota van en blanco): con
  // "Este mes" el día 3 se ve el mes entero con lo que va, no dos barras
  // flotando en un gráfico vacío.
  const serie = useMemo(() => {
    const porDia = new Map(dias.map((d) => [d.dia, d]));
    const out: Array<{ dia: string; etiqueta: string; ventas: number | null; esperado: number | null }> = [];
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      const f = porDia.get(d);
      out.push({ dia: d, etiqueta: String(fechaDe(d).getDate()), ventas: f ? Number(f.ventas ?? 0) : null, esperado: f?.ventas_esperadas != null ? Number(f.ventas_esperadas) : null });
    }
    return out;
  }, [dias, desde, hasta]);
  const diasConDato = serie.filter((d) => d.ventas != null);
  const cumplimiento = resumen.esperado > 0 ? (100 * resumen.ventas) / resumen.esperado : null;
  const diaDetalle = diaSel ? [...dias, ...(diasSemana.data ?? [])].find((d) => d.dia === diaSel) ?? null : null;

  const cardTitle = "text-base font-semibold";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Mismo encabezado que el dashboard general */}
      <header className="shrink-0 border-b border-white/10 bg-background/30 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <SelectorDeTablero actual="chatter" titulo={nombre ? `Hola, ${nombre}` : "Tu día"} clase="text-2xl font-bold tracking-tight" />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            <StatChip label="Nota Maven" icon={<Gauge className="h-3.5 w-3.5" />} value={resumen.notaPromedio == null ? "—" : resumen.notaPromedio.toFixed(1)}
              color={resumen.notaPromedio == null ? undefined : resumen.notaPromedio >= 8 ? "bg-success" : resumen.notaPromedio >= 6 ? "bg-warning" : "bg-destructive"}
              hint={resumen.notaPromedio == null ? "sin datos" : `${resumen.diasConNota} de ${diasDelPeriodo} días`} />
            <StatChip label="Ventas BLU" icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" value={money(resumen.ventas)} hint={`${resumen.diasConVentas} días con venta`} />
            <StatChip label="Vs. esperado" icon={<Target className="h-3.5 w-3.5" />} color={cumplimiento == null ? undefined : cumplimiento >= 100 ? "bg-success" : cumplimiento >= 70 ? "bg-warning" : "bg-destructive"}
              value={cumplimiento == null ? "—" : `${Math.round(cumplimiento)}%`} hint={resumen.esperado > 0 ? `meta ${money(resumen.esperado)}` : "sin meta"} />
            <StatChip label="Horas" icon={<Clock className="h-3.5 w-3.5" />} value={resumen.horas ? resumen.horas.toFixed(0) : "—"} hint="Hubstaff" />
            {/* El reloj de Cowork (cámara + pantalla, presente): el dato que va a
                reemplazar a Hubstaff. Conviven mientras dure la transición. */}
            <StatChip label="Cowork" icon={<Timer className="h-3.5 w-3.5" />} color="bg-violet-500"
              value={cowork.horas > 0 ? cowork.horas.toFixed(0) : "—"} hint={pieTiempoCowork(cowork, coworkCargando)} />
            <StatChip label="Productividad" icon={<Activity className="h-3.5 w-3.5" />} value={resumen.actividad == null ? "—" : `${Math.round(resumen.actividad)}%`}
              color={resumen.actividad == null ? undefined : resumen.actividad >= 60 ? "bg-success" : resumen.actividad >= 40 ? "bg-warning" : "bg-destructive"} hint="actividad Hubstaff" />
            <StatChip label="Masivos" icon={<Megaphone className="h-3.5 w-3.5" />} value={resumen.masivos} hint={resumen.masivosConversion == null ? undefined : `${resumen.masivosConversion.toFixed(1)}% conversión`} />
            <StatChip label="Mejor día" icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success"
              value={resumen.mejorDia ? money(resumen.mejorDia.ventas) : "—"} hint={resumen.mejorDia ? format(fechaDe(resumen.mejorDia.dia), "EEE d", { locale: es }) : undefined} />
          </div>
        )}

        {/* Fila 1: hoy (turno, creadoras, descanso) + ventas por día */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="relative overflow-hidden border-primary/25 transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/40">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
            <CardContent className="space-y-4 p-5">
              {!miFila ? (
                <p className="text-sm text-muted-foreground">{identidad.isLoading ? "…" : "Todavía no estás en un grupo de horarios. Cuando un supervisor te asigne, acá vas a ver tu turno, tus creadoras y tu descanso."}</p>
              ) : (
                <>
                  <TurnoHero shift={miFila.shift} hoy={hoy} libre={hoyLibre} grupo={miGrupo ? `${miGrupo.name} · ${miGrupo.agency === "plus" ? "Plus" : "Massive"}` : ""} />
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Tus creadoras · {misCreadoras.length}</p>
                    <ul className="space-y-1">
                      {misCreadoras.map((c) => {
                        const url = urlCreadora(c);
                        const fila = (
                          <>
                            <Inicial nombre={c.creator_handle} />
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">@{c.creator_handle}</span>
                            {c.mad && <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-500 dark:text-slate-300">mad</span>}
                            {url ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /> : <span className="text-[9px] text-muted-foreground">sin ficha</span>}
                          </>
                        );
                        return (
                          <li key={c.id}>
                            {url ? <Link to={url} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-primary/10">{fila}</Link>
                                 : <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-muted-foreground">{fila}</div>}
                          </li>
                        );
                      })}
                      {misCreadoras.length === 0 && <li className="text-sm text-muted-foreground">Sin creadoras cargadas.</li>}
                    </ul>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-orange-500/25 bg-orange-500/5 px-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400"><CalendarOff className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tu descanso</p>
                      <p className="text-sm font-semibold">{descansoSemana ? etiquetaDia(semanaHoy, descansoSemana.weekday) : "Sin cargar"}</p>
                    </div>
                    {descansoSemana && <p className="text-right text-xs text-muted-foreground">{descansoSemana.covered_by_identity_id ? <>Te cubre<br /><span className="font-medium text-foreground">{nombres[descansoSemana.covered_by_identity_id] ?? "…"}</span></> : "Sin cobertura"}</p>}
                  </div>
                  <Button asChild variant="ghost" size="sm" className="w-full justify-between"><Link to="/chatters/horarios">Ver mi semana completa <ChevronRight className="h-4 w-4" /></Link></Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col lg:col-span-2 transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className={cardTitle}>Ventas por día</CardTitle>
                  <CardDescription>Verde: superaste lo esperado por tus modelos · azul: por debajo · línea punteada: la meta</CardDescription>
                </div>
                {diasConDato.length > 0 && (
                  <div className="flex gap-4 text-right">
                    <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Promedio</p><p className="font-display text-lg font-bold tabular-nums leading-tight">{money(resumen.ventas / Math.max(1, diasConDato.length))}<span className="text-xs font-normal text-muted-foreground">/día</span></p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sobre la meta</p><p className="font-display text-lg font-bold tabular-nums leading-tight text-success">{diasConDato.filter((d) => (d.esperado ?? 0) > 0 && (d.ventas ?? 0) >= (d.esperado ?? 0)).length}<span className="text-xs font-normal text-muted-foreground"> de {diasConDato.length}</span></p></div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {diasConDato.length === 0 ? <p className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">Sin días calculados en este rango.</p> : (
                <div className="min-h-[220px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serie} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLOR.azul} stopOpacity={1} /><stop offset="100%" stopColor={CHART_COLOR.azul} stopOpacity={0.45} /></linearGradient>
                        <linearGradient id="gMeta" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={1} /><stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.45} /></linearGradient>
                      </defs>
                      <CartesianGrid {...CHART_GRID} />
                      <XAxis dataKey="etiqueta" {...CHART_AXIS} interval={serie.length > 16 ? 1 : 0} />
                      <YAxis {...CHART_AXIS} tickFormatter={(v) => `$${v}`} />
                      <Tooltip content={<MavenTooltip formatter={(v: number) => money(v)} labelFormatter={(l: string, p: Array<{ payload?: { dia: string } }>) => p?.[0]?.payload?.dia ?? l} />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                      <Bar dataKey="ventas" name="Ventas" radius={[6, 6, 0, 0]} maxBarSize={26}>
                        {serie.map((d) => <Cell key={d.dia} fill={(d.esperado ?? 0) > 0 && (d.ventas ?? 0) >= (d.esperado ?? 0) ? "url(#gMeta)" : "url(#gVentas)"} />)}
                        <LabelList dataKey="ventas" position="top" formatter={(v: number | null) => (v != null && diasConDato.length <= 16 && v > 0 ? `$${Math.round(v)}` : "")} style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      </Bar>
                      <Line type="monotone" dataKey="esperado" name="Esperado" stroke={CHART_COLOR.ambar} strokeWidth={2} dot={false} strokeDasharray="5 4" connectNulls />
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
                  <CardTitle className={cardTitle}>Tu semana</CardTitle>
                  <CardDescription>Cada día con su nota, sus ventas y cuánto de la meta cubriste. Tocá uno para el detalle.</CardDescription>
                </div>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <SemanaViva dias={diasSemana.data ?? SIN_DIAS} descansos={misDescansos} shift={miFila?.shift ?? null} hoy={hoy} diaSel={diaSel} onDia={setDiaSel} />
              {diaSel && (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <DetalleDia dia={diaSel} fila={diaDetalle} identityId={yo} libre={misDescansos.some((r) => { const d = fechaDe(r.week_start); d.setDate(d.getDate() + r.weekday); return isoDe(d) === diaSel; })} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="transition-all duration-300 hover:translate-y-[-2px] hover:border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className={cardTitle}>Tus mejores creadoras</CardTitle>
              <CardDescription>Con quién vendés más en el rango, según BLU</CardDescription>
            </CardHeader>
            <CardContent>
              {modelos.isLoading ? <Skeleton className="h-24 w-full" /> : !modelos.data?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas cruzadas con creadoras en este rango.</p>
              ) : (() => {
                const lista = modelos.data;
                const total = lista.reduce((s, m) => s + m.sales, 0) || 1;
                const [top, ...resto] = lista;
                const max = top.sales || 1;
                return (
                  <div className="space-y-3">
                    {/* Podio: la número 1 con foco propio */}
                    <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent p-3">
                      <div className="flex items-center gap-3">
                        <Inicial nombre={top.model_name ?? "?"} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-500">Tu #1</p>
                          <p className="truncate font-display text-base font-bold leading-tight">{top.model_name ?? `Modelo ${top.blu_model_id}`}</p>
                          <p className="text-xs text-muted-foreground">{top.fans.toLocaleString("es")} fans · {top.dias} {top.dias === 1 ? "día" : "días"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xl font-extrabold tabular-nums leading-none">{money(top.sales)}</p>
                          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{Math.round((100 * top.sales) / total)}% de tus ventas</p>
                        </div>
                      </div>
                    </div>
                    <ol className="space-y-1">
                      {resto.slice(0, 7).map((m, i) => (
                        <li key={m.blu_model_id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/40">
                          <span className={cn("w-4 text-center text-xs font-bold tabular-nums", i === 0 ? "text-slate-400" : i === 1 ? "text-amber-700" : "text-muted-foreground")}>{i + 2}</span>
                          <Inicial nombre={m.model_name ?? "?"} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium">{m.model_name ?? `Modelo ${m.blu_model_id}`}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums">{money(m.sales)}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-gradient-to-r from-primary/80 to-primary/40" style={{ width: `${Math.max(3, (100 * m.sales) / max)}%` }} /></div>
                              <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round((100 * m.sales) / total)}%</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

// Avatar de inicial con un color estable por nombre (no hay fotos de las
// cuentas de OF en Maven, y el gris uniforme mataba la lista).
const TONOS_AVATAR = ["from-pink-500/40 to-rose-500/10", "from-violet-500/40 to-indigo-500/10", "from-sky-500/40 to-cyan-500/10", "from-emerald-500/40 to-teal-500/10", "from-amber-500/40 to-orange-500/10", "from-fuchsia-500/40 to-purple-500/10"];
function Inicial({ nombre, size = "sm" }: { nombre: string; size?: "sm" | "lg" }) {
  let h = 0; for (const ch of nombre.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br font-display font-bold uppercase", TONOS_AVATAR[h % TONOS_AVATAR.length], size === "lg" ? "h-11 w-11 text-base" : "h-7 w-7 text-[11px]")}>
      {nombre.replace(/^@/, "").charAt(0)}
    </span>
  );
}

// Cabecera del turno: qué turno es, cuánto va, y si hoy es descanso.
const HORAS_TURNO: Record<string, [number, number]> = { am: [8, 16], pm: [16, 24], mad: [0, 8] };
function TurnoHero({ shift, hoy, libre, grupo }: { shift: "am" | "pm" | "mad"; hoy: Date; libre: boolean; grupo: string }) {
  const [ini, fin] = HORAS_TURNO[shift];
  const ahora = hoy.getHours() + hoy.getMinutes() / 60;
  const avance = Math.max(0, Math.min(1, (ahora - ini) / (fin - ini)));
  const estado = libre ? "Hoy descansás" : ahora < ini ? `Empieza a las ${String(ini).padStart(2, "0")}:00` : ahora >= fin ? "Turno terminado" : `Llevás ${Math.floor(ahora - ini)} h de ${fin - ini}`;
  const Icono = shift === "am" ? Sun : shift === "pm" ? Sunset : Moon;
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", libre ? "bg-orange-500/15 text-orange-500" : "bg-primary/15 text-primary")}>
        {libre ? <CalendarOff className="h-6 w-6" /> : <Icono className="h-6 w-6" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="font-display text-lg font-bold leading-tight">{libre ? "Descanso" : `Turno ${TURNOS[shift].label}`}</p>
          {!libre && <span className="text-xs text-muted-foreground tabular-nums">{TURNOS[shift].horas}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{grupo}{grupo ? " · " : ""}{estado}</p>
        {!libre && ahora >= ini && ahora < fin && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${avance * 100}%` }} /></div>
        )}
      </div>
    </div>
  );
}

// Un día: ventas, esperado, horas y las tres notas que componen la final.
function DetalleDia({ dia, fila, identityId, libre }: { dia: string; fila: ReturnType<typeof useResumenChatter>["dias"][number] | null; identityId: string | null; libre: boolean }) {
  const modelos = useModelosDelDia(identityId, dia);
  const fecha = format(fechaDe(dia), "EEEE d 'de' MMMM", { locale: es });
  const faltan = fila?.detalle?.faltantes ?? [];
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr_1fr]">
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
            <Componente etiqueta={`Tiempo${fila.horas != null ? ` · ${fila.horas.toFixed(1)} h` : ""}${fila.detalle?.actividad_pct != null ? ` · ${Math.round(fila.detalle.actividad_pct)}% act.` : ""}`} nota={fila.nota_tiempo} peso="30%" />
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

