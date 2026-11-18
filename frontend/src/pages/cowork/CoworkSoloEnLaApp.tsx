import { useEffect, useState } from "react";
import { Download, ExternalLink, MonitorSmartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import { puedeCompartirPantalla } from "@/lib/compartirPantalla";
import { enlaceDeApp } from "@/lib/abrirEnApp";
import {
  DESCARGA_MAC, DESCARGA_WINDOWS, decidirAppObligatoria,
  type ConfigAppObligatoria, type EstadoAppObligatoria,
} from "@/lib/appObligatoria";

// COWORK SOLO CON LA APP DE COMPUTADOR (Alvaro, 17/11/2026). Ver lib/appObligatoria.ts.
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Lee la configuración una vez. null = todavía cargando. */
export function useAppObligatoria(): EstadoAppObligatoria | null {
  const { user } = useAuth();
  const [estado, setEstado] = useState<EstadoAppObligatoria | null>(null);
  useEffect(() => {
    const enApp = !!escritorio();
    const puedeCompartir = puedeCompartirPantalla();
    // En la app o en un celular no hace falta ni preguntar.
    if (enApp || !puedeCompartir) { setEstado({ tipo: "libre" }); return; }
    if (!user) return;
    let vivo = true;
    sinTipar.from("cowork_app_obligatoria").select("desde, probadores").eq("id", true).maybeSingle()
      .then(({ data, error }: { data: ConfigAppObligatoria | null; error: unknown }) => {
        if (!vivo) return;
        // Un error NO cierra Cowork: se deja pasar (ver lib/appObligatoria.ts).
        if (error) console.warn("[cowork] no se pudo leer si la app es obligatoria", error);
        setEstado(decidirAppObligatoria({
          enApp, puedeCompartir, config: error ? null : data, userId: user.id, ahora: Date.now(),
        }));
      });
    return () => { vivo = false; };
  }, [user]);
  return estado;
}

function BotonesDeDescarga() {
  const { t } = useLanguage();
  const esMac = /Macintosh/i.test(navigator.userAgent || "");
  const principal = esMac ? { href: DESCARGA_MAC, label: t("cowork.app.descargarMac") } : { href: DESCARGA_WINDOWS, label: t("cowork.app.descargarWindows") };
  const otro = esMac ? { href: DESCARGA_WINDOWS, label: t("cowork.app.descargarWindows") } : { href: DESCARGA_MAC, label: t("cowork.app.descargarMac") };
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <a href={principal.href} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        <Download className="h-4 w-4" aria-hidden /> {principal.label}
      </a>
      <a href={otro.href} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted">
        {otro.label}
      </a>
    </div>
  );
}

/** Pantalla completa: en este computador Cowork ya es solo con la app. */
export function CoworkSoloEnLaApp() {
  const { t } = useLanguage();
  const abrirEnLaApp = () => {
    window.location.href = enlaceDeApp(`${window.location.pathname}${window.location.search}`);
  };
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center px-4 py-10">
      <div className="vidrio grid w-full max-w-md gap-5 rounded-2xl border border-border/60 p-6 text-center">
        <MonitorSmartphone className="mx-auto h-8 w-8 text-primary" aria-hidden />
        <div className="grid gap-2">
          <h1 className="text-lg font-semibold text-foreground text-balance">{t("cowork.app.titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("cowork.app.desc")}</p>
        </div>
        <BotonesDeDescarga />
        <button type="button" onClick={abrirEnLaApp} className="mx-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-primary underline-offset-2 hover:underline">
          <ExternalLink className="h-4 w-4" aria-hidden /> {t("cowork.app.yaLaTengo")}
        </button>
      </div>
    </div>
  );
}

/** Franja de aviso mientras todavía se puede usar el navegador. */
export function AvisoAppObligatoria({ desde }: { desde: string }) {
  const { t } = useLanguage();
  const fecha = new Date(desde).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <div role="status" className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 text-center text-xs text-foreground">
      <span>{t("cowork.app.aviso", { fecha })}</span>
      <a href={/Macintosh/i.test(navigator.userAgent || "") ? DESCARGA_MAC : DESCARGA_WINDOWS} className="inline-flex min-h-8 items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline">
        <Download className="h-3.5 w-3.5" aria-hidden /> {t("cowork.app.descargar")}
      </a>
    </div>
  );
}
