import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ScreenShareOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { vigilarPantallaNegra } from "@/lib/pantallaNegra";
import { cn } from "@/lib/utils";

// TU PANTALLA, COMO EN MEET (Alvaro, 19/11/2026).
//
// Primero fue solo el texto «estás compartiendo»; después (19/11) un cuadrito
// con la vista real. Alvaro eligió lo de Meet sin la vista: una tarjeta chica
// «Estás presentando a todos» con «Dejar de compartir». Sin video a propósito:
// verse la propia pantalla trae el túnel infinito del 18/11, que además les
// llega a todos. Se esconde en una pastilla «Compartiendo» (se recuerda).
//
// Si la pantalla les llega en negro (lib/pantallaNegra.ts), la tarjeta lo dice
// en rojo con la ayuda del permiso de «Grabación de pantalla»: así nunca dice
// «presentando» cuando a los demás no les llega nada.

const CLAVE_OCULTA = "maven.call.miPantalla.oculta";

function leerOculta(): boolean {
  try { return window.localStorage.getItem(CLAVE_OCULTA) === "1"; } catch { return false; }
}
function guardarOculta(v: boolean) {
  try { window.localStorage.setItem(CLAVE_OCULTA, v ? "1" : "0"); } catch { /* sin almacenamiento */ }
}

export interface MiPantallaCompartidaProps {
  /** La pista de la pantalla propia (publicación ScreenShare del participante local). */
  track: MediaStreamTrack;
  /** Ventanita flotante: miniatura más chica. */
  compacto?: boolean;
  /** Deja de compartir: la MISMA función que usa la barra de controles. */
  onDejar: () => void;
  /** Si quien llama ya mide el negro (el Hub), lo pasa; si no, se mide aquí. */
  negra?: boolean;
}

export default function MiPantallaCompartida({ track, compacto = false, onDejar, negra: negraDeAfuera }: MiPantallaCompartidaProps) {
  const { t } = useLanguage();
  const [oculta, setOculta] = useState(leerOculta);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [negraPropia, setNegraPropia] = useState(false);
  const negra = negraDeAfuera ?? negraPropia;

  // Solo se mide aquí cuando nadie lo mide afuera (fuera del Hub).
  useEffect(() => {
    if (negraDeAfuera !== undefined) return;
    setNegraPropia(false);
    return vigilarPantallaNegra(track, setNegraPropia);
  }, [track, negraDeAfuera]);

  const alternar = () => setOculta((v) => { guardarOculta(!v); return !v; });

  if (oculta) {
    return (
      <button
        type="button"
        data-testid="mi-pantalla-pastilla"
        onClick={alternar}
        title={t("messenger.callView.miPantalla.mostrar")}
        aria-label={t("messenger.callView.miPantalla.mostrar")}
        className={cn(
          "vidrio absolute bottom-2 left-2 z-20 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-white/10",
          negra && "ring-1 ring-destructive/70",
        )}
      >
        {negra
          ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />
          : <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />}
        {t("messenger.callView.miPantalla.compartiendo")}
        <ChevronUp className="h-3 w-3 opacity-70" aria-hidden />
      </button>
    );
  }

  return (
    <div
      data-testid="mi-pantalla-compartida"
      className={cn(
        "vidrio absolute bottom-2 left-2 z-20 overflow-hidden rounded-xl shadow-xl ring-1",
        negra ? "ring-destructive/60" : "ring-white/15",
        compacto ? "max-w-[60%]" : "w-[280px] max-w-[45%]",
      )}
    >
      <div className={cn("flex items-center gap-2", compacto ? "px-2 py-1.5" : "px-3 py-2")}>
        {negra
          ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          : <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden />}
        <span className={cn("min-w-0 flex-1 font-medium text-foreground", compacto ? "truncate text-[11px]" : "text-xs")}>
          {negra ? t("messenger.callView.miPantalla.negra") : t("messenger.callView.miPantalla.presentando")}
        </span>
        <button
          type="button"
          onClick={alternar}
          title={t("messenger.callView.miPantalla.ocultar")}
          aria-label={t("messenger.callView.miPantalla.ocultar")}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {negra && !compacto && (
        <div className="px-3 pb-1.5">
          <button type="button" onClick={() => setAyudaAbierta((v) => !v)} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {t("messenger.callView.miPantalla.comoArreglar")}
          </button>
          {ayudaAbierta && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("cowork.hubPantalla.negraDetalle")}</p>}
        </div>
      )}
      <div className={cn("border-t border-white/10", compacto ? "px-2 py-1.5" : "px-3 py-2")}>
        <button
          type="button"
          onClick={onDejar}
          title={t("messenger.callView.miPantalla.dejar")}
          aria-label={t("messenger.callView.miPantalla.dejar")}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-full bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90",
            compacto ? "h-6 text-[10px]" : "h-7 text-xs",
          )}
        >
          <ScreenShareOff className="h-3.5 w-3.5" aria-hidden />
          {t("messenger.callView.miPantalla.dejar")}
        </button>
      </div>
    </div>
  );
}
