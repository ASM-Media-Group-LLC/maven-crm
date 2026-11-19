// EL AUDIO DE LA LLAMADA, MINUTO A MINUTO (Alvaro, 18/11/2026).
//
// La muestra de cada minuto (lib/saludDeLlamada.ts) medía la conexión, la
// cámara y la pantalla, pero nada del sonido: «no se le escucha» o «le llega
// cortado» no quedaba en ningún lado. Desde aquí cada muestra trae `audio`:
//
//   abierto      el micrófono está prendido en la llamada
//   mudo         prendido, pero en todo el minuto no mandó sonido (energía 0)
//                o el sistema lo silenció: no la escuchan
//   perdida_pct  de SU voz, qué parte se pierde camino a los demás
//                (remote-inbound-rtp del micrófono, fractionLost)
//   oculto_pct   de lo que OYE, qué parte el navegador tuvo que rellenar porque
//                no llegó a tiempo (inbound-rtp de audio: concealedSamples sin
//                los silencios / totalSamplesReceived, en el minuto)
//
// El servidor usa la MISMA regla que audioMalo() (llamada_audio_malo en
// supabase/migrations/20261119010000_calidad_de_llamadas.sql) para el tablero
// del dueño y para avisar a la persona y a su supervisor. Medir jamás rompe la
// llamada: todo lo que falle queda en null.

type Fila = Record<string, unknown> & { type?: string; kind?: string; mediaType?: string };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const esAudio = (f: Fila) => f.kind === "audio" || f.mediaType === "audio";

/** Del reporte del micrófono propio: la energía acumulada del sonido que entra
 *  y cuánta voz se pierde camino a los demás. */
export function leerMicrofono(filas: Iterable<Fila>): { energia: number | null; perdida_pct: number | null } {
  let energia: number | null = null;
  let perdida: number | null = null;
  for (const f of filas) {
    if (f.type === "media-source" && esAudio(f)) {
      const e = num(f.totalAudioEnergy);
      if (e !== null) energia = (energia ?? 0) + e;
    } else if (f.type === "remote-inbound-rtp" && esAudio(f)) {
      const fl = num(f.fractionLost);
      if (fl !== null) perdida = Math.max(perdida ?? 0, Math.round(fl * 1000) / 10);
    }
  }
  return { energia, perdida_pct: perdida };
}

/** De una pista de audio que se recibe: muestras rellenadas (sin contar los
 *  silencios, que no son problema) y muestras recibidas, acumuladas. */
export function leerAudioRecibido(filas: Iterable<Fila>): { ocultas: number; recibidas: number } | null {
  for (const f of filas) {
    if (f.type !== "inbound-rtp" || !esAudio(f)) continue;
    const recibidas = num(f.totalSamplesReceived);
    if (recibidas === null) continue;
    const ocultas = Math.max(0, (num(f.concealedSamples) ?? 0) - (num(f.silentConcealedSamples) ?? 0));
    return { ocultas, recibidas };
  }
  return null;
}

export interface AudioDeLaMuestra {
  abierto: boolean;
  mudo: boolean;
  perdida_pct: number | null;
  oculto_pct: number | null;
}

/** Lo acumulado en la muestra anterior, para sacar lo de ESTE minuto. */
export interface ContadoresDeAudio {
  abierto: boolean;
  energia: number | null;
  recibido: Record<string, { ocultas: number; recibidas: number }>;
}

/** Menos de 1 s de audio recibido a 48 kHz no alcanza para decir nada. */
const MIN_MUESTRAS = 48_000;

export function armarAudio(p: {
  abierto: boolean;
  /** El sistema silenció el micrófono crudo (otro programa lo tomó, se desconectó). */
  crudoMudo: boolean;
  mic: { energia: number | null; perdida_pct: number | null } | null;
  recibido: Record<string, { ocultas: number; recibidas: number }>;
  antes: ContadoresDeAudio | null;
}): { audio: AudioDeLaMuestra; contadores: ContadoresDeAudio } {
  const energia = p.mic?.energia ?? null;
  // Sin sonido todo el minuto: solo si estuvo prendido el minuto entero (el
  // anterior también) y la energía no subió nada.
  const sinSonido = !!p.antes?.abierto && p.antes.energia !== null && energia !== null && energia - p.antes.energia <= 0;
  let ocultas = 0;
  let recibidas = 0;
  for (const [id, ahora] of Object.entries(p.recibido)) {
    const previo = p.antes?.recibido[id];
    // Pista nueva o reiniciada: lo de antes no cuenta.
    if (!previo || ahora.recibidas < previo.recibidas) continue;
    ocultas += Math.max(0, ahora.ocultas - previo.ocultas);
    recibidas += ahora.recibidas - previo.recibidas;
  }
  return {
    audio: {
      abierto: p.abierto,
      mudo: p.abierto && (p.crudoMudo || sinSonido),
      perdida_pct: p.abierto ? p.mic?.perdida_pct ?? null : null,
      oculto_pct: recibidas >= MIN_MUESTRAS ? Math.round((1000 * ocultas) / recibidas) / 10 : null,
    },
    contadores: { abierto: p.abierto, energia, recibido: p.recibido },
  };
}

/** Pérdida de su voz desde la que se nota (%). */
export const PERDIDA_VOZ_MALA = 5;
/** Audio que le llega rellenado desde el que se escucha cortado (%). */
export const OCULTO_MALO = 8;

/** La misma regla que llamada_audio_malo en el servidor. */
export function audioMalo(a: AudioDeLaMuestra): boolean {
  return (a.abierto && (a.mudo || (a.perdida_pct ?? 0) >= PERDIDA_VOZ_MALA)) || (a.oculto_pct ?? 0) >= OCULTO_MALO;
}
