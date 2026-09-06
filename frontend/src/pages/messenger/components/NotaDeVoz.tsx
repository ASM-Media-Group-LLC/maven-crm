import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nota de voz, estilo WhatsApp: onda, arrastre y velocidad.
 *
 * ⚠️ POR QUÉ NO USA UN `<audio>`. MediaRecorder graba WebM en modo streaming y
 * NO escribe el elemento `Duration` en la cabecera. Verificado sobre archivos
 * reales de producción: WebM válido (`1a 45 df a3`), códec `A_OPUS`, muxer
 * Chrome, `Segment` de tamaño desconocido, sin `Duration` (0x4489) y sin `Cues`.
 * El elemento `<audio>` con esos archivos **nunca pasa de `readyState 0`**: no
 * dispara `loadedmetadata`, `duration` queda en `NaN`, la barra no avanza y no
 * se puede arrastrar. Pasa igual abriendo el .webm directo en Chrome, así que
 * no es cosa de Maven. El truco de "buscar al infinito" tampoco lo destraba.
 *
 * Pero los bytes están perfectos: `decodeAudioData` los decodifica sin
 * problema y devuelve la duración exacta (21,6 s en el archivo de prueba).
 * O sea que el problema es el ELEMENTO, no el audio.
 *
 * Por eso esto va por Web Audio: se decodifica una vez al primer play y a
 * partir de ahí tenemos duración exacta, reloj propio, arrastre real, velocidad
 * y la onda dibujada con las muestras de verdad.
 */

/** Segundos desde el nombre (`voice-note-123-18s.webm`) o desde el texto
 *  (`🎤 Nota de voz (0:18)`). Solo se usa para mostrar algo ANTES de decodificar;
 *  una vez decodificado manda la duración real. */
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

const BARRAS = 38;
const VELOCIDADES = [1, 1.5, 2] as const;

/** Un AudioContext para toda la app: el navegador limita cuántos se pueden abrir. */
let contexto: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!contexto) contexto = new AC();
    if (contexto.state === "suspended") void contexto.resume().catch(() => {});
    return contexto;
  } catch {
    return null;
  }
}

/** Cachés de módulo: una nota que ya se escuchó no se vuelve a bajar ni a
 *  decodificar, y dos burbujas del mismo audio comparten trabajo. */
const buffers = new Map<string, AudioBuffer>();
const enVuelo = new Map<string, Promise<AudioBuffer>>();

async function cargar(url: string): Promise<AudioBuffer> {
  const ya = buffers.get(url);
  if (ya) return ya;
  const pendiente = enVuelo.get(url);
  if (pendiente) return pendiente;

  const tarea = (async () => {
    const ac = ctx();
    if (!ac) throw new Error("sin audio");
    const datos = await (await fetch(url)).arrayBuffer();
    const buf = await ac.decodeAudioData(datos);
    buffers.set(url, buf);
    enVuelo.delete(url);
    return buf;
  })();
  enVuelo.set(url, tarea);
  return tarea;
}

/** Picos para dibujar la onda, sacados de las muestras reales. */
function picos(buf: AudioBuffer, n: number): number[] {
  const datos = buf.getChannelData(0);
  const porBarra = Math.floor(datos.length / n) || 1;
  const salida: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < n; i++) {
    let pico = 0;
    const desde = i * porBarra;
    // Se muestrea de a saltos: recorrer un minuto entero muestra por muestra
    // congelaría la pintura y no cambia el dibujo.
    for (let j = desde; j < desde + porBarra; j += 32) {
      const v = Math.abs(datos[j] || 0);
      if (v > pico) pico = v;
    }
    salida.push(pico);
    if (pico > max) max = pico;
  }
  return salida.map((p) => Math.max(0.12, p / max));
}

/** Solo una nota suena a la vez, como en WhatsApp. */
let pararLaQueSuena: (() => void) | null = null;

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
  const [sonando, setSonando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);
  const [duracion, setDuracion] = useState(() => duracionDeLaNota(fileName, contenido));
  const [onda, setOnda] = useState<number[] | null>(null);
  const [velocidad, setVelocidad] = useState<number>(1);

  const fuenteRef = useRef<AudioBufferSourceNode | null>(null);
  const arranqueRef = useRef(0);   // ctx.currentTime cuando arrancó
  const desdeRef = useRef(0);      // offset dentro del audio
  const rafRef = useRef<number | null>(null);
  const velocidadRef = useRef(1);
  velocidadRef.current = velocidad;

  const parar = useCallback((reiniciar: boolean) => {
    const f = fuenteRef.current;
    if (f) {
      f.onended = null;
      try { f.stop(); } catch { /* ya paró */ }
      fuenteRef.current = null;
    }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (pararLaQueSuena) pararLaQueSuena = null;
    setSonando(false);
    if (reiniciar) { desdeRef.current = 0; setTranscurrido(0); }
  }, []);

  useEffect(() => () => parar(true), [parar]);

  const tocar = useCallback((buf: AudioBuffer, desde: number) => {
    const ac = ctx();
    if (!ac) return;
    if (pararLaQueSuena) pararLaQueSuena();

    const fuente = ac.createBufferSource();
    fuente.buffer = buf;
    fuente.playbackRate.value = velocidadRef.current;
    fuente.connect(ac.destination);
    fuente.start(0, Math.min(desde, buf.duration));
    fuenteRef.current = fuente;
    arranqueRef.current = ac.currentTime;
    desdeRef.current = desde;
    setSonando(true);
    pararLaQueSuena = () => parar(false);

    fuente.onended = () => {
      // `stop()` también dispara onended; solo interesa el final natural.
      if (fuenteRef.current === fuente) parar(true);
    };

    const tic = () => {
      const ac2 = ctx();
      if (!ac2 || fuenteRef.current !== fuente) return;
      const t = desdeRef.current + (ac2.currentTime - arranqueRef.current) * velocidadRef.current;
      setTranscurrido(Math.min(t, buf.duration));
      rafRef.current = requestAnimationFrame(tic);
    };
    rafRef.current = requestAnimationFrame(tic);
  }, [parar]);

  const alternar = useCallback(async () => {
    if (sonando) {
      // Pausa: se guarda dónde íbamos para reanudar ahí.
      const ac = ctx();
      if (ac && fuenteRef.current) {
        desdeRef.current += (ac.currentTime - arranqueRef.current) * velocidadRef.current;
      }
      parar(false);
      return;
    }
    const yaEsta = buffers.get(src);
    if (yaEsta) { tocar(yaEsta, desdeRef.current); return; }
    setCargando(true);
    try {
      const buf = await cargar(src);
      setDuracion(buf.duration);          // la real manda sobre la del nombre
      setOnda(picos(buf, BARRAS));
      tocar(buf, desdeRef.current);
    } catch {
      /* si no se puede, el botón simplemente no arranca */
    } finally {
      setCargando(false);
    }
  }, [sonando, src, parar, tocar]);

  const cambiarVelocidad = useCallback(() => {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad as 1) + 1) % VELOCIDADES.length];
    setVelocidad(siguiente);
    const f = fuenteRef.current;
    const ac = ctx();
    if (f && ac) {
      // Se fija el punto actual antes de cambiar el ritmo, si no el cálculo del
      // reloj arrastraría el tiempo ya reproducido a la velocidad nueva.
      desdeRef.current += (ac.currentTime - arranqueRef.current) * velocidadRef.current;
      arranqueRef.current = ac.currentTime;
      f.playbackRate.value = siguiente;
    }
  }, [velocidad]);

  const buscar = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (duracion <= 0) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const proporcion = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    const destino = proporcion * duracion;
    setTranscurrido(destino);
    const buf = buffers.get(src);
    if (!buf) { desdeRef.current = destino; return; }
    if (sonando) { parar(false); tocar(buf, destino); }
    else desdeRef.current = destino;
  }, [duracion, src, sonando, parar, tocar]);

  const progreso = duracion > 0 ? Math.min(1, transcurrido / duracion) : 0;
  const alturas = onda ?? Array.from({ length: BARRAS }, (_, i) => 0.3 + 0.25 * Math.sin(i));

  return (
    <div className="flex items-center gap-2.5 min-w-[230px] max-w-[300px]">
      <button
        type="button"
        onClick={() => void alternar()}
        aria-label={sonando ? "Pausar" : "Reproducir"}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95",
          esMio ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "bg-primary text-primary-foreground hover:opacity-90",
        )}
      >
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" />
          : sonando ? <Pause className="h-4 w-4" />
          : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          onClick={buscar}
          role="presentation"
          className="flex h-7 items-center gap-[2px] cursor-pointer"
          title="Clic para moverte por el audio"
        >
          {alturas.map((h, i) => {
            const pasado = i / BARRAS < progreso;
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors",
                  pasado
                    ? (esMio ? "bg-primary-foreground" : "bg-primary")
                    : (esMio ? "bg-primary-foreground/30" : "bg-primary/25"),
                )}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>
        <div className={cn("text-[10px] tabular-nums", esMio ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {reloj(sonando || transcurrido > 0 ? transcurrido : duracion)}
        </div>
      </div>

      <button
        type="button"
        onClick={cambiarVelocidad}
        aria-label={`Velocidad ${velocidad}x`}
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
          velocidad === 1 ? "opacity-0 pointer-events-none" : "",
          esMio ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary",
          // El 1x se muestra igual al pasar el ratón, para poder volver.
          "group-hover/nota:opacity-100",
        )}
      >
        {velocidad}×
      </button>
    </div>
  );
}
