import { useCallback, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, AppWindow, ArrowDownToLine, ArrowUpFromLine, Cable, CheckCircle2, Globe, Loader2, Power,
  Router, Timer, TvMinimalPlay, Users2, Wifi, XCircle,
} from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { medirRed, type PruebaDeRed } from "@/lib/pruebaDeRed";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import { estaEnLlamadaDeMaven } from "@/lib/llamadaEnMaven";
import { cn } from "@/lib/utils";
import {
  BAJADA_BIEN_MBPS, RESPUESTA_BIEN_MS, SUBIDA_BIEN_MBPS, TRAMOS_DEL_SEMAFORO, type Semaforo,
  semaforoBajada, semaforoRespuesta, semaforoSubida, veredictoDePrueba,
} from "@/lib/guiaConexion";

// GUÍA DE CONEXIÓN (Alvaro, 17/11/2026). La gente se cae de las llamadas por el
// Wi-Fi inestable, no por internet lento (lib/guiaConexion.ts). Aquí cada uno:
//   1. prueba su internet con la MISMA prueba que corre la llamada de Cowork
//      (lib/pruebaDeRed.ts → edge `prueba-de-red`, solo con sesión; no guarda
//      nada) y ve un semáforo por medida y un veredicto en palabras;
//   2. lee seis consejos concretos;
//   3. sabe qué hacer si se le cae.
// No hay botón de «recargar» a propósito: recargar esta página en medio de una
// llamada la cortaría.

export type EstadoPrueba =
  | { fase: "quieto" }
  | { fase: "probando" }
  | { fase: "listo"; prueba: PruebaDeRed; enLlamada: boolean }
  | { fase: "error" };

/** Corre la prueba con la sesión de la persona (igual que useLiveKit). Nunca tira. */
async function probarConMiSesion(): Promise<PruebaDeRed | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return await medirRed({
      url: `${SUPABASE_URL}/functions/v1/prueba-de-red`,
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    return null;
  }
}

const TONO: Record<Semaforo, { texto: string; fondo: string; borde: string; tramo: string }> = {
  bien: { texto: "text-success", fondo: "bg-success/10", borde: "border-success/30", tramo: "bg-success" },
  justo: { texto: "text-warning", fondo: "bg-warning/10", borde: "border-warning/30", tramo: "bg-warning" },
  malo: { texto: "text-destructive", fondo: "bg-destructive/10", borde: "border-destructive/30", tramo: "bg-destructive" },
};

const ETIQUETA: Record<Semaforo, TranslationKey> = {
  bien: "guiaConexion.semaforo.bien",
  justo: "guiaConexion.semaforo.justo",
  malo: "guiaConexion.semaforo.malo",
};

const VEREDICTO: Record<Semaforo | "incompleta", { titulo: TranslationKey; desc: TranslationKey; icono: ComponentType<{ className?: string }> }> = {
  bien: { titulo: "guiaConexion.veredicto.bien.titulo", desc: "guiaConexion.veredicto.bien.desc", icono: CheckCircle2 },
  justo: { titulo: "guiaConexion.veredicto.justo.titulo", desc: "guiaConexion.veredicto.justo.desc", icono: AlertTriangle },
  malo: { titulo: "guiaConexion.veredicto.malo.titulo", desc: "guiaConexion.veredicto.malo.desc", icono: XCircle },
  incompleta: { titulo: "guiaConexion.veredicto.incompleta.titulo", desc: "guiaConexion.veredicto.incompleta.desc", icono: AlertTriangle },
};

const CONSEJOS: { clave: string; icono: ComponentType<{ className?: string }> }[] = [
  { clave: "cable", icono: Cable },
  { clave: "router", icono: Router },
  { clave: "cerrar", icono: TvMinimalPlay },
  { clave: "pestana", icono: AppWindow },
  { clave: "reiniciar", icono: Power },
  { clave: "chrome", icono: Globe },
];

export default function GuiaConexionPage() {
  const [estado, setEstado] = useState<EstadoPrueba>({ fase: "quieto" });
  const enCurso = useRef(false);

  const probar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setEstado({ fase: "probando" });
    const enLlamada = hayLlamadaActiva() || estaEnLlamadaDeMaven();
    const prueba = await probarConMiSesion();
    enCurso.current = false;
    // Un fallo NO es «internet malo»: se dice que no se pudo y se ofrece reintentar.
    setEstado(prueba ? { fase: "listo", prueba, enLlamada } : { fase: "error" });
  }, []);

  return <VistaGuiaConexion estado={estado} onProbar={() => void probar()} />;
}

/** La guía tal cual se ve, sin estado propio (el banco de pruebas la pinta en cada fase). */
export function VistaGuiaConexion({ estado, onProbar }: { estado: EstadoPrueba; onProbar: () => void }) {
  const { t, language } = useLanguage();

  const numero = (n: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: n >= 10 ? 0 : 1 }).format(n);

  const prueba = estado.fase === "listo" ? estado.prueba : null;
  const veredicto = prueba ? veredictoDePrueba(prueba) : null;
  const tarjetaVeredicto = prueba ? VEREDICTO[veredicto ?? "incompleta"] : null;
  const probando = estado.fase === "probando";

  const medidas = [
    {
      clave: "subida",
      icono: ArrowUpFromLine,
      titulo: t("guiaConexion.subida.titulo"),
      desc: t("guiaConexion.subida.desc", { n: numero(SUBIDA_BIEN_MBPS) }),
      valor: prueba?.subida_mbps ?? null,
      unidad: "Mbps",
      menosDe: prueba?.subida_tope === true,
      tono: prueba ? semaforoSubida(prueba.subida_mbps, prueba.subida_tope === true) : null,
    },
    {
      clave: "bajada",
      icono: ArrowDownToLine,
      titulo: t("guiaConexion.bajada.titulo"),
      desc: t("guiaConexion.bajada.desc", { n: numero(BAJADA_BIEN_MBPS) }),
      valor: prueba?.bajada_mbps ?? null,
      unidad: "Mbps",
      menosDe: false,
      tono: prueba ? semaforoBajada(prueba.bajada_mbps) : null,
    },
    {
      clave: "respuesta",
      icono: Timer,
      titulo: t("guiaConexion.respuesta.titulo"),
      desc: t("guiaConexion.respuesta.desc", { n: numero(RESPUESTA_BIEN_MS) }),
      valor: prueba?.ms ?? null,
      unidad: "ms",
      menosDe: false,
      tono: prueba ? semaforoRespuesta(prueba.ms) : null,
    },
  ];

  return (
    <Page>
      <div className="space-y-4 sm:space-y-5">
        <PageHeader icon={<Wifi className="h-5 w-5" />} title={t("guiaConexion.titulo")} subtitle={t("guiaConexion.subtitulo")} />

        {/* ── 1. La prueba ── */}
        <section className="vidrio vidrio-glow glow-v glow-suave sube p-4 sm:p-5" aria-labelledby="guia-prueba">
          <div className="v-cont space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 id="guia-prueba" className="font-display text-lg font-semibold">{t("guiaConexion.prueba.titulo")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("guiaConexion.prueba.desc")}</p>
              </div>
              <Button
                size="lg"
                className="h-11 w-full shrink-0 gap-2 rounded-control px-5 sm:w-auto"
                onClick={onProbar}
                disabled={probando}
                aria-busy={probando}
              >
                {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                {probando
                  ? t("guiaConexion.prueba.probando")
                  : estado.fase === "quieto" ? t("guiaConexion.prueba.boton") : t("guiaConexion.prueba.otraVez")}
              </Button>
            </div>

            {estado.fase === "error" && (
              <div role="alert" className="flex items-start gap-3 rounded-panel border border-destructive/30 bg-destructive/10 p-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t("guiaConexion.prueba.error")}</p>
                  <p className="text-sm text-muted-foreground">{t("guiaConexion.prueba.errorDesc")}</p>
                </div>
              </div>
            )}

            {tarjetaVeredicto && (
              <div
                role="status"
                aria-live="polite"
                className={cn(
                  "flex items-start gap-3 rounded-panel border p-3",
                  veredicto ? cn(TONO[veredicto].fondo, TONO[veredicto].borde) : "border-border bg-muted/40",
                )}
              >
                <tarjetaVeredicto.icono className={cn("mt-0.5 h-5 w-5 shrink-0", veredicto ? TONO[veredicto].texto : "text-muted-foreground")} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t(tarjetaVeredicto.titulo)}</p>
                  <p className="text-sm text-muted-foreground">{t(tarjetaVeredicto.desc)}</p>
                </div>
              </div>
            )}

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {medidas.map((m) => (
                <li key={m.clave} className="flex min-w-0 flex-col gap-2 rounded-panel border border-border/60 bg-foreground/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <m.icono className="h-4 w-4 text-muted-foreground" />
                      {m.titulo}
                    </span>
                    {prueba && (
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                        m.tono ? cn(TONO[m.tono].fondo, TONO[m.tono].texto) : "bg-muted/60 text-muted-foreground",
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", m.tono ? TONO[m.tono].tramo : "bg-muted-foreground/50")} aria-hidden />
                        {m.tono ? t(ETIQUETA[m.tono]) : t("guiaConexion.semaforo.sinDato")}
                      </span>
                    )}
                  </div>
                  <p className="font-display text-3xl font-bold leading-none tabular-nums">
                    {probando ? (
                      <span className="inline-block h-7 w-20 animate-pulse rounded-control bg-muted/60 align-middle" aria-hidden />
                    ) : m.valor !== null ? (
                      <>
                        {m.menosDe ? t("guiaConexion.menosDe", { n: numero(m.valor) }) : numero(m.valor)}
                        <span className="ml-1 text-sm font-medium text-muted-foreground">{m.unidad}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </p>
                  {/* El semáforo como barrita de tres tramos: 1 rojo, 2 ámbar, 3 verde. */}
                  <div className="flex gap-1" aria-hidden>
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={cn(
                          "h-1.5 flex-1 rounded-full",
                          m.tono && n <= TRAMOS_DEL_SEMAFORO[m.tono] ? TONO[m.tono].tramo : "bg-foreground/10",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">{m.desc}</p>
                </li>
              ))}
            </ul>

            {estado.fase === "listo" && estado.enLlamada && (
              <p className="text-xs text-muted-foreground">{t("guiaConexion.prueba.enLlamada")}</p>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("guiaConexion.prueba.wifi")}</span>
            </p>
          </div>
        </section>

        {/* ── 2. Consejos ── */}
        <section className="vidrio sube p-4 sm:p-5" style={{ animationDelay: "0.08s" }} aria-labelledby="guia-consejos">
          <div className="v-cont">
            <h2 id="guia-consejos" className="font-display text-lg font-semibold">{t("guiaConexion.consejos.titulo")}</h2>
            <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {CONSEJOS.map(({ clave, icono: Icono }) => (
                <li key={clave} className="flex min-w-0 items-start gap-3 rounded-panel border border-border/60 bg-foreground/[0.03] p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
                    <Icono className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{t(`guiaConexion.consejo.${clave}.titulo` as TranslationKey)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t(`guiaConexion.consejo.${clave}.desc` as TranslationKey)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 3. Si se cae ── */}
        <section className="vidrio sube p-4 sm:p-5" style={{ animationDelay: "0.16s" }} aria-labelledby="guia-caida">
          <div className="v-cont">
            <h2 id="guia-caida" className="font-display text-lg font-semibold">{t("guiaConexion.caida.titulo")}</h2>
            <ol className="mt-3 space-y-3">
              {(["guiaConexion.caida.paso1", "guiaConexion.caida.paso2", "guiaConexion.caida.paso3"] as const).map((clave, i) => (
                <li key={clave} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-sm">{t(clave)}</p>
                </li>
              ))}
            </ol>
            <Button asChild variant="outline" size="lg" className="mt-4 h-11 w-full gap-2 rounded-control px-5 sm:w-auto">
              <Link to="/cowork">
                <Users2 className="h-4 w-4" />
                {t("guiaConexion.caida.irACowork")}
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </Page>
  );
}
