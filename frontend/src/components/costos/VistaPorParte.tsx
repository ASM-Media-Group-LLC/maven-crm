import { useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { num } from "@/lib/costos";
import {
  COLOR_PARTE, ahorrosDe, calcularCostosPorParte, pesoDePartes,
  type CostosPorParte, type DiaCosto, type Pieza, type ResumenParte, type UsoDelMes,
} from "@/lib/costosPorParte";
import { BloqueBajarCostos, useCuentas } from "./CuentasAtadas";
import { HojaFicha } from "./FichaServicio";
import {
  CLAVE_PARTE, Cargando, FalloCompacto, Panel, Pastilla, Punto, exacto, fechaCorta, hoyEnColombia, miles, nombreDeMes, redondo,
  useCostos, useUsoDelMes,
} from "./comun";

// COSTOS POR PARTE DE MAVEN (Alvaro, 13/11/2026; diseño del mockup
// propuesta-argos/Costos.dc.html). Arriba, cómo cierra el mes al ritmo de hoy,
// lo que va y el mes pasado, con una barra apilada por parte y el gasto de cada
// día. Después Argos pieza por pieza con la cuenta (uso × precio, hoy / en el
// mes / al cierre) y una tarjeta por cada otra parte. Lo compartido (Supabase de
// Maven, servidor principal, dominio) va junto en «Base de Maven». Al final,
// «Dónde puedes recortar». Toca un servicio y se abre su ficha.
// Reglas con tests en lib/costosPorParte.ts. Un fallo se dice, con Reintentar.

type T = (k: TranslationKey, p?: Record<string, string | number>) => string;

/** «USD 139» para lo grande; «USD 0,54» para lo chico. */
const corto = (n: number) => (Math.abs(n) >= 10 ? redondo(n) : exacto(n));
const precioUnitario = (n: number, idioma: string) =>
  `USD ${n.toLocaleString(idioma === "en" ? "en-US" : "es-CO", { maximumFractionDigits: 4 })}`;
const gb = (n: number, idioma: string) => n.toLocaleString(idioma === "en" ? "en-US" : "es-CO", { maximumFractionDigits: 1 });

const NOMBRE_PIEZA: Record<Exclude<Pieza["clave"], "servicio">, { nombre: TranslationKey; prov: TranslationKey }> = {
  ia: { nombre: "oficina.costos.pieza.ia", prov: "oficina.costos.pieza.iaProv" },
  fotos: { nombre: "oficina.costos.pieza.fotos", prov: "oficina.costos.pieza.supabaseNas" },
  videos: { nombre: "oficina.costos.pieza.videos", prov: "oficina.costos.pieza.supabase" },
  push: { nombre: "oficina.costos.pieza.push", prov: "oficina.costos.pieza.pushProv" },
  velocidad: { nombre: "oficina.costos.pieza.velocidad", prov: "oficina.costos.pieza.supabase" },
  ruido: { nombre: "oficina.costos.pieza.ruido", prov: "oficina.costos.pieza.ruidoProv" },
  mensajes: { nombre: "oficina.costos.pieza.mensajes", prov: "oficina.costos.pieza.supabase" },
  drive: { nombre: "oficina.costos.pieza.drive", prov: "oficina.costos.pieza.supabaseNas" },
};

function nombreDe(p: Pieza, t: T): { nombre: string; prov: string } {
  if (p.clave === "servicio") return { nombre: p.servicio?.nombre ?? "", prov: p.servicio?.proveedor ?? "" };
  const k = NOMBRE_PIEZA[p.clave];
  return { nombre: t(k.nombre), prov: p.clave === "ia" && p.servicio ? p.servicio.proveedor : t(k.prov) };
}

/** La cuenta de cada pieza, en palabras y con sus números. */
function cuentaDe(p: Pieza, t: T, idioma: string): string {
  const d = p.datos;
  const plan = () => (d.excesoGb ?? 0) > 0
    ? t("oficina.costos.pieza.planFuera", { t: gb(d.totalGb, idioma), x: gb(d.excesoGb, idioma), p: precioUnitario(d.precioGb, idioma) })
    : t("oficina.costos.pieza.planDentro", { t: gb(d.totalGb, idioma), i: d.incluidoGb });
  if (p.sinUso && p.clave !== "servicio") return t("oficina.costos.pieza.sinUso");
  switch (p.clave) {
    case "ia":
      return t("oficina.costos.pieza.iaCuenta", { n: miles(d.juzgadasHoy, idioma), p: precioUnitario(d.precio, idioma), m: miles(d.juzgadasMes, idioma) });
    case "fotos":
      return [
        t("oficina.costos.pieza.fotosCuenta", { n: miles(d.fotosHoy, idioma), gb: gb(d.gb, idioma) }),
        plan(),
        d.alNasMes > 0 ? t("oficina.costos.pieza.alNas", { n: miles(d.alNasMes, idioma) }) : "",
      ].filter(Boolean).join(" · ");
    case "videos":
      return [
        t("oficina.costos.pieza.videosCuenta", { n: d.videosHoy, m: d.videosMes, min: miles(d.minutosMes, idioma), gb: gb(d.gb, idioma) }),
        (d.excesoGb ?? 0) > 0 ? plan() : t("oficina.costos.pieza.planDentroCorto"),
      ].join(" · ");
    case "push": return t("oficina.costos.pieza.gratis");
    case "velocidad": return t("oficina.costos.pieza.velocidadCuenta");
    case "ruido": return t("oficina.costos.pieza.ruidoCuenta");
    case "mensajes": return t("oficina.costos.pieza.mensajesCuenta", { gb: gb(d.gb, idioma) });
    case "drive": return t("oficina.costos.pieza.driveCuenta", { gb: gb(d.gb, idioma) });
    default: {
      const s = p.servicio;
      if (!s) return "";
      if (p.cierre === null) return s.revisado ?? s.detalle ?? "";
      return s.como_se_calcula ?? s.detalle ?? "";
    }
  }
}

/** Un número de la pieza: «—» si falta el uso, «Falta dato» si no hay precio, gris si es gratis. */
function Valor({ p, v, fuerte }: { p: Pieza; v: number | null; fuerte?: boolean }) {
  const { t } = useLanguage();
  if (p.sinUso) return <span className="text-sm tabular-nums text-muted-foreground">—</span>;
  if (v === null) return <span className="whitespace-nowrap text-sm font-medium text-warning">{t("oficina.costos.partes.faltaDato")}</span>;
  return (
    <span className={`whitespace-nowrap text-sm tabular-nums ${p.gratis || v === 0 ? "text-muted-foreground" : fuerte ? "font-medium text-foreground" : "text-foreground/85"}`}>
      {exacto(v)}
    </span>
  );
}

function Facturado({ m }: { m: number }) {
  const { t } = useLanguage();
  return (
    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/90">
      <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />{t("oficina.costos.pieza.facturado", { m: exacto(m) })}
    </span>
  );
}

function NombrePieza({ p, onAbrir }: { p: Pieza; onAbrir: (id: string) => void }) {
  const { t } = useLanguage();
  const { nombre, prov } = nombreDe(p, t);
  const s = p.servicio;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {s ? (
        <button type="button" onClick={() => onAbrir(s.id)} className="text-left text-sm font-medium text-foreground underline-offset-4 hover:underline">
          {nombre}
        </button>
      ) : <span className="text-sm font-medium text-foreground">{nombre}</span>}
      <span className="text-xs text-muted-foreground">{prov}</span>
    </div>
  );
}

const COLS_ARGOS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_repeat(3,minmax(5.5rem,0.55fr))]";

/** Argos, la parte que más se mueve: la tabla completa Pieza | La cuenta | Hoy | En el mes | Al cierre. */
function SeccionArgos({ parte, uso, onAbrir }: { parte: ResumenParte; uso: UseQueryResult<UsoDelMes>; onAbrir: (id: string) => void }) {
  const { t, language } = useLanguage();
  const ahorros = ahorrosDe(parte);
  const cols = [t("oficina.costos.col.hoy"), t("oficina.costos.col.mes"), t("oficina.costos.col.cierre")];
  return (
    <Panel id="parte-argos"
      titulo={<span className="flex items-center gap-2"><Punto color={COLOR_PARTE.argos} />{t(CLAVE_PARTE.argos.titulo)}</span>}
      sub={t(CLAVE_PARTE.argos.que)}
      derecha={<TotalDeParte parte={parte} />}>
      {/* Si el uso no se pudo leer, el fallo (con Reintentar) ya está arriba; aquí las piezas de uso dicen «—». */}
      {uso.isLoading ? <Cargando /> : (
        <>
          <div className={`hidden gap-4 px-5 py-2.5 text-xs text-muted-foreground md:grid ${COLS_ARGOS}`}>
            <span>{t("oficina.costos.col.pieza")}</span>
            <span>{t("oficina.costos.col.cuenta")}</span>
            {cols.map((c) => <span key={c} className="text-right">{c}</span>)}
          </div>
          <ul className="flex flex-col">
            {parte.piezas.map((p, i) => (
              <li key={`${p.clave}-${p.servicio?.id ?? i}`}
                className={`grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-border/40 px-4 py-3 sm:px-5 md:items-center ${COLS_ARGOS}`}>
                <NombrePieza p={p} onAbrir={onAbrir} />
                <div className="min-w-0 text-[13px] text-muted-foreground">
                  {cuentaDe(p, t, language)}
                  {p.facturado !== null && <Facturado m={p.facturado} />}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 md:contents">
                  {([p.hoy, p.mes, p.cierre] as const).map((v, k) => (
                    <span key={cols[k]} className="flex flex-col md:items-end">
                      <span className="text-[11px] text-muted-foreground md:hidden">{cols[k]}</span>
                      <Valor p={p} v={v} fuerte={k === 2} />
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {ahorros.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/50 bg-foreground/[0.03] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:px-5">
          <span className="text-xs font-semibold text-primary">{t("oficina.costos.partes.paraAhorrar")}</span>
          {ahorros.map((s) => (
            <button key={s.id} type="button" onClick={() => onAbrir(s.id)} className="text-left text-[13px] text-foreground/85 hover:text-foreground">
              {s.ahorro_detalle} <span className="whitespace-nowrap text-muted-foreground">({t("oficina.costos.bajar.menos", { m: exacto(num(s.ahorro_usd) ?? 0) })})</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TotalDeParte({ parte }: { parte: ResumenParte }) {
  const { t } = useLanguage();
  return (
    <span className="flex flex-col whitespace-nowrap sm:items-end">
      <span>
        {/* Sin el uso, el total sería a medias: no se muestra un número que engañe. */}
        <span className="text-lg font-semibold tabular-nums text-foreground">{parte.sinUso > 0 ? "—" : corto(parte.cierre)}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{t("oficina.costos.alMesLargo")}</span>
      </span>
      {parte.faltan > 0 && <span className="text-[11px] text-warning">{t("oficina.costos.partes.masFalta", { n: parte.faltan })}</span>}
      {parte.sinUso > 0 && <span className="text-[11px] text-muted-foreground">{t("oficina.costos.partes.sinUsoCorto")}</span>}
    </span>
  );
}

/** Una parte (Base de Maven, Cowork y llamadas, Correo…): sus piezas con la cuenta y lo que cierra cada una. */
function TarjetaParte({ parte, onAbrir }: { parte: ResumenParte; onAbrir: (id: string) => void }) {
  const { t, language } = useLanguage();
  const k = CLAVE_PARTE[parte.parte];
  return (
    <Panel id={`parte-${parte.parte}`}
      titulo={<span className="flex items-center gap-2"><Punto color={COLOR_PARTE[parte.parte]} />{t(k.titulo)}</span>}
      sub={t(k.que)}
      derecha={<TotalDeParte parte={parte} />}>
      <ul className="flex flex-col py-1">
        {parte.piezas.map((p, i) => (
          <li key={`${p.clave}-${p.servicio?.id ?? i}`} className="flex items-start justify-between gap-3 px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <NombrePieza p={p} onAbrir={onAbrir} />
              <span className="text-xs text-muted-foreground/90">{cuentaDe(p, t, language)}</span>
              {p.facturado !== null && <Facturado m={p.facturado} />}
            </div>
            <Valor p={p} v={p.cierre} fuerte />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** El gasto de cada día del mes: lo fijo (gris) + lo que se cobra por uso (color de Argos); lo que falta, en contorno. */
function DiaPorDia({ serie, hoy }: { serie: DiaCosto[]; hoy: string }) {
  const { t, language } = useLanguage();
  const max = Math.max(0.01, ...serie.map((d) => d.fijo + d.uso));
  const marcas = new Set([1, 8, 15, 22, serie.length]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-xs font-medium text-foreground/85">{t("oficina.costos.partes.diaPorDia", { mes: nombreDeMes(hoy, language) })}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-muted-foreground/40" />{t("oficina.costos.partes.leyendaFijo")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_PARTE.argos }} />{t("oficina.costos.partes.leyendaUso")}</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] border border-dashed border-muted-foreground/60" />{t("oficina.costos.partes.leyendaFalta")}</span>
        </span>
      </div>
      <div className="flex h-16 items-end gap-[2px] sm:h-20 sm:gap-1" role="img" aria-label={t("oficina.costos.partes.diaPorDia", { mes: nombreDeMes(hoy, language) })}>
        {serie.map((d) => {
          const total = d.fijo + d.uso;
          return (
            <div key={d.dia} title={`${fechaCorta(d.dia, language)} · ${exacto(total)}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className={`flex w-full flex-col overflow-hidden rounded-t-[3px] ${d.futuro ? "border border-dashed border-muted-foreground/40" : ""} ${d.dia === hoy ? "ring-1 ring-foreground/40" : ""}`}
                style={{ height: `${Math.max(2, (total / max) * 100)}%` }}>
                {!d.futuro && total > 0 && <div style={{ height: `${(d.uso / total) * 100}%`, background: COLOR_PARTE.argos }} />}
                {!d.futuro && <div className="flex-1 bg-muted-foreground/40" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex h-3 gap-[2px] text-[10px] tabular-nums text-muted-foreground sm:gap-1" aria-hidden>
        {serie.map((d, i) => (
          <span key={d.dia} className="relative min-w-0 flex-1">
            {(marcas.has(i + 1) || d.dia === hoy) && (
              <span className={`absolute left-1/2 -translate-x-1/2 ${d.dia === hoy ? "font-medium text-foreground" : ""}`}>{i + 1}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Lo de arriba: cómo cierra el mes, lo que va, el mes pasado, la barra por parte y el día a día. */
function Resumen({ r, uso }: { r: CostosPorParte; uso: UseQueryResult<UsoDelMes> }) {
  const { t, language } = useLanguage();
  const hoy = r.serie[r.dia - 1]?.dia ?? hoyEnColombia();
  const pesos = pesoDePartes(r.partes);
  const sinDato = r.partes.flatMap((p) => p.piezas).filter((p) => !p.sinUso && p.cierre === null).map((p) => p.servicio?.nombre ?? "");
  let cuerpo: ReactNode;
  if (uso.isLoading) cuerpo = <Cargando />;
  else if (uso.isError || !uso.data) cuerpo = <FalloCompacto texto={t("oficina.costos.partes.sinUso")} onReintentar={() => void uso.refetch()} ocupado={uso.isFetching} />;
  else cuerpo = (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">{t("oficina.costos.partes.alRitmo")}</span>
          <span className="text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">{redondo(r.total.cierre)}</span>
          <span className="text-[13px] text-muted-foreground">
            {t("oficina.costos.partes.llevas", { m: redondo(r.total.mes), d: r.dia })}
            {" · "}
            {r.mesPasado !== null ? t("oficina.costos.partes.mesPasado", { m: redondo(r.mesPasado) }) : t("oficina.costos.partes.sinMesPasado")}
          </span>
        </div>
        <div className="flex min-w-0 flex-[2_1_380px] flex-col justify-center gap-2.5">
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-foreground/[0.05]">
            {pesos.map((p) => <div key={p.parte} style={{ width: `${p.pct}%`, background: COLOR_PARTE[p.parte] }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {pesos.map((p) => (
              <span key={p.parte} className="inline-flex items-center gap-1.5">
                <Punto color={COLOR_PARTE[p.parte]} />{t(CLAVE_PARTE[p.parte].nombre)} <span className="tabular-nums">{p.pct < 1 ? "<1" : Math.round(p.pct)} %</span>
              </span>
            ))}
            {sinDato.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <span aria-hidden className="h-2 w-2 rounded-full border border-dashed border-warning" />
                {t("oficina.costos.partes.sinDatoLista", { lista: sinDato.join(", ") })}
              </span>
            )}
          </div>
        </div>
      </div>
      <DiaPorDia serie={r.serie} hoy={hoy} />
      <div className="flex flex-wrap gap-2">
        <Pastilla color="hsl(var(--success))">
          {t("oficina.costos.partes.calculado", { h: new Date(uso.data.calculado_at).toLocaleTimeString(language, { hour: "numeric", minute: "2-digit" }) })}
        </Pastilla>
        {r.cuadradoAl && <Pastilla color="hsl(var(--success))">{t("oficina.costos.partes.cuadrado", { f: fechaCorta(r.cuadradoAl, language) })}</Pastilla>}
      </div>
    </div>
  );
  return <section aria-label={t("oficina.costos.partes.alRitmo")} className="vidrio sube overflow-hidden">{cuerpo}</section>;
}

export default function VistaPorParte() {
  const { t } = useLanguage();
  const q = useCostos();
  const uso = useUsoDelMes();
  const cuentas = useCuentas();
  const [abierto, setAbierto] = useState<string | null>(null);

  if (q.isLoading) return <Cargando alto="py-16" />;
  if (q.isError || !q.data) {
    return <div className="vidrio overflow-hidden"><FalloCompacto onReintentar={() => void q.refetch()} ocupado={q.isFetching} /></div>;
  }
  const { servicios, cobros } = q.data;
  const r = calcularCostosPorParte(servicios, cobros, uso.data ?? null, hoyEnColombia());
  const argos = r.partes.find((p) => p.parte === "argos");
  const resto = r.partes.filter((p) => p.parte !== "argos");

  return (
    <div className="flex flex-col gap-4">
      <Resumen r={r} uso={uso} />
      {argos && <SeccionArgos parte={argos} uso={uso} onAbrir={setAbierto} />}
      {/* «Otras / no es Maven» va al final, en su tarjeta gris que dice que no suma. */}
      <div className="grid gap-4 md:grid-cols-2">
        {[...resto, ...(r.otras.piezas.length > 0 ? [r.otras] : [])].map((p) => <TarjetaParte key={p.parte} parte={p} onAbrir={setAbierto} />)}
      </div>
      <BloqueBajarCostos servicios={servicios} cuentas={cuentas} onAbrir={setAbierto} />
      <p className="text-[11px] text-muted-foreground">{t("oficina.costos.partes.pie")}</p>
      <HojaFicha id={abierto} servicios={servicios} cobros={cobros} cuentas={cuentas} onCerrar={() => setAbierto(null)} />
    </div>
  );
}
