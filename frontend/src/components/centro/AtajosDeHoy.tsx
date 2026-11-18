import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, AlertTriangle, LogIn, TrendingDown, UserX } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import type { FilaNumero } from "@/components/ui/ListaDeNumeros";
import { useHoyDelEquipo } from "@/hooks/useHoyDelEquipo";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useEsRh } from "@/hooks/useEsRh";
import { horaBogota, type PersonaDeHoy } from "@/lib/llegadas";
import type { TranslationKey } from "@/lib/i18n";

// LOS CUATRO ATAJOS, PRIMERO EN «LOS NÚMEROS DE HOY» (Alvaro, 18/11/2026: «lo
// primero que quiero saber es quién llegó tarde, quién llegó, quién va abajo en
// puntos, quién no está trabajando»). Al tocar uno, la lista se abre ahí mismo
// con cara, nombre y el dato; tocar a alguien abre su expediente.

const ESTADO: Record<string, TranslationKey> = {
  activo: "hr.donde.estado.activo",
  pausa: "hr.donde.estado.pausa",
  meet: "hr.donde.estado.meet",
  en_llamada: "hr.donde.estado.enLlamada",
  sin_pantalla: "hr.donde.estado.sinPantalla",
  sin_camara: "hr.donde.estado.sinCamara",
  fuera_de_camara: "hr.donde.estado.fueraDeCamara",
  sin_conexion: "hr.donde.estado.sinConexion",
  sin_conexion_larga: "hr.donde.estado.sinConexion",
  fuera_de_cowork: "hr.donde.estado.fueraDeCowork",
  no_ha_entrado: "hr.donde.estado.noHaEntrado",
  fuera_de_turno: "hr.donde.estado.fueraDeTurno",
};

type Fotos = Record<string, { foto: string | null; seed: string | null }>;

/** Una persona de la lista: cara, nombre, el dato y, a la derecha, la cifra. */
function Persona({ p, fotos, detalle, cifra, tonoCifra, enlace }: {
  p: Pick<PersonaDeHoy, "userId" | "nombre">;
  fotos: Fotos;
  detalle: ReactNode;
  cifra?: ReactNode;
  tonoCifra?: "ojo" | "neutro";
  enlace: string | null;
}) {
  const foto = fotos[p.userId];
  const cuerpo = (
    <>
      <UserAvatar name={p.nombre} src={foto?.foto} seed={foto?.seed} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground/90">{p.nombre}</span>
        <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{detalle}</span>
      </span>
      {cifra != null && (
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${tonoCifra === "ojo" ? "text-warning" : "text-foreground/80"}`}>{cifra}</span>
      )}
    </>
  );
  return (
    <li>
      {enlace ? (
        <Link to={enlace} state={{ volverA: "/dashboard" }} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/[0.05]">
          {cuerpo}
        </Link>
      ) : (
        <div className="flex items-center gap-2.5 px-2 py-1.5">{cuerpo}</div>
      )}
    </li>
  );
}

function Lista({ children, vacio }: { children: ReactNode[]; vacio: string }) {
  if (children.length === 0) return <p className="px-2 py-1.5 text-xs text-muted-foreground">{vacio}</p>;
  return <ul className="-mx-1 max-h-80 overflow-y-auto rounded-xl bg-foreground/[0.025] p-1">{children}</ul>;
}

function Subtitulo({ texto }: { texto: string }) {
  return <p className="px-2 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{texto}</p>;
}

/** Las cuatro filas para «Los números de hoy». Vacío si quien mira no vigila al equipo. */
export function useAtajosDeHoy(habilitado: boolean): FilaNumero[] {
  const { t } = useLanguage();
  const { esDueno } = useEsDueno();
  const { esRh } = useEsRh();
  const { datos, fotos, cargando, fallo, cargandoNotas, falloNotas, reintentar } = useHoyDelEquipo(habilitado);
  if (!habilitado) return [];

  // El expediente lo abren el dueño y RR. HH.; los demás ven la lista sin enlace.
  const enlace = (id: string) => (esDueno === true || esRh === true ? `/hr/expediente/${id}` : null);
  const minutos = (n: number) => (n < 60 ? t("dashboard.atajos.min", { n }) : t("dashboard.atajos.horas", { h: Math.floor(n / 60), m: String(n % 60).padStart(2, "0") }));
  const hace = (iso: string | null) => {
    if (!iso) return "";
    return minutos(Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)));
  };

  if (fallo) {
    return [{
      icono: AlertTriangle, tono: "danger", etiqueta: t("dashboard.atajos.fallo"), valor: "–",
      detalle: <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={reintentar}>{t("dashboard.centro.reintentar")}</button>,
    }];
  }
  if (cargando || !datos) {
    return (["dashboard.atajos.tarde", "dashboard.atajos.llegaron", "dashboard.atajos.abajo", "dashboard.atajos.noTrabajan"] as TranslationKey[])
      .map((k, i) => ({ icono: [AlarmClock, LogIn, TrendingDown, UserX][i], etiqueta: t(k), valor: "…" }));
  }

  const { llegaron, faltan, tarde, noTrabajan, porNota } = datos;
  const debiaEntrar = (p: PersonaDeHoy) => (p.entrada ? t("dashboard.atajos.debia", { h: p.entrada }) : t("dashboard.atajos.sinHorario"));
  const filaFalta = (p: PersonaDeHoy) => (
    <Persona key={p.userId} p={p} fotos={fotos} enlace={enlace(p.userId)}
      detalle={`${t("dashboard.atajos.noLlega")} · ${debiaEntrar(p)}`} cifra="—" />
  );
  const bajos = porNota.filter((p) => (p.nota ?? 100) < 60);

  return [
    {
      icono: AlarmClock,
      tono: tarde.length > 0 ? "warning" : "success",
      etiqueta: t("dashboard.atajos.tarde"),
      valor: tarde.length,
      detalle: faltan.length > 0 ? t("dashboard.atajos.tardeYFaltan", { n: faltan.length }) : t("dashboard.atajos.tardeDetalle"),
      desplegable: (
        <>
          <Lista vacio={t("dashboard.atajos.nadieTarde")}>
            {tarde.map((p) => (
              <Persona key={p.userId} p={p} fotos={fotos} enlace={enlace(p.userId)}
                detalle={t("dashboard.atajos.entroDebia", { h: horaBogota(p.llegoAt!), e: p.entrada ?? "—" })}
                cifra={`+${minutos(p.tardeMin!)}`} tonoCifra="ojo" />
            ))}
          </Lista>
          {faltan.length > 0 && (
            <>
              <Subtitulo texto={t("dashboard.atajos.todaviaNo", { n: faltan.length })} />
              <Lista vacio="">{faltan.map(filaFalta)}</Lista>
            </>
          )}
        </>
      ),
    },
    {
      icono: LogIn,
      tono: "success",
      etiqueta: t("dashboard.atajos.llegaron"),
      valor: <span>{llegaron.length}<span className="text-sm text-muted-foreground">/{llegaron.length + faltan.length}</span></span>,
      detalle: t("dashboard.atajos.llegaronDetalle"),
      desplegable: (
        <>
          <Lista vacio={t("dashboard.atajos.nadieLlego")}>
            {llegaron.map((p) => (
              <Persona key={p.userId} p={p} fotos={fotos} enlace={enlace(p.userId)}
                detalle={p.tardeMin != null ? t("dashboard.atajos.tardeCorto", { m: minutos(p.tardeMin) }) : p.entrada ? t("dashboard.atajos.aTiempo", { h: p.entrada }) : t("dashboard.atajos.sinHorario")}
                cifra={horaBogota(p.llegoAt!)} tonoCifra={p.tardeMin != null ? "ojo" : "neutro"} />
            ))}
          </Lista>
          {faltan.length > 0 && (
            <>
              <Subtitulo texto={t("dashboard.atajos.todaviaNo", { n: faltan.length })} />
              <Lista vacio="">{faltan.map(filaFalta)}</Lista>
            </>
          )}
        </>
      ),
    },
    {
      icono: TrendingDown,
      tono: bajos.length > 0 ? "danger" : "success",
      etiqueta: t("dashboard.atajos.abajo"),
      valor: falloNotas ? "–" : cargandoNotas ? "…" : bajos.length,
      detalle: falloNotas ? t("dashboard.atajos.falloNotas") : t("dashboard.atajos.abajoDetalle"),
      desplegable: falloNotas || cargandoNotas ? undefined : (
        <Lista vacio={t("dashboard.atajos.sinNotas")}>
          {porNota.map((p) => (
            <Persona key={p.userId} p={p} fotos={fotos} enlace={enlace(p.userId)}
              detalle={p.equipo ?? ""} cifra={p.nota} tonoCifra={(p.nota ?? 100) < 60 ? "ojo" : "neutro"} />
          ))}
        </Lista>
      ),
    },
    {
      icono: UserX,
      tono: noTrabajan.length > 0 ? "danger" : "success",
      etiqueta: t("dashboard.atajos.noTrabajan"),
      valor: noTrabajan.length,
      detalle: t("dashboard.atajos.noTrabajanDetalle"),
      separarCon: t("dashboard.atajos.ahoraMismo"),
      desplegable: (
        <Lista vacio={t("dashboard.atajos.todosTrabajan")}>
          {noTrabajan.map((p) => (
            <Persona key={p.userId} p={p} fotos={fotos} enlace={enlace(p.userId)}
              detalle={p.estado === "no_ha_entrado"
                ? `${t(ESTADO[p.estado])} · ${debiaEntrar(p)}`
                : p.estadoDesde ? `${t(ESTADO[p.estado] ?? "hr.donde.estado.otro")} · ${t("dashboard.atajos.desde", { h: horaBogota(p.estadoDesde) })}` : t(ESTADO[p.estado] ?? "hr.donde.estado.otro")}
              cifra={p.estado === "no_ha_entrado" ? undefined : hace(p.estadoDesde)} />
          ))}
        </Lista>
      ),
    },
  ];
}
