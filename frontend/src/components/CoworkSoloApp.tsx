import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CircleHelp, Download, ExternalLink, MonitorDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useFormato } from "@/hooks/useFormato";
import { escritorio } from "@/lib/escritorio";
import { enlaceDeApp } from "@/lib/abrirEnApp";
import { COLUMNA_DESDE, esNavegadorDeComputador, estadoSoloApp, type EstadoSoloApp, type LugarSoloApp } from "@/lib/coworkSoloApp";
import { RUTA_DESCARGAR_CON_GUIA } from "@/lib/guiaApp";
import { RUTA_GUIA_APP } from "@/lib/guiaApp";
import { useSoloNavegadorConEstado } from "@/hooks/useExigencias";

// Ver lib/coworkSoloApp.ts. Aviso (antes de la fecha) o pantalla de «Cowork se
// abre en la app» (desde la fecha). Si la fecha no se puede leer, no se bloquea.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };
const CLAVE_CERRADO = "maven.coworkSoloApp.avisoCerrado";

export function useCoworkSoloApp(): { estado: EstadoSoloApp; desde: Date | null } {
  const { estado, desde } = useSoloApp("cowork");
  return { estado, desde };
}

/** Llamadas del Messenger y Meet internos (lib/coworkSoloApp.ts → LLAMADAS). */
export function useLlamadasSoloApp(): { estado: EstadoSoloApp; desde: Date | null; listo: boolean } {
  return useSoloApp("llamadas");
}

/** El mismo bloqueo para Cowork y para las llamadas; cambia solo la fecha.
 *  `listo` = ya se sabe la respuesta (en la app o el celular, al instante): una
 *  llamada no se conecta mientras tanto, para no entrar y sacarla un segundo
 *  después. Si la lectura falla, no se bloquea (igual que Cowork). */
function useSoloApp(lugar: LugarSoloApp): { estado: EstadoSoloApp; desde: Date | null; listo: boolean } {
  const { user } = useAuth();
  const [desde, setDesde] = useState<Date | null>(null);
  const [probadores, setProbadores] = useState<string[]>([]);
  const [leido, setLeido] = useState(false);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const tactil = typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  const enApp = !!escritorio();
  const hayQueMirar = esNavegadorDeComputador({ ua, tactil, enApp });
  useEffect(() => {
    let vivo = true;
    const columna = COLUMNA_DESDE[lugar];
    void (async () => {
      try {
        // Solo la columna de este lugar: si la de llamadas todavía no existe,
        // Cowork sigue leyendo la suya sin error.
        const { data, error } = await sinTipar.from("monitor_config").select(`${columna}, cowork_solo_app_probadores`).eq("id", 1).maybeSingle();
        if (error || !vivo) return;
        setDesde(data?.[columna] ? new Date(data[columna]) : null);
        setProbadores(Array.isArray(data?.cowork_solo_app_probadores) ? data.cowork_solo_app_probadores : []);
      } catch { /* sin fecha no se bloquea */ } finally {
        if (vivo) setLeido(true);
      }
    })();
    return () => { vivo = false; };
  }, [lugar]);
  const probador = !!user?.id && probadores.includes(user.id);
  const { soloNavegador, listo: navegadorListo } = useSoloNavegadorConEstado(!!user?.id && hayQueMirar);
  return { estado: estadoSoloApp({ ua, tactil, enApp, desde, ahora: new Date(), probador, soloNavegador }), desde, listo: (leido && navegadorListo) || !hayQueMirar };
}

function enlaces() {
  const ruta = `${window.location.pathname}${window.location.search}`;
  // La descarga pasa por la guía (/app?descargar=1): baja sola y muestra los
  // pasos, incluido el aviso azul de Windows (18/11/2026).
  return { app: enlaceDeApp(ruta), descarga: RUTA_DESCARGAR_CON_GUIA };
}

/** Aviso flotante en Cowork (antes de la fecha). Va montado en App.tsx para que
 *  se vea también dentro de una sala. Se cierra por un día. */
export function AvisoSoloApp() {
  const { pathname } = useLocation();
  const enCowork = pathname === "/cowork" || pathname.startsWith("/cowork/");
  return enCowork ? <AvisoSoloAppEnCowork /> : null;
}

function AvisoSoloAppEnCowork() {
  const { t } = useLanguage();
  const formato = useFormato();
  const { estado, desde } = useCoworkSoloApp();
  const hoy = new Date().toDateString();
  const [cerrado, setCerrado] = useState(() => {
    try { return localStorage.getItem(CLAVE_CERRADO) === hoy; } catch { return false; }
  });
  if (cerrado || estado !== "aviso" || !desde) return null;
  const { app, descarga } = enlaces();
  const cerrar = () => {
    try { localStorage.setItem(CLAVE_CERRADO, hoy); } catch { /* se vuelve a ver al recargar */ }
    setCerrado(true);
  };
  return (
    <div role="status" className="vidrio fixed bottom-4 left-1/2 z-[150] flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-border/60 px-4 py-3 shadow-2xl">
      <MonitorDown className="h-5 w-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm text-foreground">
        {t("cowork.soloApp.aviso", { fecha: desde.toLocaleDateString(formato.intl(), { weekday: "long", day: "numeric", month: "long" }) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><a href={descarga}><Download className="mr-1.5 h-3.5 w-3.5" />{t("cowork.soloApp.descargar")}</a></Button>
        <Button asChild size="sm" variant="outline"><a href={app}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t("cowork.soloApp.abrir")}</a></Button>
        {/* La guía paso a paso (/app): descargar, instalar, entrar, permisos. */}
        <Button asChild size="sm" variant="ghost"><Link to={RUTA_GUIA_APP}><CircleHelp className="mr-1.5 h-3.5 w-3.5" />{t("cowork.soloApp.comoSeInstala")}</Link></Button>
      </div>
      <button type="button" onClick={cerrar} aria-label={t("cowork.soloApp.cerrar")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Desde la fecha: Cowork (o una llamada interna, `lugar="llamadas"`) no abre
 *  en el navegador del computador. Misma pantalla, mismos botones. */
export function BloqueoSoloApp({ lugar = "cowork" }: { lugar?: LugarSoloApp } = {}) {
  const { t } = useLanguage();
  const { app, descarga } = enlaces();
  const textos = lugar === "llamadas"
    ? ({ titulo: "messenger.soloApp.titulo", desc: "messenger.soloApp.desc", celular: "messenger.soloApp.celular" } as const)
    : ({ titulo: "cowork.soloApp.titulo", desc: "cowork.soloApp.desc", celular: "cowork.soloApp.celular" } as const);
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-4 text-center">
      <MonitorDown className="h-10 w-10 text-primary" />
      <p className="text-lg font-semibold text-foreground">{t(textos.titulo)}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t(textos.desc)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild><a href={app}><ExternalLink className="mr-1.5 h-4 w-4" />{t("cowork.soloApp.abrir")}</a></Button>
        <Button asChild variant="outline"><a href={descarga}><Download className="mr-1.5 h-4 w-4" />{t("cowork.soloApp.descargar")}</a></Button>
      </div>
      {/* /app se puede abrir aunque Cowork sea obligatorio (rutaLibreDeCowork). */}
      <Link to={RUTA_GUIA_APP} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline">
        <CircleHelp className="h-4 w-4" />{t("cowork.soloApp.comoSeInstala")}
      </Link>
      <p className="max-w-md text-xs text-muted-foreground">{t(textos.celular)}</p>
    </div>
  );
}
