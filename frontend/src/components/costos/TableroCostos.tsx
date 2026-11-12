import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/useLanguage";
import {
  CATEGORIAS, desgloseDelMes, dondeAhorrar, mensual, num, serieDelAno, tablero, usd,
  type BarraMes, type Cobro, type CuentaAtada, type ServicioCosto, type Tablero,
} from "@/lib/costos";
import type { UseQueryResult } from "@tanstack/react-query";
import { BloqueBajarCostos, SeccionCuentas, usarCuentas } from "./CuentasAtadas";

// COSTOS DE MAVEN — DISEÑO «A · UNA CIFRA» (Alvaro, 11/11/2026, lo eligió entre
// tres propuestas: https://claude.ai/artifact/RG42FisWLPeXbpmiVoiZEm).
// Lo primero y más grande: cuánto cuesta Maven al mes. Al lado, el mes, el año
// y los próximos 12 meses, cada uno por su lado. Un solo color (el de Maven)
// para lo pagado; el contorno, para lo que falta; el amarillo solo avisa un
// aumento. La tabla separa en columnas lo pagado este mes, lo que falta este
// mes, lo pagado en el año y el precio al mes («no me lo disfraces»). Cada
// servicio abre su ficha; cada mes de la gráfica, su desglose; y los ahorros se
// marcan para ver cómo baja la cuenta. Lógica con tests en lib/costos.ts.
// Debajo del total, «Dónde puedes bajar costos», y en cada ficha sus cuentas
// atadas (casillas, proyectos, llaves, servidores): ver CuentasAtadas.tsx.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Dónde ver la factura de cada servicio (se abre en otra pestaña). */
const PANEL: Record<string, string> = {
  google_ia: "https://aistudio.google.com/spend",
  elevenlabs: "https://elevenlabs.io/app/subscription",
  supabase_maven: "https://supabase.com/dashboard/org/tefbnffbghmtkjisjwcs/billing",
  supabase_otros: "https://supabase.com/dashboard/org/tefbnffbghmtkjisjwcs/billing",
  contabo_principal: "https://my.contabo.com/invoices",
  contabo_llamadas: "https://my.contabo.com/invoices",
  resend: "https://resend.com/settings/billing",
  zoho: "https://mailadmin.zoho.com",
  godaddy_maven: "https://account.godaddy.com/myrenewals",
  github: "https://github.com/organizations/ASM-Media-Group-LLC/settings/billing",
};

const hoyEnColombia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
const nombreDeMes = (mes: string, idioma: string, forma: "long" | "short" = "long") =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString(idioma, { month: forma }).replace(".", "");
const redondo = (n: number) => usd(Math.round(n));
const exacto = (n: number) => usd(Math.round(n * 100) / 100);

function usarCostos() {
  return useQuery({
    queryKey: ["costos-tablero"],
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [s, c] = await Promise.all([
        sinTipar.from("costos_servicios").select("*").order("orden"),
        sinTipar.from("costos_cobros").select("servicio_id, fecha, monto_usd, fuente, nota").order("fecha"),
      ]);
      if (s.error) throw new Error(s.error.message);
      if (c.error) throw new Error(c.error.message);
      return { servicios: (s.data ?? []) as ServicioCosto[], cobros: (c.data ?? []) as Cobro[] };
    },
  });
}

function Tarjeta({ titulo, derecha, children }: { titulo: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="vidrio sube flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
        {derecha}
      </div>
      {children}
    </section>
  );
}

/** Una de las tres cifras de al lado del total, con su barra (lo que va / el cierre). */
function Cifra({ etiqueta, valor, detalle, progreso }: { etiqueta: string; valor: string; detalle: string; progreso?: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-1 sm:px-5 sm:first:pl-0">
      <span className="font-display text-2xl font-semibold tabular-nums leading-none">{valor}</span>
      {progreso !== undefined && (
        <span className="h-[3px] w-full overflow-hidden rounded-full bg-border/60" aria-hidden>
          <span className="block h-full rounded-full bg-foreground/80" style={{ width: `${Math.min(100, Math.max(2, progreso * 100))}%` }} />
        </span>
      )}
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className="text-xs text-muted-foreground/80">{detalle}</span>
    </div>
  );
}

function Grafica({ serie, idioma, seleccionado, onElegir, mesHoy }: {
  serie: BarraMes[]; idioma: string; seleccionado: string; onElegir: (mes: string) => void; mesHoy: string;
}) {
  const { t } = useLanguage();
  const datos = serie.map((b) => ({
    clave: b.mes,
    mes: nombreDeMes(b.mes, idioma, "short"),
    pagado: Math.round(CATEGORIAS.reduce((a, k) => a + b.real[k], 0) * 100) / 100,
    falta: Math.round(CATEGORIAS.reduce((a, k) => a + b.proyectado[k], 0) * 100) / 100,
  }));
  return (
    <div className="h-60 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%"
          onClick={(e: { activePayload?: { payload?: { clave?: string } }[] }) => {
            const clave = e?.activePayload?.[0]?.payload?.clave;
            if (clave) onElegir(clave);
          }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.45} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false}
            tick={({ x, y, payload, index }: { x: number; y: number; payload: { value: string }; index: number }) => {
              const clave = datos[index]?.clave;
              const fuerte = clave === seleccionado || clave === mesHoy;
              return (
                <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fontWeight={fuerte ? 600 : 400}
                  fill={clave === seleccionado ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}>{payload.value}</text>
              );
            }} />
          <YAxis width={44} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const f = payload[0].payload as { pagado: number; falta: number };
              return (
                <div className="rounded-control border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                  <div className="mb-0.5 font-semibold capitalize">{String(label)}</div>
                  {f.pagado > 0 && <div className="tabular-nums">{t("oficina.costos.tooltipCobrado", { m: exacto(f.pagado) })}</div>}
                  {f.falta > 0 && <div className="tabular-nums text-muted-foreground">{t("oficina.costos.tooltipProyectado", { m: exacto(f.falta) })}</div>}
                  <div className="mt-1 text-[10px] text-muted-foreground">{t("oficina.costos.tooltipToca")}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="pagado" stackId="m" fill="hsl(var(--primary))" radius={[0, 0, 4, 4]} isAnimationActive={false} cursor="pointer" />
          <Bar dataKey="falta" stackId="m" fill="hsl(var(--primary))" fillOpacity={0.1} stroke="hsl(var(--primary))"
            strokeWidth={1.25} strokeDasharray="4 3" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** La tabla por servicio: cada número en su columna, nada mezclado. */
function TablaServicios({ tb, nombreMes, ano, onAbrir }: { tb: Tablero; nombreMes: string; ano: string; onAbrir: (id: string) => void }) {
  const { t, language } = useLanguage();
  const filas = tb.porServicio;
  const tot = filas.reduce((a, p) => ({
    pagado: a.pagado + p.mes.gastado,
    falta: a.falta + Math.max(0, p.mes.proyectado - p.mes.gastado),
    ano: a.ano + p.ano,
    alMes: a.alMes + p.alMes,
  }), { pagado: 0, falta: 0, ano: 0, alMes: 0 });
  const cols = "md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_16px]";
  const cabeza = [
    t("oficina.costos.colPagadoMes", { mes: nombreMes }),
    t("oficina.costos.colFaltaMes", { mes: nombreMes }),
    t("oficina.costos.colPagadoAno", { a: ano }),
    t("oficina.costos.colPrecio"),
  ];
  return (
    <div className="flex flex-col">
      <div className={`hidden gap-4 border-b border-border/60 pb-2 text-xs text-muted-foreground md:grid ${cols}`}>
        <span>{t("oficina.costos.colServicio")}</span>
        {cabeza.map((c) => <span key={c} className="text-right">{c}</span>)}
        <span />
      </div>
      {filas.map(({ servicio: s, mes, alMes, ano: anoS }) => {
        const falta = s.monto_usd === null;
        const pendiente = Math.max(0, mes.proyectado - mes.gastado);
        const sube = num(s.proximo_monto_usd);
        const valores = [
          falta ? "—" : exacto(mes.gastado),
          falta ? "—" : exacto(pendiente),
          falta ? "—" : exacto(anoS),
          falta ? "—" : exacto(alMes),
        ];
        return (
          <button key={s.id} type="button" onClick={() => onAbrir(s.id)}
            className={`grid grid-cols-2 gap-x-4 gap-y-1.5 border-b border-border/40 py-3 text-left transition hover:bg-muted/30 md:items-center ${cols}`}>
            <span className="col-span-2 min-w-0 md:col-span-1">
              <span className="block truncate text-sm font-medium">{s.nombre}</span>
              <span className="block text-xs text-muted-foreground">
                {s.proveedor}{s.como_se_calcula ? ` · ${s.como_se_calcula}` : ""}
              </span>
              <Revisado servicio={s} />
            </span>
            {valores.map((v, i) => (
              <span key={cabeza[i]} className="flex flex-col md:items-end">
                <span className="text-[11px] text-muted-foreground md:hidden">{cabeza[i]}</span>
                <span className={`text-sm tabular-nums ${i === 3 ? "font-semibold" : ""} ${v === "—" ? "text-muted-foreground" : ""}`}>{v}</span>
                {i === 3 && s.ciclo === "anual" && !falta && <span className="text-[10px] text-muted-foreground">{t("oficina.costos.alAno", { m: usd(Number(s.monto_usd)) })}</span>}
                {i === 3 && sube !== null && <span className="text-[10px] text-warning">{t("oficina.costos.subeA", { m: redondo(sube), f: s.proximo_cobro ? new Date(`${s.proximo_cobro}T12:00:00Z`).toLocaleDateString(language, { day: "numeric", month: "short" }) : "" })}</span>}
              </span>
            ))}
            <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
          </button>
        );
      })}
      <div className={`grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 md:items-center ${cols}`}>
        <span className="col-span-2 text-sm font-semibold md:col-span-1">{t("oficina.costos.totalMaven")}</span>
        {[tot.pagado, tot.falta, tot.ano, tot.alMes].map((v, i) => (
          <span key={cabeza[i]} className="flex flex-col md:items-end">
            <span className="text-[11px] text-muted-foreground md:hidden">{cabeza[i]}</span>
            <span className="font-display text-base font-semibold tabular-nums">{exacto(v)}</span>
          </span>
        ))}
        <span />
      </div>
    </div>
  );
}

export default function TableroCostos() {
  const { t, language } = useLanguage();
  const q = usarCostos();
  const cuentas = usarCuentas();
  const [mesElegido, setMesElegido] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (q.isError || !q.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("oficina.costos.fallo")}</span>
        <button type="button" onClick={() => void q.refetch()} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" />{t("oficina.costos.reintentar")}
        </button>
      </div>
    );
  }

  const hoy = hoyEnColombia();
  const ano = hoy.slice(0, 4);
  const dia = Number(hoy.slice(8, 10));
  const { servicios, cobros } = q.data;
  const tb = tablero(servicios, cobros, hoy);
  const serie = serieDelAno(servicios, cobros, hoy);
  const nombreMes = nombreDeMes(tb.mes, language);
  const alMes = tb.porServicio.reduce((a, p) => a + p.alMes, 0);
  const conAumento = tb.porServicio.reduce((a, p) => a + (num(p.servicio.proximo_monto_usd) ?? p.alMes), 0);
  const aumento = tb.porServicio.find((p) => num(p.servicio.proximo_monto_usd) !== null)?.servicio ?? null;
  const ahorros = dondeAhorrar(servicios).filter((s) => s.es_maven);
  const ahorroMarcado = ahorros.filter((s) => marcados.has(s.id)).reduce((a, s) => a + Number(s.ahorro_usd ?? 0), 0);
  const fuera = servicios.filter((s) => s.activo && !s.es_maven);
  const mesSel = mesElegido ?? tb.mes;
  const desglose = desgloseDelMes(servicios, cobros, hoy, mesSel);
  const totalSel = desglose.reduce((a, l) => a + l.real + l.proyectado, 0);
  const pagadoSel = desglose.reduce((a, l) => a + l.real, 0);
  const proximos = proximosCobros(tb.porServicio.map((p) => p.servicio), cobros, hoy);
  const ficha = abierto ? fichaDe(abierto, tb, servicios) : null;
  const alternar = (id: string) => setMarcados((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  let mesAnterior = "";
  return (
    <div className="flex flex-col gap-4">
      {/* El total: lo primero y lo más grande. */}
      <section className="vidrio sube grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:items-end">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{t("oficina.costos.teCuesta")}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-6xl font-bold tabular-nums tracking-tight sm:text-7xl">{redondo(alMes)}</span>
            <span className="text-lg text-muted-foreground">{t("oficina.costos.alMesLargo")}</span>
          </div>
          {aumento && conAumento > alMes && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("oficina.costos.desdeAumento", { f: new Date(`${aumento.proximo_cobro}T12:00:00Z`).toLocaleDateString(language, { day: "numeric", month: "long" }) })}{" "}
              <span className="font-semibold text-warning">{redondo(conAumento)}</span>{" "}
              {t("oficina.costos.porqueAumento", { s: aumento.proveedor })}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-border/60 lg:border-l lg:border-border/60 lg:pl-6">
          <Cifra valor={redondo(tb.gastadoMes)} progreso={tb.cierreMes ? tb.gastadoMes / tb.cierreMes : 0}
            etiqueta={t("oficina.costos.cifraMes", { mes: nombreMes, d: dia })} detalle={t("oficina.costos.cierraEn", { m: redondo(tb.cierreMes) })} />
          <Cifra valor={redondo(tb.gastadoAno)} progreso={tb.cierreAno ? tb.gastadoAno / tb.cierreAno : 0}
            etiqueta={t("oficina.costos.cifraAno", { a: ano })} detalle={t("oficina.costos.cierraEn", { m: redondo(tb.cierreAno) })} />
          <Cifra valor={redondo(tb.proximos12)} etiqueta={t("oficina.costos.kpi12")} detalle={t("oficina.costos.promedio", { m: redondo(tb.promedioProximo) })} />
        </div>
      </section>

      {/* «No me dijiste cuántas cuentas había atadas para poder bajar costos.» */}
      <BloqueBajarCostos servicios={servicios} cuentas={cuentas} onAbrir={setAbierto} />

      <Tarjeta titulo={t("oficina.costos.graficaTitulo", { a: ano })}
        derecha={<span className="text-xs text-muted-foreground">{t("oficina.costos.graficaLeyenda")}</span>}>
        <Grafica serie={serie} idioma={language} seleccionado={mesSel} onElegir={setMesElegido} mesHoy={tb.mes} />
        <div className="rounded-panel border border-border/50 p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold capitalize">{nombreDeMes(mesSel, language)} {mesSel.slice(0, 4)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {pagadoSel > 0 && totalSel > pagadoSel
                ? t("oficina.costos.desgloseMixto", { c: exacto(pagadoSel), p: exacto(totalSel - pagadoSel), t: exacto(totalSel) })
                : t("oficina.costos.desgloseTotal", { t: exacto(totalSel) })}
            </span>
          </div>
          {desglose.length === 0 ? <p className="text-xs text-muted-foreground">{t("oficina.costos.desgloseVacio")}</p> : (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {desglose.map((l) => (
                <li key={l.servicio.id}>
                  <button type="button" onClick={() => setAbierto(l.servicio.id)}
                    className="flex w-full items-center gap-3 border-b border-border/30 py-1.5 text-left text-xs transition hover:text-foreground">
                    <span className="min-w-0 flex-1 truncate">{l.servicio.nombre}</span>
                    {l.proyectado > 0 && <span className="shrink-0 text-muted-foreground">{l.real > 0 ? t("oficina.costos.parteFalta") : t("oficina.costos.porPagar")}</span>}
                    <span className="shrink-0 font-semibold tabular-nums">{exacto(l.real + l.proyectado)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo={t("oficina.costos.porServicio")} derecha={<span className="text-xs text-muted-foreground">{t("oficina.costos.tocaServicio")}</span>}>
        <TablaServicios tb={tb} nombreMes={nombreMes} ano={ano} onAbrir={setAbierto} />
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={t("oficina.costos.viene")}>
          {proximos.length === 0 ? <p className="text-sm text-muted-foreground">{t("oficina.costos.nadaViene")}</p> : (
            <div className="flex flex-col">
              {proximos.map((v) => {
                const mesV = new Date(`${v.fecha}T12:00:00Z`).toLocaleDateString(language, { month: "long", year: "numeric" });
                const cabeza = mesV !== mesAnterior;
                mesAnterior = mesV;
                return (
                  <div key={`${v.servicio.id}-${v.fecha}`}>
                    {cabeza && <div className="mb-1 mt-3 text-xs font-semibold capitalize text-muted-foreground">{mesV}</div>}
                    <button type="button" onClick={() => setAbierto(v.servicio.id)}
                      className="grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-left text-sm transition hover:text-foreground">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{v.fecha.slice(8, 10)}</span>
                      <span className="min-w-0 truncate">
                        {v.servicio.nombre}
                        {v.sube && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">{v.sube}</span>}
                      </span>
                      <span className="font-semibold tabular-nums">{exacto(v.monto)}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo={t("oficina.costos.siAhorras")}>
          {ahorros.length === 0 ? <p className="text-sm text-muted-foreground">{t("oficina.costos.nadaAhorrar")}</p> : (
            <>
              <div className="flex flex-col">
                {ahorros.map((s) => (
                  <label key={s.id} htmlFor={`ahorro-${s.id}`} className="flex cursor-pointer items-start gap-3 border-b border-border/40 py-2.5">
                    <input id={`ahorro-${s.id}`} type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={marcados.has(s.id)} onChange={() => alternar(s.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{s.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{s.ahorro_detalle}</span>
                    </span>
                    <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-success">−{exacto(Number(s.ahorro_usd))}</span>
                  </label>
                ))}
              </div>
              <div className="rounded-panel bg-primary/10 p-3 text-sm">
                {ahorroMarcado > 0
                  ? t("oficina.costos.simResultado", { de: redondo(conAumento), a: redondo(conAumento - ahorroMarcado), ano: redondo(ahorroMarcado * 12) })
                  : t("oficina.costos.simVacio", { m: redondo(conAumento) })}
              </div>
              <p className="text-[11px] text-muted-foreground">{t("oficina.costos.ahorrarNota")}</p>
            </>
          )}
        </Tarjeta>
      </div>

      {fuera.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("oficina.costos.fueraLinea", { m: redondo(fuera.reduce((a, s) => a + (mensual(s) ?? 0), 0)), lista: fuera.map((s) => `${s.nombre}${s.ahorro_detalle ? ` (${s.ahorro_detalle})` : ""}`).join(" · ") })}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{t("oficina.costos.pie")}</p>

      <Sheet open={!!ficha} onOpenChange={(o) => { if (!o) setAbierto(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {ficha && <FichaServicio ficha={ficha} cobros={cobros.filter((c) => c.servicio_id === ficha.servicio.id)} hoy={hoy} idioma={language} nombreMes={nombreMes} cuentas={cuentas} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** «Lo revisé» (con dónde) o «no lo puedo ver, déjame entrar», en una línea. */
function Revisado({ servicio: s }: { servicio: ServicioCosto }) {
  const noLoVeo = s.fuente === "falta";
  if (!s.revisado) return null;
  return (
    <span className={`mt-0.5 flex items-start gap-1 text-[11px] ${noLoVeo ? "text-warning" : "text-muted-foreground/80"}`}>
      {noLoVeo ? <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> : <CheckCircle2 className="mt-px h-3 w-3 shrink-0 text-success" />}
      <span className="min-w-0">{s.revisado}</span>
    </span>
  );
}

/** ¿La fecha (YYYY-MM-DD) es después de hoy? */
function esFutura(fecha: string, hoy: string): boolean {
  return fecha.localeCompare(hoy) > 0;
}

/** La ficha que se abre: la de un servicio de Maven (con lo que gastó) o, si
 *  no es Maven (los otros proyectos de Supabase), solo su precio y sus cuentas. */
function fichaDe(id: string, tb: Tablero, servicios: ServicioCosto[]): Tablero["porServicio"][number] | null {
  const deMaven = tb.porServicio.find((p) => p.servicio.id === id);
  if (deMaven) return deMaven;
  const s = servicios.find((x) => x.id === id && x.activo);
  return s ? { servicio: s, mes: { gastado: 0, proyectado: 0 }, alMes: mensual(s) ?? 0, ano: 0 } : null;
}

/** La ficha de un servicio: lo pagado este mes y en el año, el precio, cada cobro, sus cuentas atadas y cómo ahorrar. */
function FichaServicio({ ficha, cobros, hoy, idioma, nombreMes, cuentas }: {
  ficha: Tablero["porServicio"][number]; cobros: Cobro[]; hoy: string; idioma: string; nombreMes: string;
  cuentas: UseQueryResult<CuentaAtada[]>;
}) {
  const { t } = useLanguage();
  const { servicio: s, mes, alMes, ano } = ficha;
  const pasados = cobros.filter((c) => !esFutura(c.fecha, hoy)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anunciados = cobros.filter((c) => esFutura(c.fecha, hoy));
  const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString(idioma, { day: "numeric", month: "short", year: "numeric" });
  const panel = PANEL[s.id];
  const falta = s.monto_usd === null;
  // Lo que no es Maven no tiene «gastado por Maven»: se muestra solo su precio.
  const sinGasto = falta || !s.es_maven;
  // Si sus cuentas ya dicen cuánto se ahorra, el ahorro del servicio no se repite.
  const ahorroEnCuentas = (cuentas.data ?? []).some((c) => c.servicio_id === s.id && (num(c.ahorro_usd_mes) ?? 0) > 0);
  return (
    <div className="flex flex-col gap-5">
      <SheetHeader className="text-left">
        <SheetTitle className="text-base">{s.nombre}</SheetTitle>
        <SheetDescription>{s.proveedor}</SheetDescription>
        <Revisado servicio={s} />
      </SheetHeader>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-border/50 bg-border/50">
        {[
          [t("oficina.costos.colPagadoMes", { mes: nombreMes }), sinGasto ? "—" : exacto(mes.gastado)],
          [t("oficina.costos.colFaltaMes", { mes: nombreMes }), sinGasto ? "—" : exacto(Math.max(0, mes.proyectado - mes.gastado))],
          [t("oficina.costos.colPagadoAno", { a: hoy.slice(0, 4) }), sinGasto ? "—" : exacto(ano)],
          [t("oficina.costos.colPrecio"), falta ? "—" : exacto(alMes)],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-3">
            <div className="font-display text-lg font-semibold tabular-nums leading-tight">{v}</div>
            <div className="text-[11px] text-muted-foreground">{k}</div>
          </div>
        ))}
      </div>

      {s.como_se_calcula && (
        <div className="rounded-panel bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{t("oficina.costos.comoSeCalcula")} </span>{s.como_se_calcula}
        </div>
      )}
      {s.detalle && <p className="text-sm text-muted-foreground">{s.detalle}</p>}
      {s.proximo_detalle && <p className="text-sm text-warning">{s.proximo_detalle}</p>}

      {s.es_maven && (anunciados.length > 0 || (s.dia_cobro && !falta)) && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("oficina.costos.fichaProximo")}</h3>
          {anunciados.map((c) => (
            <div key={`${c.fecha}-${c.monto_usd}`} className="flex items-center justify-between text-sm">
              <span>{fecha(c.fecha)}{c.nota && <span className="block text-[11px] text-muted-foreground">{c.nota}</span>}</span>
              <span className="font-semibold tabular-nums">{exacto(Number(c.monto_usd))}</span>
            </div>
          ))}
          {anunciados.length === 0 && s.dia_cobro && !falta && (
            <p className="text-sm">{t("oficina.costos.fichaCadaMes", { d: s.dia_cobro, m: exacto(Number(s.monto_usd)) })}</p>
          )}
        </div>
      )}

      {s.es_maven && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-muted-foreground">{t("oficina.costos.fichaCobros", { n: pasados.length })}</h3>
          {pasados.length === 0 ? <p className="text-xs text-muted-foreground">{t("oficina.costos.fichaSinCobros")}</p> : (
            <ul className="flex flex-col divide-y divide-border/40 rounded-panel border border-border/50">
              {pasados.map((c, i) => (
                <li key={`${c.fecha}-${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{fecha(c.fecha)}</span>
                  <span className="min-w-0 truncate text-xs">{c.nota ?? ""}{c.fuente === "estimado" ? ` · ${t("oficina.costos.fuente.estimado").toLowerCase()}` : ""}</span>
                  <span className="text-sm font-semibold tabular-nums">{exacto(Number(c.monto_usd))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SeccionCuentas servicioId={s.id} cuentas={cuentas} />

      {s.ahorro_detalle && Number(s.ahorro_usd) > 0 && !ahorroEnCuentas && (
        <div className="rounded-panel border border-success/30 bg-success/5 p-3">
          <div className="font-display text-base font-semibold tabular-nums text-success">{t("oficina.costos.fichaAhorro", { m: redondo(Number(s.ahorro_usd)) })}</div>
          <p className="text-xs text-muted-foreground">{s.ahorro_detalle}</p>
        </div>
      )}

      {panel && (
        <a href={panel} target="_blank" rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          <ExternalLink className="h-4 w-4" />{t("oficina.costos.fichaPanel", { p: s.proveedor })}
        </a>
      )}
    </div>
  );
}

/** Los próximos cobros de 60 días: cada servicio fijo en su día (o el cobro ya
 *  anunciado, con su monto real), el anual en su fecha y el aumento anunciado. */
function proximosCobros(servicios: ServicioCosto[], cobros: Cobro[], hoy: string): { fecha: string; servicio: ServicioCosto; monto: number; sube: string | null }[] {
  const tope = new Date(Date.parse(`${hoy}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);
  const out: { fecha: string; servicio: ServicioCosto; monto: number; sube: string | null }[] = [];
  for (const s of servicios) {
    const monto = Number(s.monto_usd);
    if (!s.activo || !s.es_maven || s.monto_usd === null || !Number.isFinite(monto) || monto <= 0) continue;
    if (s.ciclo === "anual") {
      if (s.proximo_cobro && esFutura(s.proximo_cobro, hoy) && !esFutura(s.proximo_cobro, tope)) out.push({ fecha: s.proximo_cobro, servicio: s, monto, sube: null });
      continue;
    }
    if (s.ciclo === "uso") {
      const nuevo = num(s.proximo_monto_usd);
      if (s.proximo_cobro && nuevo !== null && esFutura(s.proximo_cobro, hoy) && !esFutura(s.proximo_cobro, tope)) {
        out.push({ fecha: s.proximo_cobro, servicio: s, monto: nuevo, sube: `+${Math.round((nuevo / monto - 1) * 100)} %` });
      }
      continue;
    }
    if (!s.dia_cobro) continue;
    for (let k = 0; k < 3; k++) {
      const base = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 + k, 1));
      const fin = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      const f = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(s.dia_cobro, fin))).toISOString().slice(0, 10);
      const anunciado = cobros.find((c) => c.servicio_id === s.id && c.fecha.slice(0, 7) === f.slice(0, 7) && esFutura(c.fecha, hoy));
      if (esFutura(f, hoy) && !esFutura(f, tope)) out.push({ fecha: anunciado?.fecha ?? f, servicio: s, monto: anunciado ? Number(anunciado.monto_usd) : monto, sube: null });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
