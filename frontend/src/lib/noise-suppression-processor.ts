import { LocalTrack, Track } from "livekit-client";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

// Cancelación de ruido de las llamadas (Meet, Cowork y videollamadas).
//
// NIVEL 2 (02/09/2026): un DENOISER de verdad, RNNoise compilado a WASM, delante
// de la puerta de ruido que ya había. La puerta sola silenciaba las pausas,
// pero mientras hablabas el ruido pasaba entero: teclado, ventilador, la gente
// al lado. RNNoise separa voz de ruido cuadro a cuadro —lo que hace Meet— y la
// puerta queda de remate para el poquito residual y para los silencios.
//
//   Micro → RNNoise (WASM, 48 kHz) → puerta adaptativa → pista procesada → LiveKit
//
// ⚠️ El plugin Krisp de LiveKit NO sirve acá: es solo para LiveKit Cloud y
// nosotros somos self-hosted. Por eso RNNoise.
//
// CON RED, siempre: si el WASM no baja, no compila o el navegador no lo aguanta,
// se arma la cadena de antes (solo la puerta) y se deja constancia en consola.
// NUNCA se queda sin audio: el peor caso es el comportamiento de ayer.
//
// El toggle de la interfaz y la preferencia guardada no cambian: es el mismo
// botón, con mejor motor detrás.

/** Qué hay detrás del botón de cancelación de ruido en esta pestaña. */
export type MotorNC = "rnnoise+puerta" | "puerta";

/** El último motor que se armó. Para el aviso al usuario y para depurar. */
let motorVigente: MotorNC | null = null;
export function motorNCVigente(): MotorNC | null {
  return motorVigente;
}

// La librería se importa PEREZOSA, dentro de la cadena, por dos motivos: su
// módulo define clases que extienden AudioWorkletNode al cargarse (en Node/
// vitest eso revienta al importar cualquier cosa que toque este archivo), y
// así el código del denoiser solo se baja cuando alguien activa el botón.
type LibNC = typeof import("@sapphi-red/web-noise-suppressor");
let libNC: Promise<LibNC> | null = null;
function cargarLibNC(): Promise<LibNC> {
  libNC ??= import("@sapphi-red/web-noise-suppressor");
  return libNC;
}

// El WASM se baja UNA vez por pestaña (~150 KB) y se comparte entre todas las
// cadenas: cada cambio de micro y cada re-aplicación arman una cadena nueva y
// no tiene sentido volver a bajarlo. Si la bajada falla, se olvida la promesa
// para que el próximo intento vuelva a probar.
let wasmRnnoise: Promise<ArrayBuffer> | null = null;
const ESPERA_WASM_MS = 6_000;

function conTiempo<T>(p: Promise<T>, ms: number, motivo: string): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const t = window.setTimeout(() => rechazar(new Error(motivo)), ms);
    p.then((v) => { window.clearTimeout(t); resolver(v); }, (e) => { window.clearTimeout(t); rechazar(e); });
  });
}

async function cargarWasmRnnoise(): Promise<ArrayBuffer> {
  if (!wasmRnnoise) {
    wasmRnnoise = conTiempo(
      cargarLibNC().then((lib) => lib.loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })),
      ESPERA_WASM_MS,
      "el WASM de RNNoise tardó demasiado en bajar",
    );
  }
  try {
    return await wasmRnnoise;
  } catch (e) {
    wasmRnnoise = null;
    throw e;
  }
}

export interface CadenaNC {
  /** La pista limpia, lista para publicar (o para clonar por sala). */
  salida: MediaStreamTrack;
  motor: MotorNC;
  destruir(): Promise<void>;
}

/**
 * Arma la cadena de cancelación de ruido sobre una pista de micrófono cruda.
 *
 * La usan el procesador de LiveKit (abajo) y el micro que el supervisor de
 * Cowork reparte a las salas, que no pasa por LiveKit hasta que cada sala lo
 * clona. Una sola cadena para las dos, para que "cancelación de ruido" sea lo
 * mismo en todos lados.
 */
export async function armarCadenaNC(entrada: MediaStreamTrack): Promise<CadenaNC> {
  // 48 kHz no es una preferencia: RNNoise está entrenado a esa tasa y trabaja
  // en cuadros de 10 ms (480 muestras). El worklet del paquete hace el buffer
  // intermedio desde los 128 del AudioWorklet.
  const ctx = new AudioContext({ sampleRate: 48000 });
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* sin gesto del usuario; el track igual fluye */ }
  }

  const fuente = ctx.createMediaStreamSource(new MediaStream([entrada]));
  const destino = ctx.createMediaStreamDestination();
  const nodos: AudioNode[] = [];
  let rnnoise: InstanceType<LibNC["RnnoiseWorkletNode"]> | null = null;
  let motor: MotorNC = "puerta";

  // La puerta de siempre, ahora de remate. Su regla está testeada en
  // lib/pisoDeRuido.ts con un port fiel en el worklet.
  await ctx.audioWorklet.addModule("/worklets/noise-suppression-worklet.js");
  const puerta = new AudioWorkletNode(ctx, "noise-suppression-processor");

  try {
    const [wasm, lib] = await Promise.all([
      cargarWasmRnnoise(),
      cargarLibNC(),
      ctx.audioWorklet.addModule(rnnoiseWorkletUrl),
    ]);
    // Mono a propósito: el micro se captura en un canal, y RNNoise cuesta CPU
    // por canal. Con dos canales se procesaría el doble para nada.
    rnnoise = new lib.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasm });
    fuente.connect(rnnoise);
    rnnoise.connect(puerta);
    nodos.push(rnnoise);
    motor = "rnnoise+puerta";
  } catch (e) {
    // Sin denoiser, pero con audio: la cadena de ayer.
    console.warn("[NC] RNNoise no disponible, sigue solo la puerta de ruido:", (e as Error)?.message ?? e);
    fuente.connect(puerta);
  }
  puerta.connect(destino);
  nodos.push(fuente, puerta);
  motorVigente = motor;
  console.info(`[NC] cancelación de ruido armada: ${motor}`);

  const salida = destino.stream.getAudioTracks()[0];
  return {
    salida,
    motor,
    async destruir() {
      for (const n of nodos) { try { n.disconnect(); } catch { /* noop */ } }
      try { rnnoise?.destroy(); } catch { /* noop */ }
      try { salida.stop(); } catch { /* noop */ }
      if (ctx.state !== "closed") { try { await ctx.close(); } catch { /* noop */ } }
    },
  };
}

/**
 * LiveKit TrackProcessor: envuelve la cadena para el micro de la llamada.
 *
 * Architecture: Mic → RNNoise → puerta → Processed Track → LiveKit
 */
export class NoiseSuppresionTrackProcessor {
  name = "noise-suppression";
  processedTrack?: MediaStreamTrack;
  /** Con qué motor quedó armado este procesador. */
  motor: MotorNC | null = null;

  private cadena?: CadenaNC;

  async init({ track }: { track: LocalTrack<Track.Kind>; element?: HTMLMediaElement }) {
    this.cadena = await armarCadenaNC(track.mediaStreamTrack);
    this.processedTrack = this.cadena.salida;
    this.motor = this.cadena.motor;
  }

  async restart({ track, element }: { track: LocalTrack<Track.Kind>; element?: HTMLMediaElement }) {
    await this.destroy();
    await this.init({ track, element });
  }

  async destroy() {
    const c = this.cadena;
    this.cadena = undefined;
    this.processedTrack = undefined;
    this.motor = null;
    if (c) await c.destruir();
  }
}

/** Check if AudioWorklet noise suppression is supported in this browser */
export function supportsNoiseSuppression(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

const NC_STORAGE_KEY = "call-noise-cancellation-enabled";

export function loadNCPreference(): boolean {
  try {
    const val = localStorage.getItem(NC_STORAGE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export function saveNCPreference(enabled: boolean) {
  try {
    localStorage.setItem(NC_STORAGE_KEY, String(enabled));
  } catch {}
}
