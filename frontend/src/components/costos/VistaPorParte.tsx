import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { num } from "@/lib/costos";
import {
  COLOR_PARTE, ahorrosDe, calcularCostosPorParte,
  type Pieza, type ResumenParte, type UsoDelMes,
} from "@/lib/costosPorParte";
import { BloqueBajarCostos, useCuentas } from "./CuentasAtadas";
import { HojaFicha } from "./FichaServicio";
import {
  CLAVE_PARTE, Cargando, FalloCompacto, Panel, Punto, exacto, hoyEnColombia, miles, redondo,
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
      {/* Lo gastado del mes, el día a día y la proyección viven arriba, en el tablero de gasto (TableroGasto, 14/11/2026). */}
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
