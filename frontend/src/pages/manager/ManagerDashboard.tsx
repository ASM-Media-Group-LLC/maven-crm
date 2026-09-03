import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarClock, Clock, DollarSign, Gauge,
  Megaphone, Sparkles, Users,
} from "lucide-react";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PRESET_CONFIG, rangeForPreset, type RangePreset } from "@/lib/range-presets";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { usePromoPeriodScores } from "@/pages/promolog/usePromoPeriodScores";
import { useDashboard2Summary } from "@/pages/sales-performance/useDashboard2Summary";
import { useMiObjetivo, useMisCreadoras, useMisNotasDelBot, type NotaDelBot } from "./useManagerDashboard";

// TABLERO DEL MANAGER — su casa al entrar a Maven.
//
// Lo que pidió Jhon: "manager hazles un dashboard basadas en su nota (cada
// quien ve lo suyo), sus creadoras, promolog, y su nota basada en el bot".
//
// Las cuatro cosas, en ese orden de importancia:
//  · SU NOTA del bot (la 1-10 que se publica a las 19:00 en el grupo) y —lo que
//    hoy no se ve en ninguna pantalla— POR QUÉ le salió esa: franjas de
//    reporte, horas de Hubstaff y avance contra su objetivo.
//  · SUS CREADORAS, las activas que tiene asignadas.
//  · PROMOLOG por creadora, que es su objetivo medido (`corte_objetivos` dice
//    `promo` para las dos managers).
//  · Cuánto factura su roster en el rango.
//
// Cada quien ve lo suyo: las notas salen con la policy `corte_notas_propia` y
// las creadoras se filtran por `assigned_manager_id = auth.uid()`.

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const money = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);

const tonoNota = (n: number | null) =>
  n == null ? { texto: "text-muted-foreground", barra: "bg-muted-foreground/40", hero: "from-primary/15" }
  : n >= 8 ? { texto: "text-emerald-500", barra: "bg-emerald-500", hero: "from-emerald-500/20" }
  : n >= 6 ? { texto: "text-amber-500", barra: "bg-amber-500", hero: "from-amber-500/20" }
  : { texto: "text-red-500", barra: "bg-red-500", hero: "from-red-500/20" };

const OBJETIVOS: Record<string, string> = {
  promo: "que tu roster promocione",
  numeros: "traer números",
  contenido: "subir contenido",
  cierres: "firmar",
  ninguna: "sin métrica automática",
};

function Kpi({ label, valor, pie, icono: Icono, color, tinte, barra }: {
  label: string; valor: string; pie?: React.ReactNode; icono: typeof Users;
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

/** El desglose de la última nota: de dónde salió cada punto. */
function PorQueEsaNota({ nota, meta }: { nota: NotaDelBot; meta: number | null }) {
  const c = nota.componentes ?? {};
  const franjas = c.franjas ?? 0;
  const franjasMax = c.franjas_max ?? 0;
  const objetivo = c.objetivo ?? null;
  const avance = objetivo === "promo" ? (c.promos_roster ?? 0)
    : objetivo === "numeros" ? (c.numeros ?? 0)
    : objetivo === "contenido" ? (c.msgs_dia ?? 0)
    : null;

  const piezas: Array<{ label: string; valor: string; ok: boolean | null; ayuda: string }> = [
    {
      label: "Reportes en franjas",
      valor: franjasMax > 0 ? `${franjas} de ${franjasMax}` : "—",
      ok: franjasMax > 0 ? franjas >= franjasMax : null,
      ayuda: "Los avisos que el bot espera en el grupo a lo largo del día. Vale hasta 1,5 puntos de la nota.",
    },
    {
      label: "Hubstaff",
      valor: c.hub_h != null ? `${Number(c.hub_h).toFixed(1)} h · ${c.hub_act ?? "—"}%` : "—",
      ok: c.hub_act != null ? Number(c.hub_act) >= 60 : null,
      ayuda: "Horas y actividad. Por debajo del 60% de actividad la nota tiene penalización.",
    },
    {
      label: objetivo === "promo" ? "Promos de tu roster" : "Avance de tu objetivo",
      valor: avance != null ? (meta != null ? `${avance} de ${meta}` : String(avance)) : "—",
      ok: avance != null && meta != null ? avance >= meta : null,
      ayuda: "Es el 60% de la nota: el resultado propio de tu rol.",
    },
  ];

  return (
    <div className="space-y-2">
      {piezas.map((p) => (
        <div key={p.label} className="flex items-center gap-2 text-xs" title={p.ayuda}>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full",
            p.ok == null ? "bg-muted-foreground/40" : p.ok ? "bg-emerald-500" : "bg-amber-500")} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.label}</span>
          <span className={cn("shrink-0 font-medium tabular-nums", p.ok === false && "text-amber-500")}>{p.valor}</span>
        </div>
      ))}
      {franjasMax > 0 && franjas === 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-500">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          Sin reportes en las franjas: ahí se van hasta 1,5 puntos de tu nota.
        </p>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const [rango, setRango] = useState<{ from: Date; to: Date }>(() => rangeForPreset("this_week", new Date()));
  const [preset, setPreset] = useState<RangePreset | null>("this_week");
  const desde = isoDia(rango.from);
  const hasta = isoDia(rango.to);
  const dias = Math.max(1, Math.round((rango.to.getTime() - rango.from.getTime()) / 86400000) + 1);

  const { notas, cargando: notasCargando } = useMisNotasDelBot(desde, hasta);
  const objetivo = useMiObjetivo();
  const { creadoras, cargando: creadorasCargando } = useMisCreadoras();
  // Promolog: el score oficial por creadora de la ventana (mismo RPC que el
  // leaderboard de Promolog), filtrado a las mías.
  const promo = usePromoPeriodScores(Math.min(60, dias));
  const ingresos = useDashboard2Summary(desde, hasta);

  const idsMios = useMemo(() => new Set(creadoras.map((c) => c.id)), [creadoras]);

  const promoMias = useMemo(
    () => (promo.data ?? []).filter((p) => idsMios.has(p.creator_id)),
    [promo.data, idsMios],
  );

  const facturado = useMemo(
    () => (ingresos.data ?? []).filter((r) => r.creator_id && idsMios.has(r.creator_id)).reduce((s, r) => s + r.total, 0),
    [ingresos.data, idsMios],
  );

  const ultima = notas.length > 0 ? notas[notas.length - 1] : null;
  const promedio = notas.length > 0 ? notas.reduce((s, n) => s + n.nota, 0) / notas.length : null;
  const tono = tonoNota(ultima?.nota ?? promedio ?? null);

  // Promoción del roster: creadoras con al menos un promo-día en la ventana.
  const promocionaron = promoMias.filter((p) => p.promo_days > 0).length;
  const pctPromo = promoMias.length > 0 ? Math.round((100 * promocionaron) / promoMias.length) : null;

  const cargando = notasCargando || creadorasCargando;

  // Un manager sin roster ni notas no tiene nada que mirar acá: 3 de los 5
  // roles `manager` están así. Antes de mostrarle una pantalla vacía, le
  // dejamos el tablero general.
  if (!cargando && creadoras.length === 0 && notas.length === 0) {
    return <DashboardContent />;
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className={cn("sticky top-0 z-10 border-b border-white/10 bg-gradient-to-r via-background/60 to-background/60 px-4 py-3 backdrop-blur-xl md:px-6", tono.hero)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <Megaphone className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold leading-tight tracking-tight">Tu roster</h1>
              <p className="text-[11px] text-muted-foreground">
                {creadoras.length} creadora{creadoras.length === 1 ? "" : "s"} activa{creadoras.length === 1 ? "" : "s"}
                {objetivo && <> · tu objetivo: {OBJETIVOS[objetivo.metrica] ?? objetivo.metrica}</>}
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Tu nota (bot)"
              valor={ultima ? ultima.nota.toFixed(1) : "—"}
              pie={ultima
                ? <>del {format(new Date(`${ultima.fecha}T12:00:00`), "d MMM", { locale: es })}{promedio != null && ` · promedio ${promedio.toFixed(1)}`}</>
                : "sin nota en el rango"}
              icono={Sparkles} color="bg-violet-500" tinte="from-violet-500/10"
              barra={ultima ? { pct: (ultima.nota / 10) * 100, clase: tonoNota(ultima.nota).barra } : undefined}
            />
            <Kpi
              label="Tus creadoras"
              valor={String(creadoras.length)}
              pie="activas y asignadas a vos"
              icono={Users} color="bg-sky-500" tinte="from-sky-500/10"
            />
            <Kpi
              label="Promocionaron"
              valor={pctPromo != null ? `${pctPromo}%` : "—"}
              pie={promoMias.length > 0 ? `${promocionaron} de ${promoMias.length} en la ventana` : "sin datos de promolog"}
              icono={Megaphone} color="bg-amber-500" tinte="from-amber-500/10"
              barra={pctPromo != null ? { pct: pctPromo, clase: pctPromo >= 80 ? "bg-emerald-500" : "bg-amber-500" } : undefined}
            />
            <Kpi
              label="Facturó tu roster"
              valor={money(facturado)}
              pie={ingresos.isLoading ? "cargando…" : "bruto de OF en el rango"}
              icono={DollarSign} color="bg-emerald-500" tinte="from-emerald-500/10"
            />
          </div>
        )}

        {/* ── TU NOTA ── */}
        <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Por qué esa nota</h2>
            </div>
            <div className="p-4">
              {notasCargando ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : !ultima ? (
                <p className="text-xs text-muted-foreground">El bot no publicó nota tuya en este rango.</p>
              ) : (
                <PorQueEsaNota nota={ultima} meta={objetivo?.meta_diaria ?? null} />
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5 lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <h2 className="text-sm font-semibold">Tus notas del rango</h2>
              {notas.length > 0 && <Badge variant="outline" className="rounded-full text-[10px]">{notas.length} días</Badge>}
            </div>
            <div className="p-4">
              {notasCargando ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : notas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin notas en el rango.</p>
              ) : (
                // Una barra por día: la altura es la nota. Se lee la racha sin
                // leer números.
                <div className="flex h-28 items-end gap-1">
                  {notas.map((n) => {
                    const t = tonoNota(n.nota);
                    return (
                      <div key={n.fecha} className="flex min-w-0 flex-1 flex-col items-center gap-1"
                        title={`${format(new Date(`${n.fecha}T12:00:00`), "EEEE d MMM", { locale: es })}: ${n.nota.toFixed(1)}`}>
                        <span className={cn("text-[9px] tabular-nums", t.texto)}>{n.nota.toFixed(1)}</span>
                        <div className={cn("w-full rounded-t transition-[height] duration-700", t.barra)}
                          style={{ height: `${Math.max(4, (n.nota / 10) * 80)}px` }} />
                        <span className="truncate text-[9px] text-muted-foreground">
                          {format(new Date(`${n.fecha}T12:00:00`), "d", { locale: es })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── TUS CREADORAS + PROMOLOG ── */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <h2 className="text-sm font-semibold">Tus creadoras · promoción</h2>
            <Link to="/promolog" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Ver Promolog <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {creadorasCargando || promo.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
          ) : creadoras.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">No tenés creadoras asignadas.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {/* Primero las que llevan más sin promocionar: son las que hay
                  que empujar, y es literalmente el objetivo del rol. */}
              {creadoras
                .map((c) => ({ c, p: promoMias.find((x) => x.creator_id === c.id) ?? null }))
                .sort((a, b) => (a.p?.promo_days ?? -1) - (b.p?.promo_days ?? -1))
                .map(({ c, p }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <UserAvatar name={c.nombre} src={c.profile_photo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/creadores/${c.id}`} className="truncate text-sm font-medium leading-tight hover:text-primary hover:underline">
                        {c.nombre}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p ? `${p.promo_days} de ${p.covered_days} días leídos con promo` : "sin lectura de promolog en la ventana"}
                        {p?.is_partial && " · cobertura parcial"}
                      </p>
                    </div>
                    {p && (
                      <>
                        <div className="hidden w-24 sm:block">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                            <div className={cn("h-full rounded-full", p.score >= 70 ? "bg-emerald-500" : p.score >= 40 ? "bg-amber-500" : "bg-red-500")}
                              style={{ width: `${Math.max(3, p.score)}%` }} />
                          </div>
                        </div>
                        <span className={cn("w-10 shrink-0 text-right text-sm font-semibold tabular-nums",
                          p.score >= 70 ? "text-emerald-500" : p.score >= 40 ? "text-amber-500" : "text-red-500")}>
                          {p.score}
                        </span>
                      </>
                    )}
                    {!p && <Gauge className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
                  </li>
                ))}
            </ul>
          )}
          <footer className="border-t border-white/5 px-4 py-2 text-[11px] text-muted-foreground">
            Score de promo 0-100: frecuencia, calidad del CTA, consistencia y diversificación. Los días que promolog no leyó no castigan.
          </footer>
        </section>
      </div>
    </main>
  );
}
