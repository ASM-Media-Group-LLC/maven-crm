import { useEffect, useState } from "react";
import { AlertTriangle, ScreenShareOff } from "lucide-react";
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
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [negraPropia, setNegraPropia] = useState(false);
  const negra = negraDeAfuera ?? negraPropia;

  // Solo se mide aquí cuando nadie lo mide afuera (fuera del Hub).
  useEffect(() => {
    if (negraDeAfuera !== undefined) return;
    setNegraPropia(false);
    return vigilarPantallaNegra(track, setNegraPropia);
  }, [track, negraDeAfuera]);

  // 26/11/2026 (Alvaro): el cuadro tapaba a la gente. Ahora es una PASTILLA en
  // la barra de arriba: «● Presentando · Dejar de compartir». Nunca encima de
  // los videos, así que ya no hace falta esconderla.
  return (
    <div
      data-testid="mi-pantalla-compartida"
      role="status"
      className={cn(
        "relative flex shrink-0 items-center gap-1.5 rounded-full border bg-card/60 py-0.5 pl-2 pr-0.5",
        negra ? "border-destructive/60" : "border-success/40",
      )}
    >
      {negra
        ? (
          <button
            type="button"
            onClick={() => setAyudaAbierta((v) => !v)}
            title={t("cowork.hubPantalla.negraDetalle")}
            aria-label={t("messenger.callView.miPantalla.comoArreglar")}
            className="flex items-center"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden />
          </button>
        )
        : <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden />}
      {!compacto && (
        <span className={cn("whitespace-nowrap text-[11px] font-medium", negra ? "text-destructive" : "text-foreground")}>
          {negra ? t("messenger.callView.miPantalla.negraCorto") : t("messenger.callView.miPantalla.presentandoCorto")}
        </span>
      )}
      <button
        type="button"
        onClick={onDejar}
        title={t("messenger.callView.miPantalla.dejar")}
        aria-label={t("messenger.callView.miPantalla.dejar")}
        className="flex h-6 items-center gap-1 rounded-full bg-destructive px-2 text-[11px] font-semibold text-destructive-foreground hover:bg-destructive/90"
      >
        <ScreenShareOff className="h-3 w-3" aria-hidden />
        {!compacto && t("messenger.callView.miPantalla.dejarCorto")}
      </button>
      {negra && ayudaAbierta && (
        <p className="vidrio absolute right-0 top-full z-40 mt-1 w-64 rounded-xl p-2.5 text-[11px] leading-snug text-muted-foreground shadow-xl">
          {t("cowork.hubPantalla.negraDetalle")}
        </p>
      )}
    </div>
  );
}
