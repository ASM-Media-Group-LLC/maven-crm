import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarClock, Clock, DollarSign, Gauge,
  Megaphone, MousePointerClick, Sparkles, Users, Timer } from "lucide-react";
import MiTablero from "@/pages/dashboard/MiTablero";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { PRESET_CONFIG, diasEntre, rangeForPreset, type RangePreset } from "@/lib/range-presets";
import { cn } from "@/lib/utils";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { usePromoScoresRango } from "@/pages/promolog/usePromoPeriodScores";
import { useDashboard2Summary } from "@/pages/sales-performance/useDashboard2Summary";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMiTiempoCowork, resumirTiempoCowork, pieTiempoCowork } from "@/hooks/useMiTiempoCowork";
import { useMisHoras, resumirHoras } from "@/hooks/useMisHoras";
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
  : n >= 8 ? { texto: "text-success", barra: "bg-success", hero: "from-success/20" }
  : n >= 6 ? { texto: "text-warning", barra: "bg-warning", hero: "from-warning/20" }
  : { texto: "text-destructive", barra: "bg-destructive", hero: "from-destructive/20" };

// La llave es `corte_objetivos.metrica` (dato); un valor que no esté acá se
// muestra tal cual.
const OBJETIVOS: Record<string, TranslationKey> = {
  promo: "sales.mgr.goal.promo",
  numeros: "sales.mgr.goal.numeros",
  contenido: "sales.mgr.goal.contenido",
  cierres: "sales.mgr.goal.cierres",
  ninguna: "sales.mgr.goal.ninguna",
};

// Los botones de rango, por su llave: el texto sale del diccionario y no de
// PRESET_CONFIG (que es compartido y lo traduce su dueño).
const ETIQUETA_PRESET: Record<RangePreset, TranslationKey> = {
  yesterday: "sales.yesterday",
  today: "common.today",
  this_week: "common.thisWeek",
  this_month: "common.thisMonth",
};

function Kpi({ label, valor, pie, icono: Icono, color, tinte, barra, onClick }: {
  label: string; valor: string; pie?: React.ReactNode; icono: typeof Users;
  color: string; tinte: string; barra?: { pct: number; clase: string };
  /** Si viene, la tarjeta es un botón (abre el detalle). */
  onClick?: () => void;
}) {
  const Caja = onClick ? "button" : "div";
  return (
    <Caja
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("relative w-full overflow-hidden rounded-2xl border border-white/10 bg-card/60 bg-gradient-to-br to-transparent p-4 text-left ring-1 ring-white/5 transition-transform",
        onClick && "cursor-pointer hover:border-primary/40", tinte)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
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
    </Caja>
  );
}

/** El desglose de la última nota: de dónde salió cada punto. */
function PorQueEsaNota({ nota, meta }: { nota: NotaDelBot; meta: number | null }) {
  const { t } = useLanguage();
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
      label: t("sales.mgr.slotReports"),
      valor: franjasMax > 0 ? t("sales.xOfY", { a: franjas, b: franjasMax }) : "—",
      ok: franjasMax > 0 ? franjas >= franjasMax : null,
      ayuda: t("sales.mgr.slotHelp"),
    },
    {
      label: "Hubstaff",
      valor: c.hub_h != null ? `${Number(c.hub_h).toFixed(1)} h · ${c.hub_act ?? "—"}%` : "—",
      ok: c.hub_act != null ? Number(c.hub_act) >= 60 : null,
      ayuda: t("sales.mgr.hubHelp"),
    },
    {
      label: objetivo === "promo" ? t("sales.mgr.rosterPromos") : t("sales.mgr.goalProgress"),
      valor: avance != null ? (meta != null ? t("sales.xOfY", { a: avance, b: meta }) : String(avance)) : "—",
      ok: avance != null && meta != null ? avance >= meta : null,
      ayuda: t("sales.mgr.goalHelp"),
    },
  ];

  return (
    <div className="space-y-2">
      {piezas.map((p) => (
        <div key={p.label} className="flex items-center gap-2 text-xs" title={p.ayuda}>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full",
            p.ok == null ? "bg-muted-foreground/40" : p.ok ? "bg-success" : "bg-warning")} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.label}</span>
          <span className={cn("shrink-0 font-medium tabular-nums", p.ok === false && "text-warning")}>{p.valor}</span>
        </div>
      ))}
      {franjasMax > 0 && franjas === 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {t("sales.mgr.noSlotReports")}
        </p>
      )}
    </div>
  );
}

export default function ManagerDashboard({ forzado = false }: {
  /** true = lo eligió alguien a dedo desde el desplegable del título, así que
   *  se muestra igual aunque no tenga roster (si no, un admin curioso
   *  terminaba en el tablero genérico sin entender por qué). */
  forzado?: boolean;
} = {}) {
  const f = useFormato();
  const { t } = useLanguage();
  const [rango, setRango] = useState<{ from: Date; to: Date }>(() => rangeForPreset("this_week", new Date()));
  const [preset, setPreset] = useState<RangePreset | null>("this_week");
  const desde = isoDia(rango.from);
  const hasta = isoDia(rango.to);

  // Detalle de ingresos por modelo, abierto desde el KPI.
  const [verIngresos, setVerIngresos] = useState(false);

  const { notas, cargando: notasCargando } = useMisNotasDelBot(desde, hasta);
  const { dias: diasHubstaff, cargando: horasCargando } = useMisHoras(desde, hasta);
  const { dias: diasCowork, cargando: coworkCargando } = useMiTiempoCowork(desde, hasta);
  const cowork = useMemo(() => resumirTiempoCowork(diasCowork), [diasCowork]);
  const objetivo = useMiObjetivo();
  const { creadoras, cargando: creadorasCargando } = useMisCreadoras();
  // Promolog: el score oficial por creadora (mismo RPC que el leaderboard de
  // Promolog), filtrado a las mías y con las FECHAS DEL CALENDARIO. Antes iba
  // con una ventana móvil de N días terminando hoy, así que "Ayer" contestaba
  // con los promos de hoy y un rango viejo mostraba el mes corriente.
  const promo = usePromoScoresRango(desde, hasta);
  const ingresos = useDashboard2Summary(desde, hasta);

  const idsMios = useMemo(() => new Set(creadoras.map((c) => c.id)), [creadoras]);

  const promoMias = useMemo(
    () => (promo.data ?? []).filter((p) => idsMios.has(p.creator_id)),
    [promo.data, idsMios],
  );

  const horas = useMemo(() => resumirHoras(diasHubstaff), [diasHubstaff]);

  // Una barra por CADA día del rango: con solo los días que tienen nota, una
  // semana con 3 notas dibujaba 3 barras y parecía un rango de 3 días.
  const barras = useMemo(() => {
    const porFecha = new Map(notas.map((n) => [n.fecha, n]));
    const fechas = diasEntre(desde, hasta);
    return fechas.length > 0
      ? fechas.map((fecha) => ({ fecha, nota: porFecha.get(fecha)?.nota ?? null }))
      : notas.map((n) => ({ fecha: n.fecha, nota: n.nota }));
  }, [notas, desde, hasta]);

  // Ingresos de MIS modelos en el rango, por modelo y en total. Sale del mismo
  // resumen que usa el Dashboard Ventas, filtrado a mi roster: así el detalle
  // que abre el KPI está sincronizado con el calendario, sin otra consulta.
  const aporte = useMemo(() => {
    const nombrePorId = new Map(creadoras.map((c) => [c.id, c.nombre]));
    const filas = (ingresos.data ?? [])
      .filter((r) => r.creator_id && idsMios.has(r.creator_id))
      .map((r) => ({
        id: r.creator_id as string,
        nombre: nombrePorId.get(r.creator_id as string) ?? r.artistic_name ?? r.blu_creator_name ?? t("sales.mgr.noName"),
        total: r.total,
        subs: r.subs,
        dias: r.days_with_data,
      }))
      .sort((a, b) => b.total - a.total);
    const total = filas.reduce((s, r) => s + r.total, 0);
    const subs = filas.reduce((s, r) => s + r.subs, 0);
    return { filas, total, subs };
  }, [ingresos.data, idsMios, creadoras, t]);

  const ultima = notas.length > 0 ? notas[notas.length - 1] : null;
  const promedio = notas.length > 0 ? notas.reduce((s, n) => s + n.nota, 0) / notas.length : null;
  const tono = tonoNota(ultima?.nota ?? promedio ?? null);

  // Promoción del roster: creadoras con al menos un promo-día en la ventana.
  const promocionaron = promoMias.filter((p) => p.promo_days > 0).length;
  const pctPromo = promoMias.length > 0 ? Math.round((100 * promocionaron) / promoMias.length) : null;

  const cargando = notasCargando || creadorasCargando;

  // Un manager sin roster ni notas no tiene nada que mirar aquí. Antes de
  // mostrarle una pantalla vacía, le dejamos «lo suyo» (horas, avisos, accesos):
  // el tablero general con números del negocio ya no se muestra (Alvaro, 10/11).
  if (!forzado && !cargando && creadoras.length === 0 && notas.length === 0) {
    return <MiTablero />;
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
              <SelectorDeTablero actual="roster" />
              <p className="text-[11px] text-muted-foreground">
                {t(creadoras.length === 1 ? "sales.mgr.activeCreators1" : "sales.mgr.activeCreatorsN", { n: creadoras.length })}
                {objetivo && <> · {t("sales.mgr.yourGoal", { goal: OBJETIVOS[objetivo.metrica] ? t(OBJETIVOS[objetivo.metrica]) : objetivo.metrica })}</>}
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
                  {t(ETIQUETA_PRESET[p.key])}
                </button>
              ))}
            </div>
            <DateRangePicker
              from={rango.from} to={rango.to}
              onApply={(from, to) => { if (!from || !to) return; setRango({ from, to }); setPreset(null); }}
              placeholder={t("sales.mgr.pickRange")}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        {/* ── KPIs ── */}
        {cargando ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi
              label={t("sales.mgr.yourScore")}
              valor={ultima ? ultima.nota.toFixed(1) : "—"}
              pie={ultima
                ? <>{t("sales.mgr.scoreOf", { date: format(new Date(`${ultima.fecha}T12:00:00`), "d MMM", { locale: f.fechas }) })}{promedio != null && ` · ${t("sales.mgr.average", { avg: promedio.toFixed(1) })}`}</>
                : t("sales.mgr.noScore")}
              icono={Sparkles} color="bg-primary" tinte="from-primary/10"
              barra={ultima ? { pct: (ultima.nota / 10) * 100, clase: tonoNota(ultima.nota).barra } : undefined}
            />
            <Kpi
              label={t("sales.mgr.yourCreators")}
              valor={String(creadoras.length)}
              pie={t("sales.mgr.creatorsPie")}
              icono={Users} color="bg-sky-500" tinte="from-sky-500/10"
            />
            <Kpi
              label={t("sales.mgr.promoted")}
              valor={pctPromo != null ? `${pctPromo}%` : "—"}
              pie={promoMias.length > 0 ? t("sales.mgr.promotedPie", { a: promocionaron, b: promoMias.length }) : promo.isLoading ? t("sales.loadingLower") : t("sales.mgr.noPromolog")}
              icono={Megaphone} color="bg-amber-500" tinte="from-amber-500/10"
              barra={pctPromo != null ? { pct: pctPromo, clase: pctPromo >= 80 ? "bg-success" : "bg-warning" } : undefined}
            />
            <Kpi
              label={t("sales.mgr.revenue")}
              valor={money(aporte.total)}
              pie={ingresos.isLoading
                ? t("sales.loadingLower")
                : <>{t("sales.mgr.subsIn", { amount: money(aporte.subs) })} · <span className="text-primary">{t("sales.mgr.seeEach")}</span></>}
              icono={DollarSign} color="bg-emerald-500" tinte="from-emerald-500/10"
              onClick={() => setVerIngresos(true)}
            />
            <Kpi
              label={t("sales.mgr.yourHours")}
              valor={horas.horas > 0 ? horas.horas.toFixed(1) : "—"}
              pie={horas.diasTrabajados > 0
                ? t(horas.diasTrabajados === 1 ? "sales.mgr.hubDays1" : "sales.mgr.hubDaysN", { n: horas.diasTrabajados })
                : horasCargando ? t("sales.loadingLower") : t("sales.mgr.noHub")}
              icono={Clock} color="bg-sky-500" tinte="from-sky-500/10"
            />
            {/* El reloj de Cowork (cámara + pantalla, presente): va a reemplazar
                a Hubstaff; conviven mientras dure la transición. */}
            <Kpi
              label="Cowork"
              valor={cowork.horas > 0 ? cowork.horas.toFixed(1) : "—"}
              pie={pieTiempoCowork(cowork, coworkCargando, t)}
              icono={Timer} color="bg-primary" tinte="from-primary/10"
            />
            <Kpi
              label={t("sales.mgr.productivity")}
              valor={horas.actividad != null ? `${horas.actividad}%` : "—"}
              pie={t("sales.mgr.productivityPie")}
              icono={MousePointerClick} color="bg-fuchsia-500" tinte="from-fuchsia-500/10"
              barra={horas.actividad != null ? { pct: horas.actividad, clase: horas.actividad >= 60 ? "bg-success" : "bg-warning" } : undefined}
            />
          </div>
        )}

        {/* ── TU NOTA ── */}
        <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t("sales.mgr.whyScore")}</h2>
            </div>
            <div className="p-4">
              {notasCargando ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : !ultima ? (
                <p className="text-xs text-muted-foreground">{t("sales.mgr.noBotScore")}</p>
              ) : (
                <PorQueEsaNota nota={ultima} meta={objetivo?.meta_diaria ?? null} />
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/60 ring-1 ring-white/5 lg:col-span-2">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <h2 className="text-sm font-semibold">{t("sales.mgr.rangeScores")}</h2>
              {notas.length > 0 && <Badge variant="outline" className="rounded-full text-[10px]">{t(notas.length === 1 ? "sales.mgr.scoreDays1" : "sales.mgr.scoreDaysN", { n: notas.length })}</Badge>}
            </div>
            <div className="p-4">
              {notasCargando ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : notas.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("sales.mgr.noScores")}</p>
              ) : (
                // Una barra por día: la altura es la nota. Se lee la racha sin
                // leer números.
                <div className="flex h-28 items-end gap-1">
                  {barras.map((b) => {
                    const tn = tonoNota(b.nota);
                    const dia = format(new Date(`${b.fecha}T12:00:00`), "EEEE d MMM", { locale: f.fechas });
                    return (
                      <div key={b.fecha} className="flex min-w-0 max-w-[56px] flex-1 flex-col items-center gap-1"
                        title={b.nota != null ? `${dia}: ${b.nota.toFixed(1)}` : t("sales.mgr.noScoreDay", { day: dia })}>
                        <span className={cn("text-[9px] tabular-nums", tn.texto)}>{b.nota != null ? b.nota.toFixed(1) : ""}</span>
                        <div className={cn("w-full rounded-t transition-[height] duration-700", b.nota != null ? tn.barra : "bg-white/[0.07]")}
                          style={{ height: `${b.nota != null ? Math.max(4, (b.nota / 10) * 80) : 3}px` }} />
                        <span className="truncate text-[9px] text-muted-foreground">
                          {format(new Date(`${b.fecha}T12:00:00`), "d", { locale: f.fechas })}
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
            <h2 className="text-sm font-semibold">{t("sales.mgr.creatorsPromo")}</h2>
            <Link to="/promolog" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {t("sales.mgr.viewPromolog")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {creadorasCargando || promo.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
          ) : creadoras.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("sales.mgr.noCreators")}</p>
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
                        {p ? t("sales.mgr.promoDays", { a: p.promo_days, b: p.covered_days }) : t("sales.mgr.noPromolog")}
                        {p?.is_partial && ` · ${t("sales.mgr.partial")}`}
                      </p>
                    </div>
                    {p && (
                      <>
                        <div className="hidden w-24 sm:block">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                            <div className={cn("h-full rounded-full", p.score >= 70 ? "bg-success" : p.score >= 40 ? "bg-warning" : "bg-destructive")}
                              style={{ width: `${Math.max(3, p.score)}%` }} />
                          </div>
                        </div>
                        <span className={cn("w-10 shrink-0 text-right text-sm font-semibold tabular-nums",
                          p.score >= 70 ? "text-success" : p.score >= 40 ? "text-warning" : "text-destructive")}>
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
            {t("sales.mgr.promoFooter")}
          </footer>
        </section>
      </div>

      {/* Aporte de cada modelo en el rango elegido. Se abre desde el KPI de
          ingresos y usa EXACTAMENTE los mismos datos, así que nunca puede
          contar distinto que la tarjeta. */}
      <Dialog open={verIngresos} onOpenChange={setVerIngresos}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
          <header className="border-b border-white/5 px-5 py-4">
            <DialogTitle className="text-base leading-tight">{t("sales.mgr.revenueByModel")}</DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {format(rango.from, "d MMM", { locale: f.fechas })} – {format(rango.to, "d MMM yyyy", { locale: f.fechas })} ·{" "}
              {t("sales.mgr.revenueSummary", { total: money(aporte.total), subs: money(aporte.subs) })}
            </p>
          </header>
          {aporte.filas.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted-foreground">
              {t("sales.mgr.noRevenue")}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {aporte.filas.map((r) => {
                const pct = aporte.total > 0 ? (100 * r.total) / aporte.total : 0;
                return (
                  <li key={r.id} className="px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={r.nombre} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">{r.nombre}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("sales.mgr.subsIn", { amount: money(r.subs) })} · {t(r.dias === 1 ? "sales.mgr.dataDays1" : "sales.mgr.dataDaysN", { n: r.dias })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-sm font-bold tabular-nums leading-tight">{money(r.total)}</p>
                        <p className="text-[10px] tabular-nums text-muted-foreground">{t("sales.mgr.ofTotal", { pct: pct.toFixed(1) })}</p>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <footer className="border-t border-white/5 px-5 py-2.5 text-[11px] text-muted-foreground">
            {t("sales.mgr.revenueFooter")}
          </footer>
        </DialogContent>
      </Dialog>
    </main>
  );
}
