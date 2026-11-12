import { useEffect, useMemo, useState } from "react";
import { Film, Images, Loader2, Pause, Play, RefreshCw, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { camaraDelMomento, type ClipDeVentana, type FotoDeVentana, type VideoDeVentana } from "@/hooks/useVideoDeEsosMinutos";
import { horaCorta, type Tr } from "./piezas";

// EL VIDEO DE ESOS MINUTOS: si Argos grabó, el video; si no, los pantallazos de
// esa ventana como una película (uno tras otro, con lo que dijo Argos de cada
// uno y la cámara de ese momento en una ventanita). Se dibuja solo con props:
// los datos los trae useVideoDeEsosMinutos.

const PASO_MS = 1400;

function Veredicto({ f, t }: { f: FotoDeVentana; t: Tr }) {
  if (f.fueraDeLugar === true && !f.perdonado) {
    return <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">{t("vigilancia.video.fueraDeLugar")}</span>;
  }
  if (f.veredicto) {
    return <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">{t("vigilancia.video.enLoSuyo")}</span>;
  }
  return <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("vigilancia.video.sinJuzgar")}</span>;
}

function Clips({ clips, t, lang }: { clips: ClipDeVentana[]; t: Tr; lang: string }) {
  const [i, setI] = useState(0);
  const clip = clips[Math.min(i, clips.length - 1)];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-panel bg-black ring-1 ring-white/10">
        {clip?.url ? (
          <video key={clip.id} src={clip.url} controls playsInline autoPlay muted className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/75">{t("vigilancia.video.clipEnArchivo")}</div>
        )}
      </div>
      {clips.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {clips.map((c, k) => (
            <button key={c.id} type="button" onClick={() => setI(k)} aria-pressed={k === i}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors",
                k === i ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-foreground/[0.03] text-muted-foreground hover:text-foreground",
              )}>
              <Film className="h-3.5 w-3.5" />
              {horaCorta(c.desde, lang)}
              {c.duracionSeg ? <span className="font-normal opacity-80">· {Math.max(1, Math.round(c.duracionSeg / 60))} min</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Pelicula({ pantallas, camaras, t, lang }: { pantallas: FotoDeVentana[]; camaras: FotoDeVentana[]; t: Tr; lang: string }) {
  // Sin pantallazos, la película es de la cámara.
  const cuadros = pantallas.length ? pantallas : camaras;
  const [i, setI] = useState(0);
  const [corriendo, setCorriendo] = useState(false);
  const total = cuadros.length;
  const k = Math.min(i, total - 1);
  const cuadro = cuadros[k];
  const cam = pantallas.length ? camaraDelMomento(camaras, cuadro.at) : null;

  useEffect(() => {
    if (!corriendo) return;
    const iv = window.setInterval(() => {
      setI((n) => {
        if (n >= total - 1) { setCorriendo(false); return n; }
        return n + 1;
      });
    }, PASO_MS);
    return () => window.clearInterval(iv);
  }, [corriendo, total]);

  const play = () => {
    if (k >= total - 1) setI(0);
    setCorriendo((c) => !c);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-panel bg-black ring-1 ring-white/10">
        {cuadro.url ? (
          <img src={cuadro.url} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/75">{t("vigilancia.video.fotoEnArchivo")}</div>
        )}
        {cam?.url && (
          <img src={cam.url} alt="" className="absolute bottom-2.5 right-2.5 aspect-video w-[30%] max-w-[200px] rounded-control bg-black object-cover shadow-lg ring-1 ring-white/25" />
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white/90 tabular-nums backdrop-blur-sm">
          {horaCorta(cuadro.at, lang)} · {k + 1}/{total}
        </span>
      </div>

      {/* Lo que dijo Argos de ESTE cuadro. */}
      <div className="flex min-h-[44px] items-start gap-2">
        <Veredicto f={cuadro} t={t} />
        <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground line-clamp-2">
          {cuadro.veredicto || (cuadro.tipo === "camara" && cuadro.caraVisible === false ? t("vigilancia.video.sinCara") : t("vigilancia.video.sinPalabras"))}
        </p>
      </div>

      {/* Controles grandes, para el dedo. */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setCorriendo(false); setI((n) => Math.max(0, n - 1)); }} disabled={k === 0}
          aria-label={t("vigilancia.video.anterior")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-foreground/[0.03] disabled:opacity-40">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" onClick={play}
          aria-label={corriendo ? t("vigilancia.video.pausar") : t("vigilancia.video.reproducir")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {corriendo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => { setCorriendo(false); setI((n) => Math.min(total - 1, n + 1)); }} disabled={k >= total - 1}
          aria-label={t("vigilancia.video.siguiente")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-foreground/[0.03] disabled:opacity-40">
          <SkipForward className="h-4 w-4" />
        </button>
        <input type="range" min={0} max={Math.max(0, total - 1)} value={k}
          onChange={(e) => { setCorriendo(false); setI(Number(e.target.value)); }}
          aria-label={t("vigilancia.video.linea")}
          className="h-11 min-w-0 flex-1 accent-[hsl(var(--primary))]" />
      </div>
    </div>
  );
}

export function VideoDeEsosMinutosVista({ video, cargando, error, onReintentar, t, lang }: {
  video: VideoDeVentana | null;
  cargando: boolean;
  error: Error | null;
  onReintentar: () => void;
  t: Tr;
  lang: string;
}) {
  const hayClips = (video?.clips.length ?? 0) > 0;
  const hayFotos = (video?.pantallas.length ?? 0) + (video?.camaras.length ?? 0) > 0;
  const titulo = useMemo(() => (hayClips ? t("vigilancia.video.tituloClip") : t("vigilancia.video.tituloFotos")), [hayClips, t]);

  if (cargando) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-panel bg-black/85 ring-1 ring-white/10">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-panel bg-black/85 px-6 text-center text-sm text-white/85 ring-1 ring-white/10">
        {t("vigilancia.video.fallo")}
        <button type="button" onClick={onReintentar}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-semibold hover:bg-white/15">
          <RefreshCw className="h-3.5 w-3.5" />{t("vigilancia.comun.reintentar")}
        </button>
      </div>
    );
  }
  if (!video || (!hayClips && !hayFotos)) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-panel bg-black/85 px-6 text-center text-sm text-white/75 ring-1 ring-white/10">
        <Images className="h-6 w-6 text-white/50" />
        {t("vigilancia.video.nada")}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {hayClips ? <Film className="h-3.5 w-3.5" /> : <Images className="h-3.5 w-3.5" />}
        {titulo}
      </p>
      {hayClips
        ? <Clips clips={video.clips} t={t} lang={lang} />
        : <Pelicula pantallas={video.pantallas} camaras={video.camaras} t={t} lang={lang} />}
    </div>
  );
}
