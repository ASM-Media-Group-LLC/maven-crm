import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { calcularTableroGasto, type DiaGasto, type FilaGasto, type TableroGasto as Tablero } from "@/lib/tableroGasto";
import SaldoGemini from "./SaldoGemini";
import { Cargando, FalloCompacto, Panel, exacto, fechaCorta, hoyEnColombia, nombreDeMes, useCostos, useUsoDelMes } from "./comun";

// EL TABLERO DE GASTO (Alvaro, 14/11/2026). Estructura elegida por Q&A: UN bloque
// grande arriba (lo gastado del mes enorme, «hoy +X», la barra del mes pintada por
// servicio y el gráfico de cada día) y una tarjeta por servicio con su color.
// Estética elegida el 15/11: «como la portada» — el «cuadrito» de Oficina.tsx /
// portada.css: una CONSOLA con profundidad (filo de luz arriba, sombra honda y un
// brillo suave de color), la barrita de consola (semáforo, «en vivo» latiendo y el
// reloj en letra mono), las tarjetas de servicio como las salas (fondo apenas
// iluminado, se encienden con el color de su servicio) y el día de hoy que brilla.
// Los colores son los --chart-* de index.css: no dependen del skin (con un primario
// gris, Argos se confundía con lo fijo). Sin clases nuevas en index.css (regla del
// sistema de diseño): todo con utilidades. Las cuentas viven en lib/tableroGasto.ts.

/** El color de cada servicio, el mismo en todo el tablero. */
const COLOR_SERVICIO: Record<string, string> = {
  google_ia: "hsl(var(--chart-5))",
  supabase_maven: "hsl(var(--chart-1))",
  contabo_llamadas: "hsl(var(--chart-2))",
  resend: "hsl(var(--chart-4))",
  elevenlabs: "hsl(var(--chart-6))",
  godaddy_maven: "hsl(var(--chart-3))",
};
const colorDe = (id: string) => COLOR_SERVICIO[id] ?? "hsl(var(--muted-foreground) / 0.6)";

/** Nombre corto de cada servicio en su tarjeta (el largo queda en el título al pasar el mouse). */
const NOMBRE_CORTO: Record<string, TranslationKey> = {
  google_ia: "oficina.costos.tablero.corto.google_ia",
  supabase_maven: "oficina.costos.tablero.corto.supabase_maven",
  contabo_llamadas: "oficina.costos.tablero.corto.contabo_llamadas",
  resend: "oficina.costos.tablero.corto.resend",
  elevenlabs: "oficina.costos.tablero.corto.elevenlabs",
  godaddy_maven: "oficina.costos.tablero.corto.godaddy_maven",
};

/** Los servicios que cuestan (los de USD 0 no pintan nada). */
const conCosto = (tb: Tablero) => tb.filas.filter((f) => (f.alMes ?? 0) > 0 || (f.gastado ?? 0) > 0);

/** «USD 113,35» con el USD y los centavos más chicos: la cifra manda. */
function Monto({ valor, tam }: { valor: number; tam: "xl" | "md" }) {
  const texto = valor.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const coma = texto.lastIndexOf(",");
  const entero = coma >= 0 ? texto.slice(0, coma) : texto;
  const cent = coma >= 0 ? texto.slice(coma) : "";
  const grande = tam === "xl";
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap font-display tabular-nums text-foreground">
      <span className={`font-semibold text-muted-foreground ${grande ? "text-lg sm:text-xl" : "text-xs"}`}>USD</span>
      <span className={`font-semibold tracking-tight ${grande ? "text-5xl sm:text-6xl" : "text-2xl"}`}>{entero}</span>
      <span className={`-ml-1 font-semibold text-foreground/60 ${grande ? "text-2xl sm:text-3xl" : "text-sm"}`}>{cent}</span>
    </span>
  );
}

/** El reloj de pared de la barrita (cada 30 s alcanza: muestra horas y minutos). */
function useReloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return ahora;
}

function BarritaDeConsola({ hoy }: { hoy: string }) {
  const { t, language } = useLanguage();
  const ahora = useReloj();
  return (
    <div className="flex items-center gap-2.5 border-b border-border/60 bg-foreground/[0.02] px-4 py-2.5 sm:px-5">
      <span aria-hidden className="flex shrink-0 items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
        <span className="h-2 w-2 rounded-full bg-foreground/15" />
      </span>
      <span className="truncate font-mono text-xs tracking-wide text-muted-foreground">
        {t("oficina.costos.tablero.consola", { mes: nombreDeMes(hoy, language) })}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 px-2 py-0.5 font-mono text-[10.5px] tracking-wide text-success">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        {t("oficina.costos.tablero.enVivo")}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/70">
        {ahora.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}

function BarraDelMes({ tb }: { tb: Tablero }) {
  const filas = conCosto(tb);
  const llenado = tb.proyeccion > 0 ? Math.min(100, (tb.gastado / tb.proyeccion) * 100) : 0;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.07] [box-shadow:inset_0_1px_2px_rgb(0_0_0/.25)]">
      <div className="flex h-full gap-px" style={{ width: `${llenado}%` }}>
        {filas.map((f) => (
          <div key={f.id} className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${tb.gastado > 0 ? ((f.gastado ?? 0) / tb.gastado) * 100 : 0}%`, background: colorDe(f.id), boxShadow: `0 0 12px -2px ${colorDe(f.id)}` }} />
        ))}
      </div>
    </div>
  );
}

function GraficoDiario({ tb, hoy }: { tb: Tablero; hoy: string }) {
  const { t, language } = useLanguage();
  const fijos = conCosto(tb).filter((f) => !f.porUso).map((f) => ({ id: f.id, porDia: (f.alMes ?? 0) / tb.diasDelMes }));
  const argosId = tb.filas.find((f) => f.porUso)?.id ?? "google_ia";
  const total = (d: DiaGasto) => d.fijo + d.argos;
  const max = Math.max(0.01, ...tb.serie.map(total));
  const diaHoy = Number(hoy.slice(8, 10));
  const marcas = new Set([1, 8, 15, 22, tb.serie.length]);
  // Hoy siempre; las demás marcas, salvo la pegada a hoy («14» y «15» juntos se leían «1415»).
  const conMarca = (i: number, dia: string) => dia === hoy || (marcas.has(i + 1) && Math.abs(i + 1 - diaHoy) !== 1);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/80">
        {t("oficina.costos.tablero.diario", { mes: nombreDeMes(hoy, language) })}
      </span>
      <div className="relative">
        {/* Rejilla tenue de fondo, como un monitor. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <span className="border-t border-dashed border-foreground/[0.06]" />
          <span className="border-t border-dashed border-foreground/[0.06]" />
          <span className="border-t border-dashed border-foreground/[0.06]" />
        </div>
        <div className="relative flex h-28 items-end gap-[3px] sm:h-32" role="img" aria-label={t("oficina.costos.tablero.diario", { mes: nombreDeMes(hoy, language) })}>
          {tb.serie.map((d) => {
            const alto = `${Math.max(3, (total(d) / max) * 100)}%`;
            const esHoy = d.dia === hoy;
            return (
              <div key={d.dia} title={`${fechaCorta(d.dia, language)} · ${exacto(total(d))}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                {d.futuro ? (
                  <div className="w-full rounded-t-[4px] border border-dashed border-foreground/15" style={{ height: alto }} />
                ) : (
                  <div className="flex w-full flex-col overflow-hidden rounded-t-[4px]"
                    style={{ height: alto, boxShadow: esHoy ? `0 0 18px 0 ${colorDe(argosId)}, 0 0 0 1px hsl(0 0% 100% / .35)` : undefined }}>
                    {d.argos > 0 && <div style={{ height: `${(d.argos / total(d)) * 100}%`, background: `linear-gradient(180deg, hsl(var(--chart-3)), ${colorDe(argosId)})` }} />}
                    {fijos.map((f) => (
                      <div key={f.id} style={{ height: `${(f.porDia / total(d)) * 100}%`, background: colorDe(f.id), opacity: 0.5 }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex h-3 gap-[3px] font-mono text-[10px] tabular-nums text-muted-foreground" aria-hidden>
        {tb.serie.map((d, i) => (
          <span key={d.dia} className="relative min-w-0 flex-1">
            {conMarca(i, d.dia) && (
              <span className={`absolute left-1/2 -translate-x-1/2 ${d.dia === hoy ? "font-semibold text-foreground" : ""}`}>{i + 1}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function TarjetaServicio({ f, tb }: { f: FilaGasto; tb: Tablero }) {
  const { t, language } = useLanguage();
  const color = colorDe(f.id);
  const pct = f.alMes && f.gastado !== null ? Math.min(100, (f.gastado / f.alMes) * 100) : 0;
  const corto = NOMBRE_CORTO[f.id] ? t(NOMBRE_CORTO[f.id]) : f.nombre;
  const nota = f.porUso && tb.argos?.lectura
    ? t("oficina.costos.tablero.cuadre", { g: exacto(tb.argos.lectura.monto), f: fechaCorta(tb.argos.lectura.fecha, language), m: exacto(tb.argos.despues ?? 0) })
    : "";
  return (
    <div style={{ "--c": color } as CSSProperties} title={nota ? `${f.nombre} · ${nota}` : f.nombre}
      className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[14px] border border-border/60 bg-[linear-gradient(180deg,hsl(var(--foreground)/.04),hsl(var(--foreground)/.01))] p-4 transition-[border-color,box-shadow,transform] duration-300 [box-shadow:inset_0_1px_0_hsl(0_0%_100%/.05)] hover:-translate-y-0.5 hover:border-[color:var(--c)] hover:[box-shadow:inset_0_1px_0_hsl(0_0%_100%/.06),0_18px_40px_-22px_var(--c)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {/* La línea de luz arriba, del color del servicio. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-5 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <span aria-hidden className="pointer-events-none absolute -top-10 left-1/2 h-16 w-24 -translate-x-1/2 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-40 motion-reduce:transition-none"
        style={{ background: color }} />
      <span className="relative flex min-w-0 items-start gap-2">
        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium text-foreground/90">{corto}</span>
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{f.proveedor.replace(/ AI Studio$/, "")}</span>
        </span>
      </span>
      <span className="relative">{f.gastado === null ? <span className="font-display text-2xl text-muted-foreground">—</span> : <Monto valor={f.gastado} tam="md" />}</span>
      <div className="relative h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
      <span className="relative font-mono text-[10.5px] tabular-nums text-muted-foreground">
        {f.alMes === null ? "" : t(f.porUso ? "oficina.costos.tablero.alRitmo" : "oficina.costos.tablero.deAlMes", { m: exacto(f.alMes) })}
      </span>
    </div>
  );
}

function Consola({ tb, hoy }: { tb: Tablero; hoy: string }) {
  const { t, language } = useLanguage();
  const filas = conCosto(tb);
  return (
    <section aria-label={t("oficina.costos.tablero.titulo")}
      className="sube relative overflow-hidden rounded-[22px] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/.72),hsl(var(--background)/.6))] backdrop-blur-xl [box-shadow:inset_0_1px_0_hsl(0_0%_100%/.07),0_40px_90px_-40px_rgb(0_0_0/.85),0_26px_80px_-34px_hsl(var(--chart-1)/.45)]">
      {/* Brillos de ambiente, como la portada: azul arriba a la izquierda, violeta a la derecha. */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[hsl(var(--chart-1)/.16)] blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-20 top-10 h-56 w-56 rounded-full bg-[hsl(var(--chart-5)/.14)] blur-3xl" />
      <div className="relative">
        <BarritaDeConsola hoy={hoy} />
        <div className="grid gap-7 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-end">
          <div className="flex min-w-0 flex-col gap-3">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/80">
              {t("oficina.costos.tablero.gastado", { mes: nombreDeMes(hoy, language), d: tb.dia })}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <Monto valor={tb.gastado} tam="xl" />
              <span className="inline-flex items-center rounded-full border border-border/70 bg-foreground/[0.04] px-2.5 py-1 font-mono text-[11px] tabular-nums text-foreground/85">
                {t("oficina.costos.tablero.hoyMas", { m: exacto(tb.hoy) })}
              </span>
            </div>
            <BarraDelMes tb={tb} />
            <span className="text-[13px] text-muted-foreground">
              {t("oficina.costos.tablero.deMes", { m: exacto(tb.proyeccion) })}
              {tb.falta.length > 0 && ` · ${t("oficina.costos.tablero.sinLoQueFalta", { n: tb.falta.length })}`}
            </span>
            {tb.argos?.lectura && (
              <span className="font-mono text-[10.5px] text-muted-foreground/80">
                {t("oficina.costos.tablero.cuadreArgos", {
                  g: exacto(tb.argos.lectura.monto), f: fechaCorta(tb.argos.lectura.fecha, language), m: exacto(tb.argos.despues ?? 0),
                })}
              </span>
            )}
            {tb.sinUso && <span className="text-xs text-destructive">{t("oficina.costos.tablero.sinUso")}</span>}
          </div>
          <GraficoDiario tb={tb} hoy={hoy} />
        </div>
        <div aria-label={t("oficina.costos.tablero.servicios")} role="group"
          className="grid grid-cols-2 gap-2.5 border-t border-border/60 p-4 sm:p-5 md:grid-cols-3 xl:grid-cols-6">
          {filas.map((f) => <TarjetaServicio key={f.id} f={f} tb={tb} />)}
        </div>
      </div>
    </section>
  );
}

function FaltaYAhorro({ tb }: { tb: Tablero }) {
  const { t } = useLanguage();
  if (tb.falta.length === 0 && tb.ahorro.length === 0) return null;
  return (
    <Panel id="tablero-falta" titulo={t("oficina.costos.tablero.faltaYAhorro")}>
      <ul className="flex flex-col py-1">
        {tb.falta.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2.5 sm:px-5">
            <span className="min-w-0 text-sm text-foreground">{s.nombre}</span>
            <span className="font-mono text-[11px] font-medium text-warning">{t("oficina.costos.tablero.sinMonto")}</span>
          </li>
        ))}
        {tb.ahorro.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:px-5">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 text-sm text-foreground">{a.nombre}</span>
              <span className="font-display text-sm font-semibold tabular-nums text-success">{t("oficina.costos.tablero.ahorro", { m: exacto(a.ahorro) })}</span>
            </span>
            <span className="text-[11px] text-muted-foreground">{a.detalle}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function TableroGasto() {
  const { t } = useLanguage();
  const q = useCostos();
  const uso = useUsoDelMes();
  const hoy = uso.data?.hoy ?? hoyEnColombia();

  let cuerpo: ReactNode;
  if (q.isLoading || uso.isLoading) cuerpo = <div className="vidrio"><Cargando /></div>;
  else if (q.isError || !q.data) {
    cuerpo = <div className="vidrio overflow-hidden"><FalloCompacto onReintentar={() => void q.refetch()} ocupado={q.isFetching} /></div>;
  } else {
    const tb = calcularTableroGasto(q.data.servicios, q.data.lecturas ?? [], uso.data ?? null, hoy);
    cuerpo = (
      <div className="flex flex-col gap-4">
        <Consola tb={tb} hoy={hoy} />
        {uso.isError && (
          <div className="vidrio overflow-hidden">
            <FalloCompacto texto={t("oficina.costos.partes.sinUso")} onReintentar={() => void uso.refetch()} ocupado={uso.isFetching} />
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <SaldoGemini />
          <FaltaYAhorro tb={tb} />
        </div>
      </div>
    );
  }
  return <div>{cuerpo}</div>;
}
