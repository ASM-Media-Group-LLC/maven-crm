import type { ReactNode } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { calcularTableroGasto, type DiaGasto, type FilaGasto, type TableroGasto as Tablero } from "@/lib/tableroGasto";
import SaldoGemini from "./SaldoGemini";
import { Cargando, FalloCompacto, Panel, exacto, fechaCorta, hoyEnColombia, nombreDeMes, useCostos, useUsoDelMes } from "./comun";

// EL TABLERO DE GASTO (Alvaro, 14/11/2026; estructura elegida por Q&A el mismo día):
//   · UN bloque grande arriba: lo gastado del mes enorme, «hoy +X», la barra de
//     cuánto va del mes (pintada por servicio) y el gráfico de cada día adentro;
//   · debajo, una tarjeta por servicio con su color, su gastado y su mes;
//   · al final, el saldo de Gemini y lo que falta / dónde ahorrar.
// «Sabor»: cada servicio con su color suave propio (el mismo en su tarjeta, en la
// barra del mes y en el gráfico); las cifras grandes en blanco. Los colores son los
// --chart-* de index.css: no dependen del skin (con un primario gris, Argos se
// confundía con lo fijo). Las cuentas viven en lib/tableroGasto.ts (con pruebas).

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

/** Los servicios que cuestan (los de USD 0 no pintan nada). */
const conCosto = (tb: Tablero) => tb.filas.filter((f) => (f.alMes ?? 0) > 0 || (f.gastado ?? 0) > 0);

function BarraDelMes({ tb }: { tb: Tablero }) {
  const filas = conCosto(tb);
  const llenado = tb.proyeccion > 0 ? Math.min(100, (tb.gastado / tb.proyeccion) * 100) : 0;
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-foreground/[0.07]">
      <div className="flex h-full gap-px" style={{ width: `${llenado}%` }}>
        {filas.map((f) => (
          <div key={f.id} className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${tb.gastado > 0 ? ((f.gastado ?? 0) / tb.gastado) * 100 : 0}%`, background: colorDe(f.id) }} />
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
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{t("oficina.costos.tablero.diario", { mes: nombreDeMes(hoy, language) })}</span>
      <div className="flex h-24 items-end gap-[2px] sm:h-28" role="img" aria-label={t("oficina.costos.tablero.diario", { mes: nombreDeMes(hoy, language) })}>
        {tb.serie.map((d) => (
          <div key={d.dia} title={`${fechaCorta(d.dia, language)} · ${exacto(total(d))}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            {d.futuro ? (
              <div className="w-full rounded-t-[3px] border border-dashed border-muted-foreground/30" style={{ height: `${Math.max(2, (total(d) / max) * 100)}%` }} />
            ) : (
              <div className={`flex w-full flex-col overflow-hidden rounded-t-[3px] ${d.dia === hoy ? "ring-1 ring-foreground/50" : ""}`}
                style={{ height: `${Math.max(2, (total(d) / max) * 100)}%` }}>
                {d.argos > 0 && <div style={{ height: `${(d.argos / total(d)) * 100}%`, background: colorDe(argosId) }} />}
                {fijos.map((f) => (
                  <div key={f.id} style={{ height: `${(f.porDia / total(d)) * 100}%`, background: colorDe(f.id), opacity: 0.55 }} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex h-3 gap-[2px] text-[10px] tabular-nums text-muted-foreground" aria-hidden>
        {tb.serie.map((d, i) => (
          <span key={d.dia} className="relative min-w-0 flex-1">
            {conMarca(i, d.dia) && (
              <span className={`absolute left-1/2 -translate-x-1/2 ${d.dia === hoy ? "font-medium text-foreground" : ""}`}>{i + 1}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function BloqueGastado({ tb, hoy }: { tb: Tablero; hoy: string }) {
  const { t, language } = useLanguage();
  return (
    <section className="vidrio sube overflow-hidden" aria-label={t("oficina.costos.tablero.titulo")}>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-end">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-[11.5px] uppercase tracking-wide text-muted-foreground">
            {t("oficina.costos.tablero.gastado", { mes: nombreDeMes(hoy, language), d: tb.dia })}
          </span>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-5xl font-semibold tabular-nums tracking-tight text-foreground sm:text-6xl">{exacto(tb.gastado)}</span>
            <span className="text-sm font-medium tabular-nums text-foreground/80">{t("oficina.costos.tablero.hoyMas", { m: exacto(tb.hoy) })}</span>
          </div>
          <BarraDelMes tb={tb} />
          <span className="text-[13px] text-muted-foreground">
            {t("oficina.costos.tablero.deMes", { m: exacto(tb.proyeccion) })}
            {tb.falta.length > 0 && ` · ${t("oficina.costos.tablero.sinLoQueFalta", { n: tb.falta.length })}`}
          </span>
          {tb.sinUso && <span className="text-xs text-destructive">{t("oficina.costos.tablero.sinUso")}</span>}
        </div>
        <GraficoDiario tb={tb} hoy={hoy} />
      </div>
    </section>
  );
}

function TarjetaServicio({ f, tb }: { f: FilaGasto; tb: Tablero }) {
  const { t, language } = useLanguage();
  const color = colorDe(f.id);
  const pct = f.alMes && f.gastado !== null ? Math.min(100, (f.gastado / f.alMes) * 100) : 0;
  return (
    <div className="vidrio sube flex min-w-0 flex-col gap-2 p-4">
      <span className="flex min-w-0 items-start gap-2">
        <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-tight text-foreground/90" title={f.nombre}>{f.nombre}</span>
      </span>
      <span className="font-display text-2xl font-semibold tabular-nums text-foreground">{f.gastado === null ? "—" : exacto(f.gastado)}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {f.alMes === null ? "" : t(f.porUso ? "oficina.costos.tablero.alRitmo" : "oficina.costos.tablero.deAlMes", { m: exacto(f.alMes) })}
      </span>
      {f.porUso && tb.argos?.lectura && (
        <span className="text-[11px] leading-snug text-muted-foreground">
          {t("oficina.costos.tablero.cuadre", {
            g: exacto(tb.argos.lectura.monto), f: fechaCorta(tb.argos.lectura.fecha, language), m: exacto(tb.argos.despues ?? 0),
          })}
        </span>
      )}
    </div>
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
            <span className="text-xs font-medium text-warning">{t("oficina.costos.tablero.sinMonto")}</span>
          </li>
        ))}
        {tb.ahorro.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:px-5">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 text-sm text-foreground">{a.nombre}</span>
              <span className="text-sm font-semibold tabular-nums text-success">{t("oficina.costos.tablero.ahorro", { m: exacto(a.ahorro) })}</span>
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
    const filas = conCosto(tb);
    cuerpo = (
      <div className="flex flex-col gap-4">
        <BloqueGastado tb={tb} hoy={hoy} />
        {uso.isError && (
          <div className="vidrio overflow-hidden">
            <FalloCompacto texto={t("oficina.costos.partes.sinUso")} onReintentar={() => void uso.refetch()} ocupado={uso.isFetching} />
          </div>
        )}
        <section aria-label={t("oficina.costos.tablero.servicios")} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {filas.map((f) => <TarjetaServicio key={f.id} f={f} tb={tb} />)}
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <SaldoGemini />
          <FaltaYAhorro tb={tb} />
        </div>
      </div>
    );
  }
  return <div>{cuerpo}</div>;
}
