import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarClock, CalendarRange, ChevronRight, ExternalLink, Loader2, PiggyBank, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import {
  CATEGORIAS, desgloseDelMes, dondeAhorrar, mensual, serieDelAno, tablero, usd,
  type BarraMes, type Categoria, type Cobro, type ServicioCosto,
} from "@/lib/costos";

// EL TABLERO DE COSTOS (Alvaro, 11/11/2026: «cuánto voy gastando este mes,
// cuánto es el del año, cuánto me va a costar la proyección… algo bien hecho»).
// Arriba los tres números; la gráfica mes a mes de 2026 (lo cobrado sólido, lo
// proyectado claro); en qué se va la plata; los próximos cobros; dónde ahorrar.
// Los datos: costos_servicios (lo que vale cada servicio y su día de cobro) y
// costos_cobros (cada cobro real de 2026). Lógica con tests en lib/costos.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Colores por categoría: orden fijo, validados para daltonismo y contraste
 *  (skill dataviz) sobre la superficie oscura y la clara de Maven. */
const COLOR: Record<"dark" | "light", Record<Categoria, string>> = {
  dark: { ia: "#3987e5", servidores: "#d95926", correos: "#199e70", otras: "#c98500" },
  light: { ia: "#2a78d6", servidores: "#eb6834", correos: "#1baf7a", otras: "#eda100" },
};
const CLAVE_CAT: Record<Categoria, TranslationKey> = {
  ia: "oficina.costos.cat.ia", servidores: "oficina.costos.cat.servidores", correos: "oficina.costos.cat.correos", otras: "oficina.costos.cat.otras",
};
const CLAVE_FUENTE: Record<string, TranslationKey> = {
  factura: "oficina.costos.fuente.factura", estimado: "oficina.costos.fuente.estimado", falta: "oficina.costos.fuente.falta",
};

/** Dónde ver la factura de cada servicio (se abre en otra pestaña). */
const PANEL: Record<string, string> = {
  claude: "https://claude.ai/settings/billing",
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

const nombreDeMes = (mes: string, idioma: string, forma: "long" | "short" = "long") =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString(idioma, { month: forma }).replace(".", "");

const hoyEnColombia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });

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

function Panel({ icono: Icono, titulo, nota, derecha, children }: {
  icono: typeof Wallet; titulo: string; nota?: ReactNode; derecha?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="vidrio sube flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><Icono className="h-4 w-4" /></span>
            {titulo}
          </h2>
          {nota && <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{nota}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}

/** Un número grande con su barra (lo que va contra lo que se espera). */
function Grande({ etiqueta, valor, detalle, progreso, icono: Icono }: {
  etiqueta: string; valor: string; detalle: string; progreso?: number; icono: typeof Wallet;
}) {
  return (
    <div className="vidrio vidrio-glow glow-b flex flex-col gap-2 p-4 sm:p-5">
      <div className="v-cont flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icono className="h-4 w-4 text-primary" />{etiqueta}
      </div>
      <div className="v-cont font-display text-3xl font-bold tabular-nums leading-none sm:text-4xl">{valor}</div>
      {progreso !== undefined && (
        <div className="v-cont h-1.5 w-full overflow-hidden rounded-full bg-border/50" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(2, progreso * 100))}%` }} />
        </div>
      )}
      <p className="v-cont text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

function Pastilla({ fuente }: { fuente: string }) {
  const { t } = useLanguage();
  const tono = fuente === "factura" ? "border-success/40 text-success" : fuente === "estimado" ? "border-warning/40 text-warning" : "border-destructive/40 text-destructive";
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${tono}`}>{t(CLAVE_FUENTE[fuente] ?? "oficina.costos.fuente.falta")}</span>;
}

function Grafica({ serie, colores, idioma, ocultas, seleccionado, onElegir }: {
  serie: BarraMes[]; colores: Record<Categoria, string>; idioma: string;
  ocultas: Set<Categoria>; seleccionado: string; onElegir: (mes: string) => void;
}) {
  const { t } = useLanguage();
  const visibles = CATEGORIAS.filter((k) => !ocultas.has(k));
  const datos = serie.map((b) => {
    const fila: Record<string, number | string> = { mes: nombreDeMes(b.mes, idioma, "short"), clave: b.mes };
    for (const k of visibles) { fila[`r_${k}`] = b.real[k]; fila[`p_${k}`] = b.proyectado[k]; }
    fila.total = CATEGORIAS.reduce((a, k) => a + b.real[k] + b.proyectado[k], 0);
    return fila;
  });
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%"
          onClick={(e: { activePayload?: { payload?: { clave?: string } }[] }) => {
            const clave = e?.activePayload?.[0]?.payload?.clave;
            if (clave) onElegir(clave);
          }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false}
            tick={({ x, y, payload, index }: { x: number; y: number; payload: { value: string }; index: number }) => (
              <text x={x} y={y + 12} textAnchor="middle" fontSize={11}
                fill={datos[index]?.clave === seleccionado ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                fontWeight={datos[index]?.clave === seleccionado ? 700 : 400}>{payload.value}</text>
            )} />
          <YAxis width={44} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0].payload as Record<string, number>;
              const real = visibles.reduce((a, k) => a + (fila[`r_${k}`] ?? 0), 0);
              const proy = visibles.reduce((a, k) => a + (fila[`p_${k}`] ?? 0), 0);
              return (
                <div className="rounded-control border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                  <div className="mb-1 font-semibold capitalize">{String(label)}</div>
                  {visibles.map((k) => {
                    const v = (fila[`r_${k}`] ?? 0) + (fila[`p_${k}`] ?? 0);
                    if (!v) return null;
                    return (
                      <div key={k} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: colores[k] }} />{t(CLAVE_CAT[k])}</span>
                        <span className="tabular-nums">{usd(Math.round(v * 100) / 100)}</span>
                      </div>
                    );
                  })}
                  <div className="mt-1 border-t border-border/60 pt-1 tabular-nums">
                    {real > 0 && <div>{t("oficina.costos.tooltipCobrado", { m: usd(Math.round(real * 100) / 100) })}</div>}
                    {proy > 0 && <div className="text-muted-foreground">{t("oficina.costos.tooltipProyectado", { m: usd(Math.round(proy * 100) / 100) })}</div>}
                    <div className="mt-1 text-[10px] text-muted-foreground">{t("oficina.costos.tooltipToca")}</div>
                  </div>
                </div>
              );
            }}
          />
          {visibles.map((k) => (
            <Bar key={`r_${k}`} dataKey={`r_${k}`} stackId="mes" fill={colores[k]} stroke="hsl(var(--card))" strokeWidth={1.5}
              isAnimationActive={false} cursor="pointer" />
          ))}
          {visibles.map((k) => (
            <Bar key={`p_${k}`} dataKey={`p_${k}`} stackId="mes" fill={colores[k]} fillOpacity={0.32} stroke={colores[k]}
              strokeOpacity={0.7} strokeDasharray="3 2" strokeWidth={1} isAnimationActive={false} cursor="pointer" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function TableroCostos() {
  const { t, language } = useLanguage();
  const { resolvedTheme } = useTheme();
  const colores = COLOR[resolvedTheme === "light" ? "light" : "dark"];
  const q = usarCostos();
  const [mesElegido, setMesElegido] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<Set<Categoria>>(new Set());
  const [abierto, setAbierto] = useState<string | null>(null);

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
  const { servicios, cobros } = q.data;
  const tb = tablero(servicios, cobros, hoy);
  const serie = serieDelAno(servicios, cobros, hoy);
  const proximos = proximosCobros(tb.porServicio.map((p) => p.servicio), cobros, hoy);
  const ahorrar = dondeAhorrar(servicios);
  const ahorroTotal = ahorrar.reduce((a, s) => a + Number(s.ahorro_usd ?? 0), 0);
  const faltantes = servicios.filter((s) => s.activo && s.es_maven && s.monto_usd === null);
  const fuera = servicios.filter((s) => s.activo && !s.es_maven);
  const nombreMes = new Date(`${tb.mes}-15T12:00:00Z`).toLocaleDateString(language, { month: "long" });
  const dia = Number(hoy.slice(8, 10));
  const totalAlMes = tb.porServicio.reduce((a, p) => a + p.alMes, 0) || 1;
  const colorDe = (s: ServicioCosto) => colores[s.categoria];
  const mesSel = mesElegido ?? tb.mes;
  const desglose = desgloseDelMes(servicios, cobros, hoy, mesSel);
  const totalSel = desglose.reduce((a, l) => a + l.real + l.proyectado, 0);
  const realSel = desglose.reduce((a, l) => a + l.real, 0);
  const alternar = (k: Categoria) => setOcultas((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else if (n.size < CATEGORIAS.length - 1) n.add(k);
    return n;
  });
  const ficha = abierto ? tb.porServicio.find((p) => p.servicio.id === abierto) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Grande icono={Wallet} etiqueta={t("oficina.costos.kpiMes", { mes: nombreMes, d: dia })} valor={usd(Math.round(tb.gastadoMes))}
          progreso={tb.cierreMes ? tb.gastadoMes / tb.cierreMes : 0} detalle={t("oficina.costos.kpiMesCierre", { m: usd(Math.round(tb.cierreMes)) })} />
        <Grande icono={CalendarRange} etiqueta={t("oficina.costos.kpiAno", { a: hoy.slice(0, 4) })} valor={usd(Math.round(tb.gastadoAno))}
          progreso={tb.cierreAno ? tb.gastadoAno / tb.cierreAno : 0} detalle={t("oficina.costos.kpiAnoCierre", { m: usd(Math.round(tb.cierreAno)) })} />
        <Grande icono={TrendingUp} etiqueta={t("oficina.costos.kpi12")} valor={usd(Math.round(tb.proximos12))}
          detalle={t("oficina.costos.kpi12Det", { m: usd(Math.round(tb.promedioProximo)) })} />
      </div>

      {faltantes.length > 0 && (
        <p className="flex items-start gap-2 rounded-panel border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          {t("oficina.costos.faltanCorto", { lista: faltantes.map((s) => s.nombre).join(" · ") })}
        </p>
      )}

      <Panel icono={CalendarRange} titulo={t("oficina.costos.graficaTitulo", { a: hoy.slice(0, 4) })} nota={t("oficina.costos.graficaNota")}
        derecha={(
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {CATEGORIAS.map((k) => {
              const apagada = ocultas.has(k);
              return (
                <button key={k} type="button" onClick={() => alternar(k)} aria-pressed={!apagada}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${apagada ? "border-border/40 text-muted-foreground/60 line-through" : "border-border/70 text-foreground hover:bg-muted/50"}`}>
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: apagada ? "transparent" : colores[k], border: `1px solid ${colores[k]}` }} />
                  {t(CLAVE_CAT[k])}
                </button>
              );
            })}
            <span className="flex items-center gap-1.5 px-1 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted-foreground/70" />{t("oficina.costos.leyendaProyectado")}</span>
          </div>
        )}>
        <Grafica serie={serie} colores={colores} idioma={language} ocultas={ocultas} seleccionado={mesSel} onElegir={setMesElegido} />
        <div className="rounded-panel border border-border/50 bg-background/30 p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold capitalize">{t("oficina.costos.desgloseTitulo", { mes: `${nombreDeMes(mesSel, language)} ${mesSel.slice(0, 4)}` })}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {realSel > 0 && totalSel > realSel
                ? t("oficina.costos.desgloseMixto", { c: usd(Math.round(realSel)), p: usd(Math.round(totalSel - realSel)), t: usd(Math.round(totalSel)) })
                : t("oficina.costos.desgloseTotal", { t: usd(Math.round(totalSel)) })}
            </span>
          </div>
          {desglose.length === 0 ? <p className="text-xs text-muted-foreground">{t("oficina.costos.desgloseVacio")}</p> : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {desglose.map((l) => (
                <li key={l.servicio.id}>
                  <button type="button" onClick={() => setAbierto(l.servicio.id)}
                    className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition hover:bg-muted/50">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorDe(l.servicio) }} />
                    <span className="min-w-0 flex-1 truncate text-xs">{l.servicio.nombre}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">{usd(Math.round((l.real + l.proyectado) * 100) / 100)}</span>
                    {l.proyectado > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{l.real > 0 ? t("oficina.costos.parteFalta") : t("oficina.costos.proyectadoCorto")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel icono={Wallet} titulo={t("oficina.costos.enQueSeVa")} nota={t("oficina.costos.enQueSeVaNota")}>
          <ul className="flex flex-col divide-y divide-border/40">
            {tb.porServicio.map(({ servicio: s, mes, alMes, ano }) => (
              <li key={s.id} className="py-1 first:pt-0 last:pb-0">
                <button type="button" onClick={() => setAbierto(s.id)}
                  className="flex w-full flex-col gap-1.5 rounded-control px-2 py-1.5 text-left transition hover:bg-muted/40">
                <div className="flex w-full items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel text-sm font-bold"
                    style={{ background: `${colorDe(s)}26`, color: colorDe(s) }}>{s.proveedor.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{s.nombre}</span>
                      <Pastilla fuente={s.fuente} />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.monto_usd === null ? t("oficina.costos.sinDato")
                        : t("oficina.costos.lineaServicio", { mes: usd(Math.round(mes.proyectado)), ano: usd(Math.round(ano)) })}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-base font-bold tabular-nums">{s.monto_usd === null ? "—" : usd(Math.round(alMes))}</div>
                    <div className="text-[10px] text-muted-foreground">{s.ciclo === "anual" ? t("oficina.costos.alMesAnual") : t("oficina.costos.alMesLargo")}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                {s.monto_usd !== null && (
                  <div className="ml-12 mr-7 flex items-center gap-2" aria-hidden>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/40">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(1, (alMes / totalAlMes) * 100)}%`, background: colorDe(s) }} />
                    </div>
                    <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">{Math.round((alMes / totalAlMes) * 100)} %</span>
                  </div>
                )}
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel icono={CalendarClock} titulo={t("oficina.costos.viene")} nota={t("oficina.costos.vieneNota60")}>
            {proximos.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("oficina.costos.nadaViene")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {proximos.map((v) => (
                  <li key={`${v.servicio.id}-${v.fecha}`} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-center">
                      <span className="block font-display text-lg font-bold leading-none tabular-nums">{v.fecha.slice(8, 10)}</span>
                      <span className="block text-[10px] uppercase text-muted-foreground">{new Date(`${v.fecha}T12:00:00Z`).toLocaleDateString(language, { month: "short" }).replace(".", "")}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{v.servicio.nombre}</div>
                      {v.nota && <div className="text-[11px] text-warning">{v.nota}</div>}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{usd(Math.round(v.monto * 100) / 100)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icono={PiggyBank} titulo={t("oficina.costos.ahorrar")}
            derecha={ahorroTotal > 0 ? <span className="font-display text-lg font-bold tabular-nums text-success">{t("oficina.costos.ahorroTotal", { m: usd(Math.round(ahorroTotal)) })}</span> : undefined}
            nota={t("oficina.costos.ahorrarNota")}>
            {ahorrar.length === 0 ? <p className="text-sm text-muted-foreground">{t("oficina.costos.nadaAhorrar")}</p> : (
              <ul className="flex flex-col gap-2">
                {ahorrar.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 rounded-control border border-border/40 p-2.5">
                    <span className="w-16 shrink-0 font-display text-sm font-bold tabular-nums text-success">{usd(Math.round(Number(s.ahorro_usd)))}</span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.nombre}</div><p className="text-xs text-muted-foreground">{s.ahorro_detalle}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {fuera.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("oficina.costos.fueraLinea", { m: usd(Math.round(fuera.reduce((a, s) => a + (mensual(s) ?? 0), 0))), lista: fuera.map((s) => s.nombre).join(" · ") })}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">{t("oficina.costos.pie")}</p>

      <Sheet open={!!ficha} onOpenChange={(o) => { if (!o) setAbierto(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {ficha && (
            <FichaServicio ficha={ficha} cobros={cobros.filter((c) => c.servicio_id === ficha.servicio.id)} hoy={hoy}
              color={colorDe(ficha.servicio)} idioma={language} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** ¿La fecha (YYYY-MM-DD) es después de hoy? */
function esFutura(fecha: string, hoy: string): boolean {
  return fecha.localeCompare(hoy) > 0;
}

/** La ficha de un servicio: lo que vale, lo que va, cada cobro y cómo ahorrar. */
function FichaServicio({ ficha, cobros, hoy, color, idioma }: {
  ficha: { servicio: ServicioCosto; mes: { gastado: number; proyectado: number }; alMes: number; ano: number };
  cobros: Cobro[]; hoy: string; color: string; idioma: string;
}) {
  const { t } = useLanguage();
  const { servicio: s, mes, alMes, ano } = ficha;
  const pasados = cobros.filter((c) => !esFutura(c.fecha, hoy)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const anunciados = cobros.filter((c) => esFutura(c.fecha, hoy));
  const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString(idioma, { day: "numeric", month: "short", year: "numeric" });
  const panel = PANEL[s.id];
  return (
    <div className="flex flex-col gap-5">
      <SheetHeader className="text-left">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-panel text-lg font-bold" style={{ background: `${color}26`, color }}>{s.proveedor.charAt(0)}</span>
          <div className="min-w-0">
            <SheetTitle className="text-base">{s.nombre}</SheetTitle>
            <SheetDescription className="flex items-center gap-2">{s.proveedor} · <Pastilla fuente={s.fuente} /></SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "oficina.costos.fichaAlMes" as const, v: s.monto_usd === null ? "—" : usd(Math.round(alMes * 100) / 100) },
          { k: "oficina.costos.fichaEsteMes" as const, v: usd(Math.round(mes.proyectado * 100) / 100) },
          { k: "oficina.costos.fichaAno" as const, v: usd(Math.round(ano * 100) / 100) },
        ].map((x) => (
          <div key={x.k} className="rounded-panel border border-border/50 p-2.5">
            <div className="font-display text-lg font-bold tabular-nums leading-tight">{x.v}</div>
            <div className="text-[10px] text-muted-foreground">{t(x.k)}</div>
          </div>
        ))}
      </div>

      {s.detalle && <p className="text-sm text-muted-foreground">{s.detalle}</p>}

      {(anunciados.length > 0 || s.proximo_cobro || s.dia_cobro) && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold">{t("oficina.costos.fichaProximo")}</h3>
          {anunciados.map((c) => (
            <div key={`${c.fecha}-${c.monto_usd}`} className="flex items-center justify-between text-sm">
              <span>{fecha(c.fecha)}{c.nota && <span className="block text-[11px] text-muted-foreground">{c.nota}</span>}</span>
              <span className="font-semibold tabular-nums">{usd(Number(c.monto_usd))}</span>
            </div>
          ))}
          {anunciados.length === 0 && s.dia_cobro && s.monto_usd !== null && (
            <p className="text-sm">{t("oficina.costos.fichaCadaMes", { d: s.dia_cobro, m: usd(Number(s.monto_usd)) })}</p>
          )}
          {s.proximo_detalle && <p className="text-xs text-warning">{s.proximo_detalle}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold">{t("oficina.costos.fichaCobros", { n: pasados.length })}</h3>
        {pasados.length === 0 ? <p className="text-xs text-muted-foreground">{t("oficina.costos.fichaSinCobros")}</p> : (
          <ul className="flex flex-col divide-y divide-border/40 rounded-panel border border-border/50">
            {pasados.map((c, i) => (
              <li key={`${c.fecha}-${i}`} className="flex items-center gap-3 px-3 py-2">
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{fecha(c.fecha)}</span>
                <span className="min-w-0 flex-1 truncate text-xs">{c.nota ?? ""}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{usd(Number(c.monto_usd))}</span>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.fuente === "factura" ? "bg-success" : "bg-warning"}`}
                  title={t(c.fuente === "factura" ? "oficina.costos.fuente.factura" : "oficina.costos.fuente.estimado")} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {s.ahorro_detalle && Number(s.ahorro_usd) > 0 && (
        <div className="rounded-panel border border-success/30 bg-success/5 p-3">
          <div className="font-display text-base font-bold text-success tabular-nums">{t("oficina.costos.fichaAhorro", { m: usd(Math.round(Number(s.ahorro_usd))) })}</div>
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

/** Los próximos cobros de 60 días: cada servicio fijo en su día, el anual en su
 *  fecha y el aumento anunciado (Google, 1 de enero) como aviso. */
function proximosCobros(servicios: ServicioCosto[], cobros: Cobro[], hoy: string): { fecha: string; servicio: ServicioCosto; monto: number; nota: string | null }[] {
  const tope = new Date(Date.parse(`${hoy}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);
  const out: { fecha: string; servicio: ServicioCosto; monto: number; nota: string | null }[] = [];
  for (const s of servicios) {
    const monto = Number(s.monto_usd);
    if (!s.activo || !s.es_maven || s.monto_usd === null || !Number.isFinite(monto) || monto <= 0) continue;
    if (s.ciclo === "anual") {
      if (s.proximo_cobro && s.proximo_cobro >= hoy && s.proximo_cobro <= tope) out.push({ fecha: s.proximo_cobro, servicio: s, monto, nota: null });
      continue;
    }
    if (s.ciclo === "uso") {
      if (s.proximo_cobro && s.proximo_monto_usd !== null && s.proximo_cobro >= hoy && s.proximo_cobro <= tope) {
        out.push({ fecha: s.proximo_cobro, servicio: s, monto: Number(s.proximo_monto_usd), nota: s.proximo_detalle });
      }
      continue;
    }
    if (!s.dia_cobro) continue;
    for (let k = 0; k < 3; k++) {
      const base = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 + k, 1));
      const fin = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      const f = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(s.dia_cobro, fin))).toISOString().slice(0, 10);
      // Si el cobro ya está anunciado (Supabase del 14), va con su monto real.
      const anunciado = cobros.find((c) => c.servicio_id === s.id && c.fecha.slice(0, 7) === f.slice(0, 7) && c.fecha > hoy);
      if (f > hoy && f <= tope) out.push({ fecha: anunciado?.fecha ?? f, servicio: s, monto: anunciado ? Number(anunciado.monto_usd) : monto, nota: null });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
