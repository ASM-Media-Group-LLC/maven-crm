import type { ReactNode } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { calcularTableroGasto, type DiaGasto, type TableroGasto as Tablero } from "@/lib/tableroGasto";
import SaldoGemini from "./SaldoGemini";
import { Cargando, FalloCompacto, Panel, exacto, fechaCorta, hoyEnColombia, nombreDeMes, useCostos, useUsoDelMes } from "./comun";

// EL TABLERO DE GASTO (Alvaro, 14/11/2026). Arriba de todo en Costos: lo gastado
// en lo que va del mes (el número grande), hoy y la proyección; el gasto de cada
// día; cada servicio con su gastado y su mes; el saldo de Gemini; lo que falta y
// dónde ahorrar. Las cuentas viven en lib/tableroGasto.ts (con pruebas). Si algo
// no carga, una fila con Reintentar: nunca ceros.

const COLOR_ARGOS = "hsl(var(--primary))";
const COLOR_FIJO = "hsl(var(--muted-foreground) / 0.4)";

function Cifra({ etiqueta, valor, grande, sub }: { etiqueta: string; valor: string; grande?: boolean; sub?: string }) {
  return (
    <div className="vidrio sube flex min-w-0 flex-col gap-1 p-4 sm:p-5">
      <span className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      <span className={`font-semibold tabular-nums ${grande ? "text-3xl text-foreground sm:text-4xl" : "text-2xl text-foreground/80"}`}>{valor}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function GastoDiario({ serie, hoy }: { serie: DiaGasto[]; hoy: string }) {
  const { t, language } = useLanguage();
  const max = Math.max(0.01, ...serie.map((d) => d.fijo + d.argos));
  const marcas = new Set([1, 8, 15, 22, serie.length]);
  return (
    <Panel id="tablero-diario" titulo={t("oficina.costos.tablero.diario", { mes: nombreDeMes(hoy, language) })}
      derecha={(
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_ARGOS }} />{t("oficina.costos.tablero.leyendaArgos")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_FIJO }} />{t("oficina.costos.tablero.leyendaFijo")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] border border-dashed border-muted-foreground/60" />{t("oficina.costos.tablero.leyendaFalta")}</span>
        </span>
      )}>
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="flex h-24 items-end gap-[2px] sm:h-28 sm:gap-1" role="img" aria-label={t("oficina.costos.tablero.diario", { mes: nombreDeMes(hoy, language) })}>
          {serie.map((d) => {
            const total = d.fijo + d.argos;
            return (
              <div key={d.dia} title={`${fechaCorta(d.dia, language)} · ${exacto(total)}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div className={`flex w-full flex-col overflow-hidden rounded-t-[3px] ${d.futuro ? "border border-dashed border-muted-foreground/40" : ""} ${d.dia === hoy ? "ring-1 ring-foreground/40" : ""}`}
                  style={{ height: `${Math.max(2, (total / max) * 100)}%` }}>
                  {!d.futuro && total > 0 && <div style={{ height: `${(d.argos / total) * 100}%`, background: COLOR_ARGOS }} />}
                  {!d.futuro && <div className="flex-1" style={{ background: COLOR_FIJO }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex h-3 gap-[2px] text-[10px] tabular-nums text-muted-foreground sm:gap-1" aria-hidden>
          {serie.map((d, i) => (
            <span key={d.dia} className="relative min-w-0 flex-1">
              {/* Una marca pegada a la de hoy se omite: «14» y «15» juntos se leían «1415». */}
              {((marcas.has(i + 1) && Math.abs(i + 1 - Number(hoy.slice(8, 10))) > 1) || d.dia === hoy) && (
                <span className={`absolute left-1/2 -translate-x-1/2 ${d.dia === hoy ? "font-medium text-foreground" : ""}`}>{i + 1}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function PorServicio({ tb }: { tb: Tablero }) {
  const { t, language } = useLanguage();
  const max = Math.max(0.01, ...tb.filas.map((f) => f.gastado ?? 0));
  return (
    <Panel id="tablero-servicios" titulo={t("oficina.costos.tablero.servicios")}
      derecha={<span className="text-xs text-muted-foreground">{t("oficina.costos.tablero.columnas", { d: tb.dia })}</span>}>
      <ul className="flex flex-col py-1">
        {tb.filas.map((f) => (
          <li key={f.id} className="flex flex-col gap-1.5 px-4 py-2.5 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-foreground">{f.nombre}</span>
                <span className="text-xs text-muted-foreground">{f.proveedor}</span>
              </span>
              <span className="flex items-baseline gap-3">
                <span className="text-sm font-semibold tabular-nums text-foreground">{f.gastado === null ? "—" : exacto(f.gastado)}</span>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {f.alMes === null ? "" : t(f.porUso ? "oficina.costos.tablero.alRitmo" : "oficina.costos.tablero.alMes", { m: exacto(f.alMes) })}
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div className="h-full rounded-full" style={{ width: `${((f.gastado ?? 0) / max) * 100}%`, background: f.porUso ? COLOR_ARGOS : COLOR_FIJO }} />
            </div>
            {f.porUso && tb.argos?.lectura && (
              <span className="text-[11px] text-muted-foreground">
                {t("oficina.costos.tablero.cuadre", {
                  g: exacto(tb.argos.lectura.monto), f: fechaCorta(tb.argos.lectura.fecha, language), m: exacto(tb.argos.despues ?? 0),
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
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
              <span className="text-xs font-semibold tabular-nums text-success">{t("oficina.costos.tablero.ahorro", { m: exacto(a.ahorro) })}</span>
            </span>
            <span className="text-[11px] text-muted-foreground">{a.detalle}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function TableroGasto() {
  const { t, language } = useLanguage();
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
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <Cifra grande etiqueta={t("oficina.costos.tablero.gastado", { mes: nombreDeMes(hoy, language), d: tb.dia })} valor={exacto(tb.gastado)}
            sub={tb.sinUso ? t("oficina.costos.tablero.sinUso") : t("oficina.costos.tablero.gastadoSub")} />
          <Cifra etiqueta={t("oficina.costos.tablero.hoy")} valor={exacto(tb.hoy)} />
          <Cifra etiqueta={t("oficina.costos.tablero.proyeccion")} valor={exacto(tb.proyeccion)}
            sub={tb.falta.length > 0 ? t("oficina.costos.tablero.sinLoQueFalta", { n: tb.falta.length }) : undefined} />
        </div>
        {uso.isError && (
          <div className="vidrio overflow-hidden">
            <FalloCompacto texto={t("oficina.costos.partes.sinUso")} onReintentar={() => void uso.refetch()} ocupado={uso.isFetching} />
          </div>
        )}
        <GastoDiario serie={tb.serie} hoy={hoy} />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <PorServicio tb={tb} />
          <div className="flex min-w-0 flex-col gap-4">
            <SaldoGemini />
            <FaltaYAhorro tb={tb} />
          </div>
        </div>
      </div>
    );
  }
  return <section aria-label={t("oficina.costos.tablero.titulo")}>{cuerpo}</section>;
}
