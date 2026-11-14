import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { mensual, num, tablero, type Cobro, type ServicioCosto } from "@/lib/costos";
import { COLOR_PARTE, calcularCostosPorParte, parteDe, type ServicioConParte } from "@/lib/costosPorParte";
import { useCuentas } from "./CuentasAtadas";
import { HojaFicha, Revisado } from "./FichaServicio";
import {
  CLAVE_PARTE, Cargando, FalloCompacto, Panel, Pastilla, Punto, exacto, fechaCorta, hoyEnColombia, nombreDeMes, redondo,
  useCostos, useUsoDelMes,
} from "./comun";

// COSTOS POR PROVEEDOR (Alvaro, 13/11/2026: «la vista por proveedor va en su
// propia pestaña»). Lo que antes era la tabla por servicio, compacto y con la
// parte de Maven de cada uno: lo que gastó Maven este mes y en el año y lo que
// gasta al mes. Arriba, el mes, el año y los próximos 12 meses en fichas
// chicas; abajo, lo que no es Maven aparte y lo que viene en 60 días. Lo que se
// cobra por uso (la IA de Google) dice al mes lo mismo que «Por parte de Maven»:
// el uso real al ritmo de hoy. Toca un servicio y se abre su ficha.

const COLS = "md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(6.5rem,0.7fr))]";

function Cifra({ valor, etiqueta, detalle }: { valor: string; etiqueta: string; detalle: string }) {
  return (
    <div className="vidrio sube flex flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <span className="text-xl font-semibold tabular-nums text-foreground">{valor}</span>
      <span className="text-[11px] text-muted-foreground/90">{detalle}</span>
    </div>
  );
}

export default function VistaPorProveedor() {
  const { t, language } = useLanguage();
  const q = useCostos();
  const uso = useUsoDelMes();
  const cuentas = useCuentas();
  const [abierto, setAbierto] = useState<string | null>(null);

  if (q.isLoading) return <Cargando alto="py-16" />;
  if (q.isError || !q.data) {
    return <div className="vidrio overflow-hidden"><FalloCompacto onReintentar={() => void q.refetch()} ocupado={q.isFetching} /></div>;
  }
  const { servicios, cobros } = q.data;
  const hoy = hoyEnColombia();
  const ano = hoy.slice(0, 4);
  const nombreMes = nombreDeMes(hoy, language);
  const tb = tablero(servicios, cobros, hoy);
  const porParte = calcularCostosPorParte(servicios, cobros, uso.data ?? null, hoy);
  const filas = tb.porServicio.filter((f) => parteDe(f.servicio as ServicioConParte) !== "otras").map((f) => {
    const s = f.servicio as ServicioConParte;
    const deUso = porParte.porServicio.get(s.id);
    // Lo que se cobra por foto: al mes = el uso real al ritmo de hoy (si se pudo leer).
    const porUso = num(s.precio_unitario_usd) !== null && deUso?.cierre != null;
    return { ...f, alMes: porUso ? (deUso?.cierre as number) : f.alMes, porUso };
  }).sort((a, b) => b.alMes - a.alMes);
  const fuera = servicios.filter((s) => s.activo && parteDe(s) === "otras");
  const tot = filas.reduce((a, f) => ({ mes: a.mes + f.mes.gastado, ano: a.ano + f.ano, alMes: a.alMes + f.alMes }), { mes: 0, ano: 0, alMes: 0 });
  const cab = [t("oficina.costos.colPagadoMes", { mes: nombreMes }), t("oficina.costos.colPagadoAno", { a: ano }), t("oficina.costos.colPrecio")];
  const proximos = proximosCobros(filas.map((f) => f.servicio), cobros, hoy);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra valor={redondo(tb.gastadoMes)} etiqueta={t("oficina.costos.cifraMes", { mes: nombreMes, d: Number(hoy.slice(8, 10)) })}
          detalle={t("oficina.costos.proveedor.enFacturas")} />
        <Cifra valor={redondo(tb.gastadoAno)} etiqueta={t("oficina.costos.cifraAno", { a: ano })} detalle={t("oficina.costos.cierraEn", { m: redondo(tb.cierreAno) })} />
        <Cifra valor={redondo(tb.proximos12)} etiqueta={t("oficina.costos.kpi12")} detalle={t("oficina.costos.promedio", { m: redondo(tb.promedioProximo) })} />
      </div>

      <Panel id="por-proveedor" titulo={t("oficina.costos.porServicio")} sub={t("oficina.costos.tocaServicio")}>
        <div className={`hidden gap-4 px-5 py-2.5 text-xs text-muted-foreground md:grid ${COLS}`}>
          <span>{t("oficina.costos.colServicio")}</span>
          {cab.map((c) => <span key={c} className="text-right">{c}</span>)}
        </div>
        <ul className="flex flex-col">
          {filas.map(({ servicio: s, mes, ano: anoS, alMes, porUso }) => {
            const falta = s.monto_usd === null;
            const parte = parteDe(s as ServicioConParte);
            const valores = [falta ? null : mes.gastado, falta ? null : anoS, falta ? null : alMes];
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setAbierto(s.id)}
                  className={`grid w-full grid-cols-1 gap-x-4 gap-y-1.5 border-t border-border/40 px-4 py-3 text-left transition hover:bg-muted/30 sm:px-5 md:items-center ${COLS}`}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">{s.nombre}</span>
                      <Pastilla color={COLOR_PARTE[parte]}>{t(CLAVE_PARTE[parte].nombre)}</Pastilla>
                    </span>
                    <span className="text-xs text-muted-foreground">{s.proveedor}{s.como_se_calcula ? ` · ${s.como_se_calcula}` : ""}</span>
                    <Revisado servicio={s} />
                  </span>
                  <span className="flex flex-wrap gap-x-6 gap-y-1 md:contents">
                    {valores.map((v, i) => (
                      <span key={cab[i]} className="flex flex-col md:items-end">
                        <span className="text-[11px] text-muted-foreground md:hidden">{cab[i]}</span>
                        {v === null
                          ? <span className="text-sm font-medium text-warning">{t("oficina.costos.partes.faltaDato")}</span>
                          : <span className={`text-sm tabular-nums ${i === 2 ? "font-medium text-foreground" : v === 0 ? "text-muted-foreground" : "text-foreground/85"}`}>{exacto(v)}</span>}
                        {i === 2 && porUso && <span className="text-[10px] text-muted-foreground">{t("oficina.costos.proveedor.alRitmo")}</span>}
                        {i === 2 && s.ciclo === "anual" && !falta && <span className="text-[10px] text-muted-foreground">{t("oficina.costos.alAno", { m: exacto(Number(s.monto_usd)) })}</span>}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
          <li className={`grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-border/60 px-4 py-3 sm:px-5 md:items-center ${COLS}`}>
            <span className="text-sm font-semibold text-foreground">{t("oficina.costos.totalMaven")}</span>
            <span className="flex flex-wrap gap-x-6 gap-y-1 md:contents">
              {[tot.mes, tot.ano, tot.alMes].map((v, i) => (
                <span key={cab[i]} className="flex flex-col md:items-end">
                  <span className="text-[11px] text-muted-foreground md:hidden">{cab[i]}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{exacto(v)}</span>
                </span>
              ))}
            </span>
          </li>
        </ul>
        {fuera.length > 0 && (
          <div className="border-t border-border/60">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1 pt-3 sm:px-5">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Punto color={COLOR_PARTE.otras} />{t(CLAVE_PARTE.otras.nombre)}</span>
              <span className="text-[11px] text-muted-foreground">{t("oficina.costos.proveedor.noSuma")}</span>
            </div>
            <ul className="flex flex-col pb-1">
              {fuera.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setAbierto(s.id)} className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-muted/30 sm:px-5">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">{s.nombre}</span>
                      <span className="text-xs text-muted-foreground">{s.detalle ?? s.proveedor}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm tabular-nums text-foreground/85">{t("oficina.costos.ahorroTotal", { m: exacto(mensual(s) ?? 0) })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel id="lo-que-viene" titulo={t("oficina.costos.viene")} sub={t("oficina.costos.vieneNota60")}>
        {proximos.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">{t("oficina.costos.nadaViene")}</p> : (
          <ul className="flex flex-col py-1">
            {proximos.map((v) => (
              <li key={`${v.servicio.id}-${v.fecha}`}>
                <button type="button" onClick={() => setAbierto(v.servicio.id)}
                  className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-muted/30 sm:px-5">
                  <span className="text-xs tabular-nums text-muted-foreground">{fechaCorta(v.fecha, language)}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-foreground/90">{v.servicio.nombre}</span>
                    {v.sube && <Pastilla color="hsl(var(--warning))">{v.sube}</Pastilla>}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">{exacto(v.monto)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-[11px] text-muted-foreground">{t("oficina.costos.pie")}</p>
      <HojaFicha id={abierto} servicios={servicios} cobros={cobros} cuentas={cuentas} onCerrar={() => setAbierto(null)} />
    </div>
  );
}

/** ¿La fecha (YYYY-MM-DD) es después de hoy? */
const esFutura = (fecha: string, hoy: string) => fecha.localeCompare(hoy) > 0;

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
