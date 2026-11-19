import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, MonitorUp, ScreenShareOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { vigilarPantallaNegra } from "@/lib/pantallaNegra";
import { cn } from "@/lib/utils";

// TU PANTALLA, COMO EN MEET (Alvaro, 19/11/2026).
//
// Quien comparte veía solo el texto «estás compartiendo» y no sabía QUÉ les
// llegaba a los demás. Ahora ve su propia pantalla en un cuadrito chico en la
// esquina inferior izquierda (las caras de la ventanita van a la derecha), con
// «Dejar de compartir» y un chevron para esconderlo. Escondido queda una
// pastilla «Compartiendo» que lo vuelve a abrir; la elección se recuerda.
//
// Es chico a propósito: el espejo infinito del 18/11 venía de verse la propia
// pantalla EN GRANDE. El video va mudo y sin espejo: solo la pista de pantalla.
//
// Si la pantalla les llega en negro (lib/pantallaNegra.ts), el aviso va encima
// del cuadrito con la ayuda del permiso de «Grabación de pantalla».

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  useEffect(() => {
    const v = videoRef.current;
    if (!v || oculta) return;
    try {
      v.srcObject = new MediaStream([track]);
      void v.play().catch(() => { /* el navegador lo reintenta solo al volver */ });
    } catch { /* sin MediaStream (pruebas): no se dibuja */ }
    return () => { try { v.srcObject = null; } catch { /* noop */ } };
  }, [track, oculta]);

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
        "vidrio absolute bottom-2 left-2 z-20 overflow-hidden rounded-xl shadow-xl ring-1 ring-white/15",
        compacto ? "w-[30%] min-w-[96px] max-w-[132px]" : "w-[220px] max-w-[34%]",
      )}
    >
      <div className="relative aspect-video bg-black">
        <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-contain" />
        <button
          type="button"
          onClick={alternar}
          title={t("messenger.callView.miPantalla.ocultar")}
          aria-label={t("messenger.callView.miPantalla.ocultar")}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white/85 hover:bg-black/75 hover:text-white"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        {negra && (
          <div role="alert" className="absolute inset-x-0 bottom-0 bg-destructive/85 px-1.5 py-1 text-[10px] font-medium leading-tight text-white">
            <span className="flex items-start gap-1">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
              <span className={compacto ? "line-clamp-2" : undefined}>{t("messenger.callView.miPantalla.negra")}</span>
            </span>
            {!compacto && (
              <button type="button" onClick={() => setAyudaAbierta((v) => !v)} className="mt-0.5 underline underline-offset-2 opacity-90 hover:opacity-100">
                {t("messenger.callView.miPantalla.comoArreglar")}
              </button>
            )}
          </div>
        )}
      </div>
      {negra && ayudaAbierta && !compacto && (
        <p className="px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">{t("cowork.hubPantalla.negraDetalle")}</p>
      )}
      <div className={cn("flex items-center gap-1.5", compacto ? "px-1 py-1" : "px-2 py-1.5")}>
        {!compacto && (
          <span className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-foreground/90">
            <MonitorUp className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{t("messenger.callView.miPantalla.titulo")}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onDejar}
          title={t("messenger.callView.miPantalla.dejar")}
          aria-label={t("messenger.callView.miPantalla.dejar")}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1 rounded-full bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90",
            compacto ? "h-5 w-full text-[10px]" : "h-6 px-2.5 text-[11px]",
          )}
        >
          <ScreenShareOff className="h-3 w-3" aria-hidden />
          {compacto ? null : t("messenger.callView.miPantalla.dejar")}
        </button>
      </div>
    </div>
  );
}
