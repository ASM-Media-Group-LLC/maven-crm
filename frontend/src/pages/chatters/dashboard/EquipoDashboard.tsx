import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarOff, Clock, Crown, DollarSign, Gauge,
  Moon, Sun, Sunset, Timer, TrendingDown, Users, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import { isoDia, money, useChatterPeriodo, type ChatterPeriodo } from "@/pages/chatters/useChatterRendimiento";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PRESET_CONFIG, diasEntre, rangeForPreset, type RangePreset } from "@/lib/range-presets";
import { useDescansos, useNombres, useRoster } from "@/pages/chatters/horarios/useHorarios";
import { useEquipoTiempoCowork, sumarCoworkDelEquipo } from "@/hooks/useEquipoTiempoCowork";
import { TURNOS, diaSemanaDe, isoDe, lunesDe, type Shift } from "@/pages/chatters/horarios/types";
import FeedbackDialog from "./FeedbackDialog";

// DASHBOARD DEL SUPERVISOR DE CHATTERS — su casa al entrar a Maven.
//
// Responde las cuatro preguntas que hoy contesta abriendo tres pantallas:
// quién está en turno ahora, quién descansa, cómo va el equipo contra lo que
// se esperaba de él, y a quién hay que empujar.
//
// No trae data nueva: `chatter_dashboard_periodo` (la misma RPC de Chatters ·
// Rendimiento) y el roster de Horarios, que RLS ya le abre a nivel supervisor
// con el módulo Chatters. Nada de esto pasa por `blu_is_management`, que es lo
// que dejaba en blanco al Dashboard Ventas para este rol.

// Cada turno con su color: el tablero se lee de un vistazo por bloques.
const TURNO_ESTILO: Record<Shift, { icono: typeof Sun; texto: string; punto: string; tinte: string }> = {
  am:  { icono: Sun,    texto: "text-amber-500",  punto: "bg-amber-500",  tinte: "from-amber-500/10" },
  pm:  { icono: Sunset, texto: "text-violet-400", punto: "bg-violet-500", tinte: "from-violet-500/10" },
  mad: { icono: Moon,   texto: "text-sky-400",    punto: "bg-sky-500",    tinte: "from-sky-500/10" },
};

const MEDALLA = ["bg-amber-400/90 text-amber-950", "bg-zinc-300/80 text-zinc-800", "bg-orange-700/80 text-orange-50"];

const pct = (real: number, esperado: number) => (esperado > 0 ? Math.round((100 * real) / esperado) : null);

/** Color del cumplimiento: verde llegó, ámbar cerca, rojo lejos. */
const tonoCumplimiento = (p: number | null) =>
  p == null ? { texto: "text-muted-foreground", barra: "bg-muted-foreground/40", hero: "from-primary/15" }
  : p >= 100 ? { texto: "text-emerald-500", barra: "bg-emerald-500", hero: "from-emerald-500/20" }
  : p >= 70 ? { texto: "text-amber-500", barra: "bg-amber-500", hero: "from-amber-500/20" }
  : { texto: "text-red-500", barra: "bg-red-500", hero: "from-red-500/20" };

const tonoNota = (nota: number | null) =>
  nota == null ? { texto: "text-muted-foreground", anillo: "ring-border", punto: "bg-muted-foreground/40" }
  : nota >= 8 ? { texto: "text-emerald-500", anillo: "ring-emerald-500/30", punto: "bg-emerald-500" }
  : nota >= 6 ? { texto: "text-amber-500", anillo: "ring-amber-500/30", punto: "bg-amber-500" }
  : { texto: "text-red-500", anillo: "ring-red-500/30", punto: "bg-red-500" };

type Orden = "nota" | "ventas";

// Tarjeta de KPI con esquina degradada e icono en cuadrado de color — el mismo
// lenguaje que Panel de Control y el Dashboard Ventas.
function Kpi({
  label, valor, pie, icono: Icono, color, tinte, barra,
}: {
  label: string; valor: string; pie?: React.ReactNode; icono: typeof Users;
  color: string; tinte: string; barra?: { pct: number; clase: string };
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-4 ring-1 ring-white/5 transition-transform", "bg-gradient-to-br to-transparent", tinte)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", color)}>
          <Icono className="h-4 w-4 text-white" />
        </span>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none tabular-nums">{valor}</p>
      {pie != null && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{pie}</p>}
      {barra && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full transition-[width] duration-700", barra.clase)} style={{ width: `${Math.min(100, Math.max(3, barra.pct))}%` }} />
        </div>
      )}
    </div>
  );
}

// Clickeable cuando hay `onClick`: abre el feedback del TL de esa persona.
function Persona({ nombre, extra, onClick }: { nombre: string; extra?: string; onClick?: () => void }) {
  const contenido = (
    <>
      <UserAvatar name={nombre} size="xs" />
      <span className="font-medium">{nombre}</span>
      {extra && <span className="text-muted-foreground">· {extra}</span>}
    </>
  );
  const clases = "inline-flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-2.5 text-xs ring-1 ring-white/5 transition-colors hover:bg-white/10";
  if (!onClick) return <span className={clases}>{contenido}</span>;
  return (
    <button type="button" onClick={onClick} title="Registrar feedback" className={`${clases} hover:ring-primary/40`}>
      {contenido}
    </button>
  );
}

export default function EquipoDashboard() {
  const [orden, setOrden] = useState<Orden>("nota");
  // Chatter cuyo feedback está abierto (clic en el nombre en "Hoy en turno").
  const [feedbackDe, setFeedbackDe] = useState<{ id: string; nombre: string } | null>(null);
  // Mismo control de rango que el Dashboard Ventas: pills + calendario
  // (pedido de Jhon). Arranca en "Esta semana" porque el roster y los
  // descansos de Horarios son semanales.
  const [rango, setRango] = useState<{ from: Date; to: Date }>(() => rangeForPreset("this_week", new Date()));
  const [preset, setPreset] = useState<RangePreset | null>("this_week");

  const desde = isoDia(rango.from);
  const hasta = isoDia(rango.to);
  const periodo = useChatterPeriodo(desde, hasta);
  const { grupos, miembros, cargando: rosterCargando } = useRoster();
  const semana = useMemo(() => lunesDe(new Date()), []);
  // Las semanas que toca el rango elegido. Antes se pedía solo la actual, así
  // que mirando "ayer" a un lunes —o cualquier rango de otra semana— no se
  // sabía quién descansaba.
  const descansos = useDescansos(lunesDe(rango.from), lunesDe(rango.to));
  const nombres = useNombres([
    ...miembros.map((m) => m.identity_id),
    ...(descansos.data ?? []).map((d) => d.identity_id).filter(Boolean) as string[],
  ]);

  const filas = periodo.data ?? [];
  // El reloj de Cowork (cámara + pantalla, presente): el dato que va a
  // reemplazar a Hubstaff. Conviven mientras dure la transición.
  const { porPersona: coworkPorPersona, cargando: coworkCargando } = useEquipoTiempoCowork(desde, hasta);
  const cowork = useMemo(() => sumarCoworkDelEquipo(filas, coworkPorPersona), [filas, coworkPorPersona]);

  // ── Resumen del rango ────────────────────────────────────────────────────
  const resumen = useMemo(() => {
    const conNota = filas.filter((f) => f.dias_con_nota > 0 && f.nota_promedio != null);
    const ventas = filas.reduce((s, f) => s + Number(f.ventas_total ?? 0), 0);
    const esperado = filas.reduce((s, f) => s + Number(f.ventas_esperadas_total ?? 0), 0);
    const horas = filas.reduce((s, f) => s + Number(f.horas_total ?? 0), 0);
    // Promedio PONDERADO por días con nota: un chatter con 1 día no pesa lo
    // mismo que uno con 7.
    const diasTotales = conNota.reduce((s, f) => s + f.dias_con_nota, 0);
    const nota = diasTotales > 0
      ? conNota.reduce((s, f) => s + Number(f.nota_promedio) * f.dias_con_nota, 0) / diasTotales
      : null;
    return { ventas, esperado, horas, nota, conNota: conNota.length, total: filas.length, cumplimiento: pct(ventas, esperado) };
  }, [filas]);

  // ── Hoy: quién trabaja y quién descansa ──────────────────────────────────
  const hoy = useMemo(() => {
    const wd = diaSemanaDe(new Date());
    const deHoy = (descansos.data ?? []).filter((d) => d.week_start === semana && d.weekday === wd);
    const libres = new Set(deHoy.filter((d) => d.identity_id).map((d) => d.identity_id as string));
    const notas = new Set(deHoy.filter((d) => !d.identity_id && d.note).map((d) => d.note as string));
    const porTurno = new Map<Shift, Array<{ identity_id: string; grupo: string | undefined }>>();
    for (const m of miembros) {
      if (libres.has(m.identity_id)) continue;
      const lista = porTurno.get(m.shift) ?? [];
      lista.push({ identity_id: m.identity_id, grupo: grupos.find((g) => g.id === m.group_id)?.name });
      porTurno.set(m.shift, lista);
    }
    return { libres: [...libres], porTurno, notas: [...notas], enTurno: miembros.length - libres.size };
  }, [descansos.data, miembros, grupos, semana]);

  // ── Quién descansó TODO el rango ─────────────────────────────────────────
  // Pedido de Jhon: a quien descansó no se le pone nota, va el ícono de
  // descanso. Con un rango de un día esto es "descansó ese día"; con una
  // semana entra solo quien no trabajó ninguno de los días, porque a quien
  // trabajó tres sí le corresponde su nota por esos tres.
  //
  // Se exige que HAYA descanso cargado para cada día del rango: si de algún
  // día no sabemos nada, nadie queda marcado. Preferimos no poner el ícono
  // antes que poner uno inventado.
  const descansaronTodoElRango = useMemo(() => {
    const dias: Array<{ semana: string; wd: number }> = [];
    for (const d of diasEntre(desde, hasta)) {
      const f = new Date(`${d}T12:00:00`);
      dias.push({ semana: lunesDe(f), wd: diaSemanaDe(f) });
    }
    if (dias.length === 0) return new Set<string>();

    const porDia = dias.map(({ semana: sem, wd }) =>
      new Set(
        (descansos.data ?? [])
          .filter((r) => r.week_start === sem && r.weekday === wd && r.identity_id)
          .map((r) => r.identity_id as string),
      ),
    );
    // Intersección: quien aparece en todos los días del rango.
    return porDia.reduce((acc, hoyLibres) => {
      const siguen = new Set<string>();
      for (const id of acc) if (hoyLibres.has(id)) siguen.add(id);
      return siguen;
    }, porDia[0]);
  }, [descansos.data, desde, hasta]);

  // ── A quién empujar ──────────────────────────────────────────────────────
  // Tres motivos distintos, y se nombran: "flojo" y "sin datos" no son lo
  // mismo (ver chatter-dashboard-sin-datos: un 0 reparte notas injustas).
  const atencion = useMemo(() => {
    const flojos = filas.filter((f) => f.activo && f.nota_promedio != null && Number(f.nota_promedio) < 6 && f.dias_con_nota >= 2);
    const sinDatos = filas.filter((f) => f.activo && f.dias_con_nota === 0 && !descansaronTodoElRango.has(f.identity_id));
    const bajoMeta = filas.filter((f) => {
      if (!f.activo) return false;
      const p = pct(Number(f.ventas_total ?? 0), Number(f.ventas_esperadas_total ?? 0));
      return p != null && p < 70 && f.dias_con_nota >= 2;
    });
    // Un chip por PERSONA, no por motivo: quien viene flojo suele estar en dos
    // listas a la vez y parecían dos personas distintas.
    const porPersona = new Map<string, { nombre: string; motivos: string[]; nivel: 0 | 1 | 2 }>();
    const sumar = (f: ChatterPeriodo, motivo: string, nivel: 0 | 1 | 2) => {
      const p = porPersona.get(f.identity_id) ?? { nombre: f.display_name, motivos: [], nivel };
      p.motivos.push(motivo);
      p.nivel = Math.max(p.nivel, nivel) as 0 | 1 | 2;
      porPersona.set(f.identity_id, p);
    };
    for (const f of flojos) sumar(f, `nota ${Number(f.nota_promedio).toFixed(1)}`, 2);
    for (const f of bajoMeta) sumar(f, `${pct(Number(f.ventas_total ?? 0), Number(f.ventas_esperadas_total ?? 0))}% de su meta`, 1);
    for (const f of sinDatos) sumar(f, "sin datos · no es un cero", 0);
    return { gente: [...porPersona.entries()].sort((a, b) => b[1].nivel - a[1].nivel), hay: porPersona.size };
  }, [filas]);

  const ordenadas = useMemo(() => {
    const copia = [...filas];
    copia.sort((a, b) => {
      if (orden === "ventas") return Number(b.ventas_total ?? 0) - Number(a.ventas_total ?? 0);
      // Sin nota SIEMPRE al final: no es un cero, es que no hay dato.
      const na = a.nota_promedio == null ? -1 : Number(a.nota_promedio);
      const nb = b.nota_promedio == null ? -1 : Number(b.nota_promedio);
      return nb - na;
    });
    return copia;
  }, [filas, orden]);

  const maxVentas = Math.max(...filas.map((f) => Number(f.ventas_total ?? 0)), 1);
  // Puesto SOLO entre los activos: coronar a alguien que ya no está en el
  // equipo es la clase de detalle que hace desconfiar de todo el tablero.
  const puestos = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const f of ordenadas) if (f.activo) m.set(f.identity_id, i++);
    return m;
  }, [ordenadas]);
  const cargando = periodo.isLoading || rosterCargando;
  const tono = tonoCumplimiento(resumen.cumplimiento);

  return (
    <main className="flex-1 overflow-y-auto">
      {/* Encabezado teñido por cómo viene el equipo: verde llegó a la meta,
          ámbar cerca, rojo lejos. El estado se ve antes de leer un número. */}
      <div className={cn("sticky top-0 z-10 border-b border-white/10 bg-gradient-to-r via-background/60 to-background/60 px-4 py-3 backdrop-blur-xl md:px-6", tono.hero)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <Users className="h-4.5 w-4.5 text-primary" />
            </span>
            <div>
              <SelectorDeTablero actual="equipo" />
              <p className="text-[11px] text-muted-foreground">
                {resumen.total > 0 ? `${resumen.total} chatters` : "Sin chatters en el rango"}
                {resumen.cumplimiento != null && (
                  <> · <span className={cn("font-medium", tono.texto)}>{resumen.cumplimiento}% de la meta</span></>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-card/40 p-0.5">
              {PRESET_CONFIG.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setRango(rangeForPreset(p.key, new Date())); setPreset(p.key); }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    preset === p.key ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <DateRangePicker
              from={rango.from}
              to={rango.to}
              onApply={(from, to) => {
                if (!from || !to) return;   // "Todo" no aplica: el rango manda las consultas
                setRango({ from, to });
                setPreset(null);
              }}
              placeholder="Seleccionar rango"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        {/* ── KPIs del rango ── */}
        {cargando ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              label="Ventas del equipo"
              valor={money(resumen.ventas)}
              pie={resumen.esperado > 0 ? <>esperado {money(resumen.esperado)}</> : "sin meta calculada"}
              icono={DollarSign} color="bg-emerald-500" tinte="from-emerald-500/10"
            />
            <Kpi
              label="Cumplimiento"
              valor={resumen.cumplimiento != null ? `${resumen.cumplimiento}%` : "—"}
              pie="ventas contra lo esperado"
              icono={Gauge} color="bg-sky-500" tinte="from-sky-500/10"
              barra={resumen.cumplimiento != null ? { pct: resumen.cumplimiento, clase: tono.barra } : undefined}
            />
            <Kpi
              label="Nota promedio"
              valor={resumen.nota != null ? resumen.nota.toFixed(1) : "—"}
              // Honestidad: de cuántos hay dato. Un promedio de 3 de 19 no es
              // el promedio del equipo.
              pie={`${resumen.conNota} de ${resumen.total} con dato`}
              icono={Zap} color="bg-violet-500" tinte="from-violet-500/10"
              barra={resumen.nota != null ? { pct: (resumen.nota / 10) * 100, clase: tonoNota(resumen.nota).punto } : undefined}
            />
            <Kpi
              label="Horas"
              valor={Math.round(resumen.horas).toLocaleString("es")}
              pie="Hubstaff, todo el equipo"
              icono={Clock} color="bg-amber-500" tinte="from-amber-500/10"
            />
            <Kpi
              label="Cowork"
              valor={cowork.horas > 0 ? Math.round(cowork.horas).toLocaleString("es") : "—"}
              pie={cowork.personasConReloj > 0
                ? `reloj de Cowork · ${cowork.personasConReloj} de ${filas.length} con tiempo`
                : coworkCargando ? "cargando…" : "reloj de Cowork · sin tiempo en el rango"}
              icono={Timer} color="bg-violet-500" tinte="from-violet-500/10"
            />
          </div>
        )}

        {/* ── HOY ── */}
        <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5 lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <h2 className="text-sm font-semibold">Hoy en turno</h2>
              <Badge variant="outline" className="rounded-full text-[10px]">{hoy.enTurno} de {miembros.length}</Badge>
            </div>
            {rosterCargando ? (
              <div className="space-y-2 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
            ) : hoy.porTurno.size === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nadie asignado en el roster vigente.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {(["am", "pm", "mad"] as Shift[]).map((t) => {
                  const gente = hoy.porTurno.get(t) ?? [];
                  if (gente.length === 0) return null;
                  const e = TURNO_ESTILO[t];
                  return (
                    <div key={t} className={cn("bg-gradient-to-r to-transparent px-4 py-3", e.tinte)}>
                      <p className={cn("mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide", e.texto)}>
                        <e.icono className="h-3.5 w-3.5" /> {TURNOS[t].label}
                        <span className="font-normal text-muted-foreground">{TURNOS[t].horas}</span>
                        <span className="ml-auto font-normal text-muted-foreground">{gente.length}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {gente.map((p) => (
                          <Persona
                            key={p.identity_id}
                            nombre={nombres[p.identity_id] ?? "…"}
                            extra={p.grupo}
                            onClick={() => setFeedbackDe({ id: p.identity_id, nombre: nombres[p.identity_id] ?? "Chatter" })}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <CalendarOff className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Descansan hoy</h2>
              {hoy.libres.length > 0 && <Badge variant="outline" className="rounded-full text-[10px]">{hoy.libres.length}</Badge>}
            </div>
            <div className="p-4">
              {hoy.libres.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nadie descansa hoy.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {hoy.libres.map((id) => (
                    <Persona key={id} nombre={nombres[id] ?? "…"}
                      onClick={() => setFeedbackDe({ id, nombre: nombres[id] ?? "Chatter" })} />
                  ))}
                </div>
              )}
              {hoy.notas.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                  {hoy.notas.map((n) => (
                    <p key={n} className="flex items-start gap-1.5 text-[11px] text-amber-500">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{n}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── A QUIÉN EMPUJAR — una ficha por persona, con el motivo ── */}
        {!cargando && atencion.hay > 0 && (
          <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500">
                <AlertTriangle className="h-4 w-4 text-white" />
              </span>
              <h2 className="text-sm font-semibold">A quién empujar</h2>
              <Badge variant="outline" className="rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-500">{atencion.hay}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {atencion.gente.map(([id, p]) => (
                <Motivo
                  key={id}
                  nombre={p.nombre}
                  detalle={p.motivos.join(" · ")}
                  icono={p.nivel === 2 ? TrendingDown : p.nivel === 1 ? Gauge : AlertTriangle}
                  clase={p.nivel === 2 ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : p.nivel === 1 ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                    : "border-white/10 bg-white/5 text-muted-foreground"}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── EQUIPO ── */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <h2 className="text-sm font-semibold">Equipo</h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-card/50 p-0.5">
                {([["nota", "Por nota"], ["ventas", "Por ventas"]] as Array<[Orden, string]>).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setOrden(k)}
                    className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      orden === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                    {l}
                  </button>
                ))}
              </div>
              {/* `back` para que Rendimiento pueda ofrecer "volver al dashboard". */}
              <Link to="/chatter-evaluator/rendimiento?back=/dashboard" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Ver rendimiento <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          {cargando ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : ordenadas.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Sin datos del equipo en este rango.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {ordenadas.map((f) => (
                <Fila key={f.identity_id} f={f} puesto={puestos.get(f.identity_id) ?? null}
                  coworkHoras={f.maven_user_id ? coworkPorPersona.get(f.maven_user_id)?.horas : undefined}
                  maxVentas={maxVentas} descanso={descansaronTodoElRango.has(f.identity_id)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Feedback del TL: suma o resta a la nota del día. */}
      <FeedbackDialog
        identityId={feedbackDe?.id ?? null}
        nombre={feedbackDe?.nombre ?? ""}
        dia={isoDe(new Date())}
        desde={desde}
        hasta={hasta}
        onClose={() => setFeedbackDe(null)}
      />
    </main>
  );
}

function Motivo({ nombre, detalle, icono: Icono, clase }: { nombre: string; detalle: string; icono: typeof Gauge; clase: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3 text-xs", clase)}>
      <UserAvatar name={nombre} size="xs" />
      <span className="font-medium text-foreground">{nombre}</span>
      <span className="inline-flex items-center gap-1"><Icono className="h-3 w-3" />{detalle}</span>
    </span>
  );
}

function Fila({ f, puesto, maxVentas, descanso, coworkHoras }: { f: ChatterPeriodo; puesto: number | null; maxVentas: number; descanso: boolean; coworkHoras?: number }) {
  const cumplimiento = pct(Number(f.ventas_total ?? 0), Number(f.ventas_esperadas_total ?? 0));
  const nota = f.nota_promedio == null ? null : Number(f.nota_promedio);
  const tn = tonoNota(nota);
  const ventas = Number(f.ventas_total ?? 0);
  return (
    <li className={cn("relative px-4 py-2.5 transition-colors hover:bg-white/[0.03]", puesto === 0 && "bg-white/[0.03]", !f.activo && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          puesto != null ? MEDALLA[puesto] ?? "bg-white/5 text-muted-foreground" : "bg-white/5 text-muted-foreground/50")}>
          {puesto === 0 ? <Crown className="h-3 w-3" /> : puesto != null ? puesto + 1 : "·"}
        </span>
        <UserAvatar name={f.display_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium leading-tight">
            {f.display_name}
            {!f.activo && (
              <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground">
                inactivo
              </span>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {f.dias_con_nota > 0
              ? `${f.dias_con_nota} de ${f.dias_del_periodo} días con dato`
              : descanso ? "descansó" : "sin datos en el rango"}
            {f.modelos_distintas > 0 && ` · ${f.modelos_distintas} modelo${f.modelos_distintas === 1 ? "" : "s"}`}
            {f.horas_total != null && ` · ${Math.round(Number(f.horas_total))} h`}
            {coworkHoras != null && coworkHoras > 0 && ` · Cowork ${Math.round(coworkHoras)} h`}
            {/* El feedback del TL ya está dentro de la nota; acá se dice cuánto
                de ella es feedback, para que nadie tenga que adivinarlo. */}
            {!!f.feedback_n && (
              <span className={Number(f.feedback_puntos) < 0 ? "text-red-400" : "text-emerald-500"}>
                {" "}· feedback {Number(f.feedback_puntos) > 0 ? "+" : ""}{Number(f.feedback_puntos)}
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-sm font-bold tabular-nums leading-tight">{money(f.ventas_total)}</p>
          {cumplimiento != null && (
            <p className={cn("text-[11px] tabular-nums", tonoCumplimiento(cumplimiento).texto)}>
              {cumplimiento}% de su meta
            </p>
          )}
        </div>
        {/* La nota como anillo de color: el número importa, el color se lee
            antes. Y a quien descansó no se le pone nota: va el ícono de
            descanso, porque un "—" al lado de los demás se lee como si
            hubiera trabajado y no hubiera dato. */}
        {descanso ? (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-white/10 bg-white/[0.03]"
            title="Descansó en este rango"
          >
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Descansó en este rango</span>
          </span>
        ) : (
          <span className={cn("flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-full ring-2", tn.anillo)}>
            <span className={cn("font-display text-xs font-bold tabular-nums leading-none", tn.texto)}>
              {nota == null ? "—" : nota.toFixed(1)}
            </span>
          </span>
        )}
      </div>
      {/* Proporción de ventas contra el mejor del rango: el ranking se ve sin leer. */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
        <div className={cn("h-full rounded-full transition-[width] duration-700", tn.punto)} style={{ width: `${Math.max(2, Math.round((ventas / maxVentas) * 100))}%` }} />
      </div>
    </li>
  );
}
