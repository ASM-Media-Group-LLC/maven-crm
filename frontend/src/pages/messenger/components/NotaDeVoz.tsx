import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nota de voz, estilo WhatsApp: onda, arrastre y velocidad SIN cambiar el tono.
 *
 * ⚠️ EL RODEO RARO DE ESTE ARCHIVO TIENE MOTIVO. MediaRecorder graba WebM en
 * modo streaming y NO escribe el elemento `Duration`. Verificado sobre archivos
 * reales de producción: WebM válido, códec `A_OPUS`, `Segment` de tamaño
 * desconocido, sin `Duration` (0x4489) y sin `Cues`. Con esos archivos el
 * `<audio>` **nunca pasa de `readyState 0`**: no dispara `loadedmetadata`,
 * `duration` queda en `NaN`, la barra no avanza y no se puede arrastrar. Pasa
 * igual abriendo el .webm directo en Chrome, así que no es cosa de Maven.
 *
 * Pero los bytes están perfectos: `decodeAudioData` los decodifica y da la
 * duración exacta. Entonces:
 *
 *   1. se decodifica una vez (de ahí salen la duración real y la onda),
 *   2. se re-empaqueta a WAV, que SÍ lleva duración en la cabecera,
 *   3. y se reproduce con un `<audio>` normal sobre ese WAV.
 *
 * ⚠️ El paso 3 no es un capricho: la primera versión reproducía por Web Audio y
 * a 1.5x "se escuchaba como una caricatura". `playbackRate` de un
 * AudioBufferSourceNode es un RESAMPLEO — acelera y sube el tono. El elemento
 * `<audio>` tiene `preservesPitch`, que es lo que hace WhatsApp. De ahí el WAV.
 */

/** Segundos desde el nombre (`voice-note-123-18s.webm`) o desde el texto
 *  (`🎤 Nota de voz (0:18)`). Solo para mostrar algo ANTES de decodificar; luego
 *  manda la duración real. */
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

let contexto: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!contexto) contexto = new AC();
    return contexto;
  } catch {
    return null;
  }
}

/** AudioBuffer → WAV PCM 16 bits. Mono y a la frecuencia original: una nota de
 *  voz de un minuto son unos 5 MB, y solo de las que se escuchan. */
function aWav(buf: AudioBuffer): Blob {
  const canales = Math.min(buf.numberOfChannels, 2);
  const muestras = buf.length;
  const bytes = 44 + muestras * canales * 2;
  const vista = new DataView(new ArrayBuffer(bytes));
  const texto = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) vista.setUint8(pos + i, s.charCodeAt(i)); };

  texto(0, "RIFF");
  vista.setUint32(4, bytes - 8, true);
  texto(8, "WAVEfmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);                       // PCM
  vista.setUint16(22, canales, true);
  vista.setUint32(24, buf.sampleRate, true);
  vista.setUint32(28, buf.sampleRate * canales * 2, true);
  vista.setUint16(32, canales * 2, true);
  vista.setUint16(34, 16, true);
  texto(36, "data");
  vista.setUint32(40, muestras * canales * 2, true);

  const pistas = Array.from({ length: canales }, (_, c) => buf.getChannelData(c));
  let pos = 44;
  for (let i = 0; i < muestras; i++) {
    for (let c = 0; c < canales; c++) {
      const v = Math.max(-1, Math.min(1, pistas[c][i]));
      vista.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([vista.buffer], { type: "audio/wav" });
}

/** Picos para la onda, de las muestras reales. */
function picos(buf: AudioBuffer, n: number): number[] {
  const datos = buf.getChannelData(0);
  const porBarra = Math.floor(datos.length / n) || 1;
  const salida: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < n; i++) {
    let pico = 0;
    const desde = i * porBarra;
    // De a saltos: recorrer un minuto muestra por muestra congelaría la pintura
    // y no cambia el dibujo.
    for (let j = desde; j < desde + porBarra; j += 32) {
      const v = Math.abs(datos[j] || 0);
      if (v > pico) pico = v;
    }
    salida.push(pico);
    if (pico > max) max = pico;
  }
  return salida.map((p) => Math.max(0.12, p / max));
}

type Preparada = { url: string; duracion: number; onda: number[] };
const listas = new Map<string, Preparada>();
const enVuelo = new Map<string, Promise<Preparada>>();

async function preparar(src: string): Promise<Preparada> {
  const ya = listas.get(src);
  if (ya) return ya;
  const pendiente = enVuelo.get(src);
  if (pendiente) return pendiente;

  const tarea = (async () => {
    const ac = ctx();
    if (!ac) throw new Error("sin audio");
    const datos = await (await fetch(src)).arrayBuffer();
    const buf = await ac.decodeAudioData(datos);
    const lista: Preparada = { url: URL.createObjectURL(aWav(buf)), duracion: buf.duration, onda: picos(buf, BARRAS) };
    listas.set(src, lista);
    enVuelo.delete(src);
    return lista;
  })();
  enVuelo.set(src, tarea);
  return tarea;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);
  const [duracion, setDuracion] = useState(() => duracionDeLaNota(fileName, contenido));
  const [onda, setOnda] = useState<number[] | null>(null);
  const [velocidad, setVelocidad] = useState<number>(1);

  const aplicarVelocidad = useCallback((a: HTMLAudioElement, v: number) => {
    a.playbackRate = v;
    // Sin esto, acelerar sube el tono y suena a caricatura.
    const conTono = a as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    conTono.preservesPitch = true;
    conTono.webkitPreservesPitch = true;
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const avance = () => setTranscurrido(a.currentTime);
    const arranca = () => setSonando(true);
    const para = () => setSonando(false);
    const termina = () => { setSonando(false); setTranscurrido(0); a.currentTime = 0; };
    a.addEventListener("timeupdate", avance);
    a.addEventListener("play", arranca);
    a.addEventListener("pause", para);
    a.addEventListener("ended", termina);
    return () => {
      a.removeEventListener("timeupdate", avance);
      a.removeEventListener("play", arranca);
      a.removeEventListener("pause", para);
      a.removeEventListener("ended", termina);
    };
  }, [onda]);

  useEffect(() => () => { if (pararLaQueSuena) pararLaQueSuena = null; }, []);

  const alternar = useCallback(async () => {
    const a = audioRef.current;
    if (a && !a.paused) { a.pause(); return; }

    let lista = listas.get(src);
    if (!lista) {
      setCargando(true);
      try { lista = await preparar(src); }
      catch { setCargando(false); return; }
      setCargando(false);
      setDuracion(lista.duracion);   // la real manda sobre la del nombre
      setOnda(lista.onda);
    }

    const el = audioRef.current;
    if (!el) return;
    if (el.src !== lista.url) el.src = lista.url;
    aplicarVelocidad(el, velocidad);
    if (pararLaQueSuena) pararLaQueSuena();
    pararLaQueSuena = () => { el.pause(); };
    void el.play().catch(() => {});
  }, [src, velocidad, aplicarVelocidad]);

  const cambiarVelocidad = useCallback(() => {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad as 1) + 1) % VELOCIDADES.length];
    setVelocidad(siguiente);
    const a = audioRef.current;
    if (a) aplicarVelocidad(a, siguiente);
  }, [velocidad, aplicarVelocidad]);

  const buscar = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (duracion <= 0) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const proporcion = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
    const destino = proporcion * duracion;
    setTranscurrido(destino);
    const a = audioRef.current;
    if (a && listas.get(src)) a.currentTime = destino;
  }, [duracion, src]);

  const progreso = duracion > 0 ? Math.min(1, transcurrido / duracion) : 0;
  const alturas = onda ?? Array.from({ length: BARRAS }, (_, i) => 0.35 + 0.2 * Math.sin(i * 1.7));

  return (
    // ⚠️ `w-[260px] max-w-full`, NUNCA `min-w-[...]`: min-w impide encoger, y en
    // la ventanita flotante la burbuja es más angosta que eso, así que la onda
    // se salía por el borde. Con ancho PREFERIDO + tope al contenedor, en el
    // chat grande mide 260 y en la flotante cede lo que haga falta.
    <div className="flex items-center gap-2 w-[260px] max-w-full min-w-0">
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
          className="flex h-7 min-w-0 items-center gap-px cursor-pointer"
          title="Clic para moverte por el audio"
        >
          {alturas.map((h, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-full transition-colors",
                i / BARRAS < progreso
                  ? (esMio ? "bg-primary-foreground" : "bg-primary")
                  : (esMio ? "bg-primary-foreground/30" : "bg-primary/25"),
              )}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
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
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-opacity",
          velocidad === 1 && !sonando ? "opacity-40" : "opacity-100",
          esMio ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary",
        )}
      >
        {velocidad}×
      </button>

      <audio ref={audioRef} preload="none" className="hidden" />
    </div>
  );
}
