import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, ExternalLink, MonitorDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { escritorio } from "@/lib/escritorio";
import { enlaceDeApp } from "@/lib/abrirEnApp";
import { descargaParaEsteEquipo, estadoSoloApp, type EstadoSoloApp } from "@/lib/coworkSoloApp";

// Ver lib/coworkSoloApp.ts. Aviso (antes de la fecha) o pantalla de «Cowork se
// abre en la app» (desde la fecha). Si la fecha no se puede leer, no se bloquea.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };
const DESCARGAS = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/descargas`;
const CLAVE_CERRADO = "maven.coworkSoloApp.avisoCerrado";

export function useCoworkSoloApp(): { estado: EstadoSoloApp; desde: Date | null } {
  const [desde, setDesde] = useState<Date | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await sinTipar.from("monitor_config").select("cowork_solo_app_desde").eq("id", 1).maybeSingle();
        if (error || !vivo) return;
        setDesde(data?.cowork_solo_app_desde ? new Date(data.cowork_solo_app_desde) : null);
      } catch { /* sin fecha no se bloquea */ }
    })();
    return () => { vivo = false; };
  }, []);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const tactil = typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 1;
  return { estado: estadoSoloApp({ ua, tactil, enApp: !!escritorio(), desde, ahora: new Date() }), desde };
}

function enlaces() {
  const ruta = `${window.location.pathname}${window.location.search}`;
  return { app: enlaceDeApp(ruta), descarga: `${DESCARGAS}/${descargaParaEsteEquipo(navigator.userAgent || "")}` };
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
      </div>
      <button type="button" onClick={cerrar} aria-label={t("cowork.soloApp.cerrar")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Desde la fecha: Cowork no abre en el navegador del computador. */
export function BloqueoSoloApp() {
  const { t } = useLanguage();
  const { app, descarga } = enlaces();
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 px-4 text-center">
      <MonitorDown className="h-10 w-10 text-primary" />
      <p className="text-lg font-semibold text-foreground">{t("cowork.soloApp.titulo")}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t("cowork.soloApp.desc")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild><a href={app}><ExternalLink className="mr-1.5 h-4 w-4" />{t("cowork.soloApp.abrir")}</a></Button>
        <Button asChild variant="outline"><a href={descarga}><Download className="mr-1.5 h-4 w-4" />{t("cowork.soloApp.descargar")}</a></Button>
      </div>
      <p className="max-w-md text-xs text-muted-foreground">{t("cowork.soloApp.celular")}</p>
    </div>
  );
}
