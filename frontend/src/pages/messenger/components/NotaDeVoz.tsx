import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reproductor de notas de voz.
 *
 * ⚠️ POR QUÉ NO USAMOS EL `<audio controls>` NATIVO. MediaRecorder graba WebM en
 * modo streaming y NO escribe el elemento `Duration` en la cabecera. Verificado
 * sobre un archivo real de producción: es un WebM válido (`1a 45 df a3`), códec
 * `A_OPUS`, muxer Chrome, y el elemento EBML `Duration` (0x4489) no está. Sin
 * duración el control nativo no puede calcular el progreso, así que dibuja la
 * barra al final y se queda ahí.
 *
 * No es un problema de Maven: abriendo el .webm directo en Chrome, su propio
 * visor hace exactamente lo mismo. Y el truco conocido de "buscar al infinito
 * para forzar el cálculo" tampoco sirve acá: probado sobre dos archivos, el
 * elemento ni siquiera llega a `loadedmetadata` (readyState 0, duration NaN).
 *
 * La salida es no depender del metadato: la duración YA la sabemos al grabar
 * (el grabador la cuenta). Va en el nombre del archivo para las notas nuevas y,
 * para las viejas, se lee del texto del mensaje, que siempre tuvo el formato
 * "🎤 Nota de voz (M:SS)".
 */

/** Segundos a partir del nombre (`voice-note-123-18s.webm`) o del texto
 *  (`🎤 Nota de voz (0:18)`). Devuelve 0 si no se puede saber. */
export function duracionDeLaNota(fileName?: string | null, contenido?: string | null): number {
  const porNombre = fileName?.match(/-(\d+)s\.[a-z0-9]+$/i);
  if (porNombre) return Number(porNombre[1]);

  const porTexto = contenido?.match(/\((\d+):([0-5]\d)\)/);
  if (porTexto) return Number(porTexto[1]) * 60 + Number(porTexto[2]);

  return 0;
}

const reloj = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

export default function NotaDeVoz({
  src,
  fileName,
  contenido,
  esMio,
}: {
  src: string;
  fileName?: string | null;
  contenido?: string | null;
  esMio?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);

  // La duración conocida manda. Solo si no la hay se mira la del archivo, que
  // en las notas de voz casi siempre es NaN o Infinity.
  const conocida = duracionDeLaNota(fileName, contenido);
  const [duracionArchivo, setDuracionArchivo] = useState(0);
  const total = conocida || duracionArchivo;

  const alternar = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const avance = () => setTranscurrido(a.currentTime);
    const arranca = () => setSonando(true);
    const para = () => setSonando(false);
    const termina = () => { setSonando(false); setTranscurrido(0); a.currentTime = 0; };
    const meta = () => { if (Number.isFinite(a.duration)) setDuracionArchivo(a.duration); };

    a.addEventListener("timeupdate", avance);
    a.addEventListener("play", arranca);
    a.addEventListener("pause", para);
    a.addEventListener("ended", termina);
    a.addEventListener("loadedmetadata", meta);
    a.addEventListener("durationchange", meta);
    return () => {
      a.removeEventListener("timeupdate", avance);
      a.removeEventListener("play", arranca);
      a.removeEventListener("pause", para);
      a.removeEventListener("ended", termina);
      a.removeEventListener("loadedmetadata", meta);
      a.removeEventListener("durationchange", meta);
    };
  }, []);

  const progreso = total > 0 ? Math.min(100, (transcurrido / total) * 100) : 0;

  /** Buscar es "lo mejor que se pueda": sin duración en el archivo, el navegador
   *  puede negarse. Si no funciona, al menos la barra sigue avanzando sola. */
  const buscar = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || total <= 0) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const proporcion = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    try {
      a.currentTime = proporcion * total;
      setTranscurrido(proporcion * total);
    } catch {
      /* el navegador no deja buscar en este archivo */
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-[210px]">
      <div className={cn(
        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
        esMio ? "bg-primary-foreground/15" : "bg-primary/10",
      )}>
        <Mic className="h-4 w-4" />
      </div>

      <button
        type="button"
        onClick={alternar}
        aria-label={sonando ? "Pausar" : "Reproducir"}
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
          esMio ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "bg-primary/15 hover:bg-primary/25",
        )}
      >
        {sonando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          onClick={buscar}
          role="presentation"
          className={cn(
            "h-1.5 w-full rounded-full cursor-pointer",
            esMio ? "bg-primary-foreground/25" : "bg-primary/15",
          )}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-100", esMio ? "bg-primary-foreground" : "bg-primary")}
            style={{ width: `${progreso}%` }}
          />
        </div>
        <div className={cn("mt-1 text-[10px] tabular-nums", esMio ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {reloj(transcurrido)}{total > 0 && ` / ${reloj(total)}`}
        </div>
      </div>

      {/* Sin `controls`: el nativo es justamente el que no sabe dibujar esto. */}
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}
