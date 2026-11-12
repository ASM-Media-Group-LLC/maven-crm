import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, MonitorOff, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoObservador, SalaObservada } from "@/hooks/useObservadorEnVivo";
import type { Tr } from "./piezas";

// EL ESCENARIO EN VIVO: la pantalla de la persona en grande y su cámara en una
// ventanita (tócala y se intercambian). Oscuro adentro (el video luce mejor), el
// marco en vidrio. Pantalla completa con un toque (en el iPhone, la del video).
// Solo adjunta lo que se ve; el audio está apagado hasta que se pide.

/** Lo mínimo de una pista de LiveKit que hace falta para dibujarla. */
export interface PistaAdjuntable {
  attach: (el: HTMLMediaElement) => unknown;
  detach: (el?: HTMLMediaElement) => unknown;
}

function PistaDeVideo({ pista, className, alVideo }: { pista: PistaAdjuntable; className?: string; alVideo?: (v: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  // En una ref: si fuera dependencia, cada render soltaría y volvería a pegar la pista.
  const alVideoRef = useRef(alVideo);
  alVideoRef.current = alVideo;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try { pista.attach(el); } catch { /* pista que se fue */ }
    alVideoRef.current?.(el);
    return () => { try { pista.detach(el); } catch { /* noop */ } };
  }, [pista]);
  return <video ref={ref} autoPlay playsInline muted className={cn("h-full w-full bg-black object-contain", className)} />;
}

function PistaDeAudio({ pista }: { pista: PistaAdjuntable }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try { pista.attach(el); } catch { /* noop */ }
    return () => { try { pista.detach(el); } catch { /* noop */ } };
  }, [pista]);
  return <audio ref={ref} autoPlay />;
}

const AVISO_ESTADO: Partial<Record<EstadoObservador, "vigilancia.vivo.conectando" | "vigilancia.vivo.esperando" | "vigilancia.vivo.reconectando" | "vigilancia.vivo.sinCowork" | "vigilancia.vivo.noDisponible" | "vigilancia.vivo.sinPermiso">> = {
  conectando: "vigilancia.vivo.conectando",
  esperando: "vigilancia.vivo.esperando",
  error: "vigilancia.vivo.reconectando",
  sin_cowork: "vigilancia.vivo.sinCowork",
  no_disponible: "vigilancia.vivo.noDisponible",
  sin_permiso: "vigilancia.vivo.sinPermiso",
};

export function EscenarioEnVivo({ estado, pantalla, camara, audio, sala, escuchar, onEscuchar, onReintentar, t }: {
  estado: EstadoObservador;
  pantalla: PistaAdjuntable | null;
  camara: PistaAdjuntable | null;
  audio: PistaAdjuntable | null;
  sala: SalaObservada | null;
  escuchar: boolean;
  onEscuchar: (v: boolean) => void;
  onReintentar: () => void;
  t: Tr;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const videoPrincipal = useRef<HTMLVideoElement | null>(null);
  const [camaraGrande, setCamaraGrande] = useState(false);
  const [completa, setCompleta] = useState(false);

  useEffect(() => {
    const alCambiar = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  const principal = camaraGrande ? camara ?? pantalla : pantalla ?? camara;
  const ventanita = principal === pantalla ? camara : principal === camara ? pantalla : null;
  const enVivo = estado === "en_vivo";
  const aviso = enVivo ? (principal ? null : "vigilancia.vivo.sinNada") : AVISO_ESTADO[estado] ?? null;

  const pantallaCompleta = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (marco.current?.requestFullscreen) { await marco.current.requestFullscreen(); return; }
    } catch { /* cae al del video */ }
    // iPhone: solo el <video> entra a pantalla completa.
    const v = videoPrincipal.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    v?.webkitEnterFullscreen?.();
  };

  return (
    <div
      ref={marco}
      className={cn(
        "relative w-full overflow-hidden bg-black ring-1 ring-white/10",
        completa ? "h-full rounded-none" : "aspect-video rounded-panel",
      )}
    >
      {principal ? (
        <PistaDeVideo pista={principal} alVideo={(v) => { videoPrincipal.current = v; }} />
      ) : null}

      {aviso && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/85">
          {estado === "conectando" || estado === "error"
            ? <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            : <MonitorOff className="h-6 w-6 text-white/60" />}
          <p className="max-w-xs text-sm leading-snug">{t(aviso)}</p>
          {(estado === "error" || estado === "no_disponible" || estado === "esperando") && (
            <button type="button" onClick={onReintentar}
              className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-semibold text-white/90 hover:bg-white/15">
              <RefreshCw className="h-3.5 w-3.5" />{t("vigilancia.comun.reintentar")}
            </button>
          )}
        </div>
      )}

      {/* La otra pista en una ventanita: tócala y pasa a grande. */}
      {ventanita && (
        <button
          type="button"
          onClick={() => setCamaraGrande((v) => !v)}
          aria-label={t("vigilancia.vivo.intercambiar")}
          className="absolute bottom-2.5 right-2.5 aspect-video w-[34%] max-w-[220px] overflow-hidden rounded-control bg-black shadow-lg ring-1 ring-white/25"
        >
          <PistaDeVideo pista={ventanita} />
        </button>
      )}

      {/* Arriba: «En vivo» y dónde está; a la derecha, oír y pantalla completa. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          {enVivo && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70 motion-reduce:animate-none" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
              </span>
              {t("vigilancia.vivo.enVivo")}
            </span>
          )}
          {sala?.nombre && (
            <span className="max-w-[60vw] truncate text-[11px] text-white/70 sm:max-w-[320px]">
              {sala.sesion ? t("vigilancia.vivo.salaDeSesion", { sala: sala.nombre, sesion: sala.sesion }) : sala.nombre}
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex shrink-0 gap-1.5">
          {enVivo && (
            <button type="button" onClick={() => onEscuchar(!escuchar)}
              aria-pressed={escuchar}
              aria-label={escuchar ? t("vigilancia.vivo.silenciar") : t("vigilancia.vivo.escuchar")}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors",
                escuchar ? "bg-white/90 text-black" : "bg-black/55 text-white/90 hover:bg-black/70",
              )}>
              {escuchar ? <Volume2 className="h-[18px] w-[18px]" /> : <VolumeX className="h-[18px] w-[18px]" />}
            </button>
          )}
          {principal && (
            <button type="button" onClick={() => void pantallaCompleta()}
              aria-label={completa ? t("vigilancia.vivo.salirCompleta") : t("vigilancia.vivo.completa")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm hover:bg-black/70">
              {completa ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
            </button>
          )}
        </div>
      </div>

      {escuchar && audio && <PistaDeAudio pista={audio} />}
    </div>
  );
}
