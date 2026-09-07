import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, DollarSign, Headphones,
  MousePointerClick, Phone, Target, TrendingUp, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PRESET_CONFIG, rangeForPreset, type RangePreset } from "@/lib/range-presets";
import { cn } from "@/lib/utils";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CLOSER_STAGES, STAGE_LABELS, getNextContactDate, isContactOverdue, needsContactDecision } from "@/pages/closers/hooks/useCloserLeads";
import { diasDelRango, useMisHoras, resumirHoras } from "@/hooks/useMisHoras";
import { useMiTiempoCowork, resumirTiempoCowork, pieTiempoCowork } from "@/hooks/useMiTiempoCowork";
import { useMiQa, useMisLeads, type LeadDelCloser } from "./useCloserDashboard";

// TABLERO DEL CLOSER — su casa al entrar a Maven.
//
// Pedido de Jhon: "hazle uno personalizado a los closers… me gustó lo que
// ponías en el de los chatters sobre hubstaff, que vean las horas que llevan,
// productividad, y en el caso de los closers analiza su pipeline y tab closers".
//
// Lo que contesta, en orden de lo que un closer hace en el día:
//  · A QUIÉN CONTACTAR HOY: sus leads con el seguimiento vencido, con los días
//    de atraso. Usa la cadencia RE-ANCLADA al último contacto (helpers de
//    useCloserLeads) — la misma que el resto de Maven, para no volver a decir
//    "53 vencidas" cuando son 3.
//  · SU PIPELINE por etapa y lo que ya cerró (monetización mensual).
//  · SUS HORAS Y ACTIVIDAD de Hubstaff, día por día.
//  · SUS CALLS de QA con su nota.
//
// Todo es SUYO: el pipeline sale de un RPC filtrado por assigned_to, las horas
// de la policy "cada quien ve las propias" y las calls por RLS.

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);

const CERRADAS = ["Confirmada", "Completada"];

/** Días de atraso del seguimiento (0 = no está vencido). */
function diasDeAtraso(l: LeadDelCloser): number {
  const next = getNextContactDate(l.passed_date, l.contactos, l.last_contact_date);
  if (!next) return 0;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(next); limite.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy.getTime() - limite.getTime()) / 86400000));
}

function Kpi({ label, valor, pie, icono: Icono, color, tinte, barra }: {
  label: string; valor: string; pie?: React.ReactNode; icono: typeof Phone;
  color: string; tinte: string; barra?: { pct: number; clase: string };
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/10 bg-card/60 bg-gradient-to-br to-transparent p-4 ring-1 ring-white/5 transition-transform hover:-translate-y-0.5", tinte)}>
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

export default function CloserDashboard() {
  const [rango, setRango] = useState<{ from: Date; to: Date }>(() => rangeForPreset("this_week", new Date()));
  const [preset, setPreset] = useState<RangePreset | null>("this_week");
  const desde = isoDia(rango.from);
  const hasta = isoDia(rango.to);

  const { leads, cargando: leadsCargando } = useMisLeads();
  const { dias, cargando: hsCargando } = useMisHoras(desde, hasta);
  const { dias: diasCowork, cargando: coworkCargando } = useMiTiempoCowork(desde, hasta);
  const cowork = useMemo(() => resumirTiempoCowork(diasCowork), [diasCowork]);
  const qa = useMiQa(desde, hasta);

  const hubstaff = useMemo(() => resumirHoras(dias), [dias]);
  // El gráfico cubre TODO el rango del calendario (los días sin registro van
  // en 0); los totales siguen saliendo de los días con dato.
  const diasGrafico = useMemo(() => diasDelRango(dias, desde, hasta), [dias, desde, hasta]);

  // ── Pipeline (no depende del rango: es el estado de HOY) ─────────────────
  const pipeline = useMemo(() => {
    const porEtapa = new Map<string, number>();
    for (const l of leads) porEtapa.set(l.stage, (porEtapa.get(l.stage) ?? 0) + 1);
    const cerradas = leads.filter((l) => CERRADAS.includes(l.stage));
    const usdMes = cerradas.reduce((s, l) => s + (l.monthly_monetization ?? 0), 0);
    const vencidos = leads
      .filter((l) => isContactOverdue(l.passed_date, l.contactos, l.last_contact_date, l.stage))
      .map((l) => ({ l, atraso: diasDeAtraso(l) }))
      .sort((a, b) => b.atraso - a.atraso);
    // Ya hizo los 6 contactos y sigue en Asignada: hay que decidir.
    const porDecidir = leads.filter((l) => needsContactDecision(l.stage, l.contactos));
    // LO QUE TRAJO A LA MESA EN EL RANGO: se cuenta por la fecha de cierre
    // (completada manda sobre confirmada), no por cuándo llegó la lead. El
    // acumulado queda al lado para no perder de vista el total.
    const cerradasRango = cerradas.filter((l) => {
      const f = l.completed_date ?? l.confirmed_date;
      return !!f && f >= desde && f <= hasta;
    });
    const usdRango = cerradasRango.reduce((s, l) => s + (l.monthly_monetization ?? 0), 0);
    return {
      porEtapa, cerradas: cerradas.length, usdMes, vencidos, porDecidir,
      asignadas: porEtapa.get("Asignada") ?? 0,
      cerradasRango: cerradasRango.length, usdRango,
    };
  }, [leads, desde, hasta]);

  const cargando = leadsCargando || hsCargando;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className={cn("sticky top-0 z-10 border-b border-white/10 bg-gradient-to-r via-background/60 to-background/60 px-4 py-3 backdrop-blur-xl md:px-6",
        pipeline.vencidos.length > 0 ? "from-amber-500/20" : "from-emerald-500/15")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <Target className="h-4 w-4 text-primary" />
            </span>
            <div>
              <SelectorDeTablero actual="pipeline" />
              <p className="text-[11px] text-muted-foreground">
                {pipeline.asignadas} asignada{pipeline.asignadas === 1 ? "" : "s"}
                {pipeline.vencidos.length > 0
                  ? <> · <span className="font-medium text-amber-500">{pipeline.vencidos.length} con seguimiento vencido</span></>
                  : leads.length > 0 && <> · <span className="font-medium text-emerald-500">al día con los seguimientos</span></>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-border bg-card/40 p-0.5">
              {PRESET_CONFIG.map((p) => (
                <button key={p.key} type="button"
                  onClick={() => { setRango(rangeForPreset(p.key, new Date())); setPreset(p.key); }}
                  className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    preset === p.key ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                  {p.label}
                </button>
              ))}
            </div>
            <DateRangePicker
              from={rango.from} to={rango.to}
              onApply={(from, to) => { if (!from || !to) return; setRango({ from, to }); setPreset(null); }}
              placeholder="Seleccionar rango"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        {/* ── KPIs ── */}
        {cargando ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {/* Primero la plata: es lo que un closer trae a la mesa, y era lo
                que faltaba en la primera versión de este tablero. */}
            <Kpi
              label="Traído a la mesa"
              valor={pipeline.usdRango > 0 ? `${money(pipeline.usdRango)}/mes` : "$0"}
              pie={pipeline.cerradasRango > 0
                ? <>{pipeline.cerradasRango} cerrada{pipeline.cerradasRango === 1 ? "" : "s"} en el rango · {money(pipeline.usdMes)}/mes acumulado</>
                : <>nada cerrado en el rango · {money(pipeline.usdMes)}/mes acumulado</>}
              icono={DollarSign} color="bg-emerald-500" tinte="from-emerald-500/10"
            />
            <Kpi
              label="Horas (Hubstaff)"
              valor={hubstaff.horas > 0 ? hubstaff.horas.toFixed(1) : "—"}
              pie={hubstaff.diasTrabajados > 0 ? `${hubstaff.diasTrabajados} día${hubstaff.diasTrabajados === 1 ? "" : "s"} con registro` : "sin registro en el rango"}
              icono={Clock} color="bg-sky-500" tinte="from-sky-500/10"
            />
            {/* El reloj de Cowork (cámara + pantalla, presente): va a reemplazar
                a Hubstaff; conviven mientras dure la transición. */}
            <Kpi
              label="Cowork"
              valor={cowork.horas > 0 ? cowork.horas.toFixed(1) : "—"}
              pie={pieTiempoCowork(cowork, coworkCargando)}
              icono={Timer} color="bg-violet-500" tinte="from-violet-500/10"
            />
            <Kpi
              label="Productividad"
              valor={hubstaff.actividad != null ? `${hubstaff.actividad}%` : "—"}
              // Sin semáforo a propósito: es actividad de teclado y mouse, y
              // buena parte del trabajo de un closer pasa fuera de la pantalla.
              pie="actividad de teclado y mouse"
              icono={MousePointerClick} color="bg-violet-500" tinte="from-violet-500/10"
              barra={hubstaff.actividad != null ? { pct: hubstaff.actividad, clase: "bg-violet-500" } : undefined}
            />
            <Kpi
              label="Cerradas"
              valor={String(pipeline.cerradas)}
              pie="confirmadas + completadas, histórico"
              icono={CheckCircle2} color="bg-sky-500" tinte="from-sky-500/10"
            />
            <Kpi
              label="QA de tus calls"
              valor={qa.score != null ? qa.score.toFixed(0) : "—"}
              pie={qa.calls > 0 ? `${qa.calls} call${qa.calls === 1 ? "" : "s"} en el rango` : "sin calls evaluadas"}
              icono={Headphones} color="bg-amber-500" tinte="from-amber-500/10"
              barra={qa.score != null ? { pct: qa.score, clase: qa.score >= 70 ? "bg-emerald-500" : "bg-amber-500" } : undefined}
            />
          </div>
        )}

        {/* ── A CONTACTAR HOY ── */}
        <section className="overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.07] to-transparent">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500">
                <Phone className="h-4 w-4 text-white" />
              </span>
              <h2 className="text-sm font-semibold">A contactar hoy</h2>
              {pipeline.vencidos.length > 0 && (
                <Badge variant="outline" className="rounded-full border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-500">
                  {pipeline.vencidos.length}
                </Badge>
              )}
            </div>
            <Link to="/closers" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Abrir Closers <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {leadsCargando ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
          ) : pipeline.vencidos.length === 0 ? (
            <p className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              {leads.length === 0 ? "Todavía no tienes leads asignadas." : "Ningún seguimiento vencido. Al día."}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {pipeline.vencidos.slice(0, 12).map(({ l, atraso }) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className={cn("w-12 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold tabular-nums",
                    atraso >= 7 ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-500")}>
                    {atraso}d
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">@{l.instagram_handle}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {l.contactos} de 6 contactos
                      {l.last_contact_date && ` · último ${format(new Date(`${l.last_contact_date}T12:00:00`), "d MMM", { locale: es })}`}
                      {l.category && ` · ${l.category}`}
                    </p>
                  </div>
                  {l.monthly_monetization != null && l.monthly_monetization > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{money(l.monthly_monetization)}/mes</span>
                  )}
                </li>
              ))}
              {pipeline.vencidos.length > 12 && (
                <li className="px-4 py-2 text-center text-[11px] text-muted-foreground">
                  y {pipeline.vencidos.length - 12} más — están todas en Closers
                </li>
              )}
            </ul>
          )}
          <footer className="border-t border-white/5 px-4 py-2 text-[11px] text-muted-foreground">
            Cadencia 1 · 3 · 5 · 8 · 15 · 29 días, contada desde tu último contacto: contactar pone la lead al día.
          </footer>
        </section>

        {/* ── PIPELINE + HORAS ── */}
        <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Tu pipeline</h2>
              <Badge variant="outline" className="ml-auto rounded-full text-[10px] font-normal text-muted-foreground">
                estado de hoy
              </Badge>
            </div>
            <div className="p-4">
              {leads.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin leads asignadas.</p>
              ) : (
                <div className="space-y-2">
                  {CLOSER_STAGES.map((s) => {
                    const n = pipeline.porEtapa.get(s) ?? 0;
                    const pct = leads.length > 0 ? (100 * n) / leads.length : 0;
                    return (
                      <div key={s}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{STAGE_LABELS[s] ?? s}</span>
                          <span className="font-semibold tabular-nums">{n}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className={cn("h-full rounded-full",
                            s === "Asignada" ? "bg-sky-500" : CERRADAS.includes(s) ? "bg-emerald-500" : "bg-muted-foreground/40")}
                            style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {pipeline.porDecidir.length > 0 && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-500">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {pipeline.porDecidir.length} lead{pipeline.porDecidir.length === 1 ? "" : "s"} con los 6 contactos hechos: hay que decidir si seguir o marcarla No interesada.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5 lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Tus horas, día por día</h2>
              {hubstaff.horas > 0 && (
                <Badge variant="outline" className="rounded-full text-[10px]">
                  {hubstaff.horas.toFixed(1)} h{hubstaff.actividad != null && ` · ${hubstaff.actividad}%`}
                </Badge>
              )}
            </div>
            <div className="p-4">
              {hsCargando ? (
                <Skeleton className="h-28 rounded-xl" />
              ) : dias.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin registro de Hubstaff en el rango.</p>
              ) : (
                <div className="flex h-28 items-end gap-1">
                  {diasGrafico.map((d) => (
                    <div key={d.date} className="flex min-w-0 max-w-[64px] flex-1 flex-col items-center gap-1"
                      title={d.horas > 0
                        ? `${format(new Date(`${d.date}T12:00:00`), "EEEE d MMM", { locale: es })}: ${d.horas.toFixed(1)} h${d.actividad != null ? ` · ${d.actividad}% de actividad` : ""}`
                        : `${format(new Date(`${d.date}T12:00:00`), "EEEE d MMM", { locale: es })}: sin registro`}>
                      <span className="text-[9px] tabular-nums text-muted-foreground">{d.horas > 0 ? d.horas.toFixed(1) : ""}</span>
                      <div className={cn("w-full rounded-t transition-[height] duration-700", d.horas > 0 ? "bg-sky-500" : "bg-white/[0.07]")}
                        style={{ height: `${d.horas > 0 ? Math.max(4, (d.horas / hubstaff.maxHoras) * 80) : 3}px` }} />
                      <span className="truncate text-[9px] text-muted-foreground">
                        {format(new Date(`${d.date}T12:00:00`), "d", { locale: es })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
