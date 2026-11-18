import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Loader2, ShieldAlert, Users, Gauge } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import { ListaDeNumeros, type FilaNumero } from "@/components/ui/ListaDeNumeros";
import { usePulsoEquipo } from "@/hooks/usePulsoEquipo";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useVigilancia } from "@/hooks/useVigilancia";
import QuienEstaBajando from "@/components/vigilancia/QuienEstaBajando";
import { useAtajosDeHoy } from "@/components/centro/AtajosDeHoy";
import type { EstadoVivo } from "@/hooks/useRondinVivo";
import type { CajaEquipo, PersonaPulso } from "@/lib/pulsoEquipo";
import type { TranslationKey } from "@/lib/i18n";

// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11). Solo para
// quien vigila (supervisor+). Mismo lenguaje glassy del resto (TarjetaKpi + .vidrio
// compartido). Arriba 2 KPIs — En Cowork y Nota viva —; debajo "Quién la baja"
// como su propia sección y las cajas por equipo. Clic en caja → pop-up con nombres.
// Se refresca solo cada 15 s.

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

const ESTADO_UI: Record<EstadoVivo, { punto: string; anillo: string; texto: string }> = {
  trabajando:     { punto: "bg-success",     anillo: "ring-success/40",     texto: "text-success" },
  presente:       { punto: "bg-success/70",  anillo: "ring-success/30",     texto: "text-success" },
  pausa:          { punto: "bg-warning",     anillo: "ring-warning/40",     texto: "text-warning" },
  celular:        { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  distraido:      { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  no_mira:        { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  camara_apagada: { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  se_fue:         { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  fuera_cowork:   { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  fuera_de_lugar: { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  sin_pantalla:   { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  pausa_de_mas:   { punto: "bg-warning",     anillo: "ring-warning/40",     texto: "text-warning" },
  ausente:        { punto: "bg-muted-foreground/30", anillo: "ring-transparent", texto: "text-muted-foreground" },
};
const ESTADO_LBL: Record<EstadoVivo, TranslationKey> = {
  trabajando: "dashboard.pulso.estado.trabajando", presente: "dashboard.pulso.estado.presente",
  pausa: "dashboard.pulso.estado.pausa", celular: "dashboard.pulso.estado.celular",
  distraido: "dashboard.pulso.estado.distraido", no_mira: "dashboard.pulso.estado.no_mira",
  camara_apagada: "dashboard.pulso.estado.camara_apagada", se_fue: "dashboard.pulso.estado.se_fue",
  fuera_cowork: "dashboard.pulso.estado.fuera_cowork", fuera_de_lugar: "dashboard.pulso.estado.fuera_de_lugar",
  sin_pantalla: "dashboard.pulso.estado.sin_pantalla", pausa_de_mas: "dashboard.pulso.estado.pausa_de_mas",
  ausente: "dashboard.pulso.estado.ausente",
};

function tonoBanda(nota: number | null): { texto: string; tono: "primary" | "success" | "warning" | "danger"; glow: string } {
  if (nota == null) return { texto: "text-muted-foreground", tono: "primary", glow: "glow-b" };
  if (nota >= 80) return { texto: "text-success", tono: "success", glow: "glow-g" };
  if (nota >= 60) return { texto: "text-warning", tono: "warning", glow: "glow-a" };
  return { texto: "text-destructive", tono: "danger", glow: "glow-r" };
}

function hace(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: false, locale: lang === "es" ? esLocale : undefined });
  } catch { return null; }
}

/** Una persona como fila: avatar, nombre, estado en vivo y "hace X". Clic → expediente. */
function FilaPersona({ p, t, lang, onAbrir, problema }: { p: PersonaPulso; t: Tr; lang: string; onAbrir?: () => void; problema?: boolean }) {
  const ui = ESTADO_UI[p.estado];
  const desde = hace(p.desde, lang);
  // Sin permiso al expediente (supervisores, admins): la fila se ve, no se abre.
  const Raiz = onAbrir ? "button" : "div";
  return (
    <Raiz {...(onAbrir ? { type: "button" as const, onClick: onAbrir } : {})}
      className={`group flex items-center gap-2.5 rounded-panel border px-2.5 py-1.5 text-left transition ${
        problema ? "border-border/60 bg-card/30 hover:border-foreground/25 hover:bg-card/50"
                 : "border-border/40 bg-card/30 hover:border-foreground/25 hover:bg-card/50"
      }`}>
      <span className="relative shrink-0">
        <UserAvatar name={p.nombre || "·"} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${ui.punto}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight">{p.nombre || "—"}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">
          {t(ESTADO_LBL[p.estado])}{desde && <span className="font-normal text-muted-foreground"> · {desde}</span>}
        </span>
      </span>
      {onAbrir && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />}
    </Raiz>
  );
}

/** Una caja por equipo: nombre, conectados, nota viva y su gente. */
export function CajaDelEquipo({ caja, t, lang, abrir }: { caja: CajaEquipo; t: Tr; lang: string; abrir: ((id: string) => void) | null }) {
  const [verFuera, setVerFuera] = useState(false);
  const conectados = caja.miembros.filter((p) => p.conectado);
  const fuera = caja.miembros.filter((p) => !p.conectado);
  const tn = tonoBanda(caja.nota);
  return (
    <div className="vidrio min-w-0 p-4">
      <div className="v-cont space-y-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{caja.equipo}</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {t("dashboard.pulso.conectadosCaja", { conectados: caja.conectados, total: caja.total })}
          </span>
          {caja.nota != null && <span className="ml-auto font-display text-base font-semibold tabular-nums text-foreground">{caja.nota}</span>}
        </div>
        {conectados.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("dashboard.pulso.sinConectados")}</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {conectados.map((p) => (
              <FilaPersona key={p.userId} p={p} t={t} lang={lang} problema={p.problema} onAbrir={abrir ? () => abrir(p.userId) : undefined} />
            ))}
          </div>
        )}
        {fuera.length > 0 && (
          <div>
            <button type="button" onClick={() => setVerFuera((v) => !v)} aria-expanded={verFuera}
              className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {t("dashboard.pulso.sinConectar", { n: fuera.length })}
            </button>
            {verFuera && (
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {fuera.map((p) => (
                  <FilaPersona key={p.userId} p={p} t={t} lang={lang} onAbrir={abrir ? () => abrir(p.userId) : undefined} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Los números del Pulso como filas de ListaDeNumeros (el inicio en dos
 *  columnas los pone a la derecha, 13/11/2026). Mismos valores que las tarjetas. */
export function NumerosDelInicio({ coworkConectados, extra = [] }: { coworkConectados?: number | null; extra?: FilaNumero[] }) {
  const { t, language } = useLanguage();
  const { puedeVer, pulso, ultimaRonda } = usePulsoEquipo();
  const ultima = ultimaRonda ? hace(ultimaRonda.toISOString(), language) : null;
  // Primero los cuatro atajos de hoy (Alvaro, 18/11/2026); después, lo de ahora mismo.
  const atajos = useAtajosDeHoy(puedeVer);
  const filas: FilaNumero[] = [];
  if (puedeVer && pulso && pulso.total > 0) {
    filas.push(
      coworkConectados === undefined
        ? { icono: Users, tono: "success", etiqueta: t("dashboard.pulso.conectadosAhora"), valor: pulso.conectados, detalle: t("dashboard.pulso.deTotal", { total: pulso.total }) }
        : { icono: Users, tono: "success", etiqueta: t("dashboard.pulso.enCowork"), valor: coworkConectados == null ? "–" : coworkConectados, detalle: t("dashboard.pulso.conApp", { n: pulso.conectados }) },
      { icono: Gauge, tono: tonoBanda(pulso.notaViva ?? null).tono, etiqueta: t("dashboard.pulso.notaViva"), valor: pulso.notaViva ?? "—",
        detalle: pulso.conectados === 0 ? t("dashboard.pulso.sinConectados") : t("dashboard.pulso.trabajandoProblema", { trabajando: pulso.trabajando, problema: pulso.conProblema }) },
      { icono: CheckCircle2, tono: "success", etiqueta: t("dashboard.pulso.trabajando"), valor: pulso.trabajando, detalle: ultima ? t("dashboard.pulso.ultimaRonda", { hace: ultima }) : undefined },
      { icono: AlertTriangle, tono: pulso.conProblema > 0 ? "danger" : "success", etiqueta: t("dashboard.pulso.conProblema"), valor: pulso.conProblema,
        detalle: pulso.conProblema === 0 ? t("dashboard.pulso.todoEnOrden") : t("dashboard.pulso.hazClicProblema") },
    );
  }
  return <ListaDeNumeros titulo={t("dashboard.centro.numeros")} icono={Gauge} filas={[...atajos, ...filas, ...extra]} />;
}

export default function PulsoEquipoVivo({ coworkConectados, conEquipo = false, conNumeros = true, conCabecera = true }: {
  /** Conectados en Cowork según LiveKit (solo el Centro lo trae). Sin él, la
   *  primera tarjeta cuenta los conectados del propio Pulso. */
  coworkConectados?: number | null;
  /** Muestra además quién es quién, por equipo (tableros de supervisor y RR. HH.). */
  conEquipo?: boolean;
  /** Las 4 tarjetas de números. El inicio en dos columnas las pone aparte (NumerosDelInicio). */
  conNumeros?: boolean;
  /** La línea «Pulso del equipo · En vivo · Solo visible para…». El inicio no la lleva. */
  conCabecera?: boolean;
}) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { puedeVer, alcance, pulso, cargando, error, ultimaRonda, reintentar } = usePulsoEquipo();
  const { esDueno } = useEsDueno();
  // Quien vigila (dueño, RR. HH., supervisor) ve «Quién está bajando ahora»: en
  // la computadora arriba del Pulso; en el teléfono va primero en la página.
  const { puede: vigila } = useVigilancia();

  const ultima = useMemo(() => (ultimaRonda ? hace(ultimaRonda.toISOString(), language) : null), [ultimaRonda, language]);
  // El expediente lo abren el dueño y RR. HH. (la ruta es soloDueno + tambienRh).
  const abrir = esDueno === true || alcance === "rrhh" ? (id: string) => navigate(`/hr/expediente/${id}`) : null;

  if (!puedeVer) return null;

  const tn = tonoBanda(pulso?.notaViva ?? null);

  return (
    <section className="space-y-3">
      {/* Cabecera del Pulso (solo título + en vivo + aviso). En el inicio del
          dueño ya no va (Alvaro, 18/11/2026: «no se necesita, que quede más espacio»). */}
      {conCabecera && (
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/[0.08] text-primary/90 ring-1 ring-primary/20"><Activity className="h-4 w-4" /></span>
          {t("dashboard.pulso.titulo")}
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {t("dashboard.pulso.enVivo")}
          </span>
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />{t("dashboard.pulso.soloVigilancia")}
        </span>
      </div>
      )}

      {/* «Quién está bajando ahora» (11/11): computadora, arriba del Pulso. Se
          dibuja solo fuera del teléfono (allá va lo primero de la página). */}
      <QuienEstaBajando lugar="pulso" />

      {cargando && !pulso ? (
        <div className="vidrio p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : error ? (
        // Un fallo no es «sin equipo»: se dice y se deja reintentar.
        <div role="alert" className="vidrio p-4 text-sm text-muted-foreground">
          {t("dashboard.centro.fallo")}
          <button type="button" onClick={reintentar} className="underline underline-offset-2 hover:text-foreground">{t("dashboard.centro.reintentar")}</button>
        </div>
      ) : !pulso || pulso.total === 0 ? (
        <div className="vidrio p-4"><p className="text-sm text-muted-foreground">{t("dashboard.pulso.sinEquipo")}</p></div>
      ) : (
        <>
          {/* MISMAS TARJETAS KPI que el resto del dashboard: ícono + etiqueta +
              número grande + detalle. Todo con el lenguaje glassy compartido. */}
          {conNumeros && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {coworkConectados === undefined ? (
              <TarjetaKpi
                indice={0}
                icono={Users}
                tono="success"
                etiqueta={t("dashboard.pulso.conectadosAhora")}
                valor={pulso.conectados}
                detalle={t("dashboard.pulso.deTotal", { total: pulso.total })}
              />
            ) : (
              <TarjetaKpi
                indice={0}
                icono={Users}
                tono="success"
                etiqueta={t("dashboard.pulso.enCowork")}
                valor={coworkConectados == null ? "–" : coworkConectados}
                detalle={t("dashboard.pulso.conApp", { n: pulso.conectados })}
              />
            )}
            <TarjetaKpi
              indice={1}
              icono={Gauge}
              tono={tn.tono}
              etiqueta={t("dashboard.pulso.notaViva")}
              valor={pulso.notaViva ?? "—"}
              detalle={pulso.conectados === 0
                ? t("dashboard.pulso.sinConectados")
                : t("dashboard.pulso.trabajandoProblema", { trabajando: pulso.trabajando, problema: pulso.conProblema })}
            />
            <TarjetaKpi
              indice={2}
              icono={CheckCircle2}
              tono="success"
              etiqueta={t("dashboard.pulso.trabajando")}
              valor={pulso.trabajando}
              detalle={ultima ? t("dashboard.pulso.ultimaRonda", { hace: ultima }) : "—"}
            />
            <TarjetaKpi
              indice={3}
              icono={AlertTriangle}
              tono={pulso.conProblema > 0 ? "danger" : "success"}
              etiqueta={t("dashboard.pulso.conProblema")}
              valor={pulso.conProblema}
              detalle={pulso.conProblema === 0 ? t("dashboard.pulso.todoEnOrden") : t("dashboard.pulso.hazClicProblema")}
            />
          </div>
          )}

          {/* "Quién la está bajando" como su propia sección glassy. Para quien
              vigila lo reemplaza «Quién está bajando ahora» (con miniatura y en
              vivo); los demás (admin, manager) siguen viendo esta lista. */}
          {pulso.conProblema > 0 && vigila !== true && (
            <div className="vidrio p-4">
              <div className="v-cont space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                  {t("dashboard.pulso.quienLaBaja")}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {pulso.quienLaBaja.slice(0, 9).map((p) => (
                    <FilaPersona key={p.userId} p={p} t={t} lang={language} problema onAbrir={abrir ? () => abrir(p.userId) : undefined} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Alvaro (08/11 noche): el botón "Ver el equipo completo" sobraba —
              el Pulso ya es el vistazo; para el detalle se entra por Argos
              desde el menú. Fuera. */}

          {/* Quién es quién, por equipo (supervisor y RR. HH., 10/11): los
              conectados a la vista; los que no están, plegados. */}
          {conEquipo && (
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {pulso.cajas.map((c) => (
                <CajaDelEquipo key={c.equipo} caja={c} t={t} lang={language} abrir={abrir} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
