import dfWasmUrl from "@lofcz/deepfilternet-web/df_bg.wasm?url";
import dfWorkletCrudo from "@lofcz/deepfilternet-web/worklet?raw";

// CANCELACIÓN DE RUIDO FUERTE: DeepFilterNet3 (Alvaro, 16/11/2026: «sí, más fuerte»).
//
// RNNoise quita ventilador, teclado y zumbido, pero con ruido fuerte (gente
// hablando al lado, música, calle) se queda corto. DeepFilterNet3 es un modelo
// bastante más capaz, cercano a lo de Meet, y corre en el navegador como WASM
// dentro de un AudioWorklet. A cambio pesa (~12 MB comprimido, se baja una vez
// y queda en caché) y gasta más procesador.
//
// Por eso NUNCA es la primera: la llamada arranca con RNNoise y DeepFilterNet
// toma el relevo cuando terminó de cargar Y pasó la prueba de carga (ver
// armarCadenaNC). Si el equipo no da abasto, la cadena vuelve sola a RNNoise y
// ese computador no lo vuelve a intentar en 14 días. El peor caso es RNNoise.
//
// El paquete (@lofcz/deepfilternet-web, MIT/Apache, versión FIJA) trae el
// modelo dentro del WASM. Su worklet se usa tal cual, con tres retoques de
// texto: avisar «listo»/«fallo» (el original se pasa a crudo en silencio si no
// arranca) y medir cuánto tarda cada bloque de audio.

export const PROCESADOR_DF = "maven-deepfilter";

// ── LA VOZ ROBOTIZADA (17/11 y 18/11/2026) Y POR QUÉ YA NO ──────────────────
//
// Tres causas, las tres de este archivo, que se sumaban:
//
// 1. CORTES CADA 10 ms. El AudioContext se creaba con la latencia por defecto
//    («interactive»): en Mac el hilo de audio entrega bloques de 128 muestras
//    (2,7 ms). DeepFilterNet procesa cuadros de 480 muestras (10 ms) y TODO el
//    cuadro se calcula dentro de UN bloque de 128: si ese cálculo tarda más que
//    el bloque (3–6 ms en un portátil normal), la tarjeta de sonido se queda sin
//    audio en ese instante. Un hueco cada 10 ms = 100 cortes por segundo = la voz
//    «robotizada». El medidor solo contaba bloques de más de 8 ms y el promedio
//    de carga se veía sano (~30 %), así que el relevo a RNNoise nunca saltaba.
//    Ahora la cadena que va a usar DeepFilterNet se crea con latencia
//    «balanced» (bloques de ~10 ms: el cuadro cabe) y un bloque cuenta como
//    lento si pasa el 80 % de lo que dura de verdad el bloque del equipo.
// 2. ATENUACIÓN SIN TOPE (100 dB) + POSFILTRO. Con el modelo a fondo se come
//    armónicos de la voz junto con el ruido: sale metálica. Ahora 20 dB (el
//    rango que recomienda DeepFilterNet para llamadas) y sin posfiltro.
// 3. DOBLE LIMPIEZA. El micrófono ya venía con el noiseSuppression del
//    navegador, y DeepFilterNet limpiaba encima lo ya limpiado (el modelo está
//    entrenado con audio crudo). Mientras DeepFilterNet está al aire se le pide
//    al navegador que apague el suyo (ver noise-suppression-processor.ts) y se
//    le devuelve si se baja a RNNoise.

/** Atenuación máxima en dB. 20 dB: quita el ruido sin comerse la voz (100 = sin tope, sonaba robótica). */
export const ATENUACION_DF_DB = 20;

/** Posfiltro del modelo (beta). 0 = apagado: apretaba las pausas y ensuciaba la voz. */
export const POSFILTRO_DF = 0;

/** Latencia del AudioContext cuando la cadena va a usar DeepFilterNet (ver causa 1). */
export const LATENCIA_CONTEXTO_DF: AudioContextLatencyCategory = "balanced";

/**
 * Desde cuántos ms un bloque de 128 cuenta como «lento» (el audio se corta).
 * Es el 80 % de lo que dura el bloque que de verdad pide la tarjeta de sonido
 * (`baseLatency` del contexto), entre 2 y 8 ms.
 */
export function umbralLentoMs(baseLatencySeg: number | undefined, sampleRate = 48000): number {
  const bloqueMs = Math.max((baseLatencySeg ?? 0) * 1000, (128 / sampleRate) * 1000);
  return Math.min(8, Math.max(2, bloqueMs * 0.8));
}

const ANCLA_LISTO = "this.#ready = true;";
const ANCLA_FALLO = "this.#ready = false;";
const ANCLA_REGISTRO = "registerProcessor(PROCESSOR_NAME, DeepFilterProcessor);";

// Medidor: cada ~2 s de audio cuenta el tiempo gastado dentro del procesador y
// cuántos bloques de 128 muestras pasaron el umbral (ahí el audio se corta).
const MEDIDOR = `
  const relojDF = (globalThis.performance && typeof globalThis.performance.now === "function")
    ? () => globalThis.performance.now() : () => Date.now();
  class MedidorDF extends DeepFilterProcessor {
    constructor(o) { super(o); this.gastoMs = 0; this.lentos = 0; this.bloques = 0; this.umbral = (o && o.processorOptions && o.processorOptions.umbralLentoMs) || 8; }
    process(i, o) {
      const a = relojDF();
      const r = super.process(i, o);
      const d = relojDF() - a;
      this.gastoMs += d;
      if (d > this.umbral) this.lentos++;
      if (++this.bloques >= 750) {
        this.port.postMessage({ tipo: "carga", gastoMs: this.gastoMs, ventanaMs: this.bloques * 128 / sampleRate * 1000, lentos: this.lentos });
        this.gastoMs = 0; this.lentos = 0; this.bloques = 0;
      }
      return r;
    }
  }
  registerProcessor("${PROCESADOR_DF}", MedidorDF);`;

// El hilo de audio (AudioWorkletGlobalScope) no trae TextDecoder ni crypto, y el
// pegamento del WASM usa los dos al cargar: sin esto el worklet revienta antes de
// registrarse. TextDecoder solo decodifica mensajes de error; crypto solo siembra
// tablas internas, así que Math.random alcanza.
const RELLENOS = `
if (typeof TextDecoder === "undefined") {
  globalThis.TextDecoder = class {
    decode(b) {
      if (!b) return "";
      const u = b instanceof Uint8Array ? b : new Uint8Array(b.buffer || b);
      let s = "";
      for (let i = 0; i < u.length;) {
        const c = u[i++];
        if (c < 0x80) s += String.fromCharCode(c);
        else if (c < 0xE0) s += String.fromCharCode(((c & 0x1F) << 6) | (u[i++] & 0x3F));
        else if (c < 0xF0) s += String.fromCharCode(((c & 0x0F) << 12) | ((u[i++] & 0x3F) << 6) | (u[i++] & 0x3F));
        else { const p = (((c & 0x07) << 18) | ((u[i++] & 0x3F) << 12) | ((u[i++] & 0x3F) << 6) | (u[i++] & 0x3F)) - 0x10000; s += String.fromCharCode(0xD800 + (p >> 10), 0xDC00 + (p & 0x3FF)); }
      }
      return s;
    }
  };
}
if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.getRandomValues !== "function") {
  globalThis.crypto = { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } };
}
`;

/** El worklet del paquete con los retoques. Tira si el paquete cambió y ya no calza. */
export function workletDeepFilter(crudo: string): string {
  for (const ancla of [ANCLA_LISTO, ANCLA_FALLO, ANCLA_REGISTRO]) {
    if (!crudo.includes(ancla)) throw new Error(`el worklet de DeepFilterNet cambió (falta «${ancla}»)`);
  }
  return RELLENOS + crudo
    .replace(ANCLA_LISTO, `${ANCLA_LISTO} if (opts.postFilterBeta > 0 && wasm.df_set_post_filter_beta) wasm.df_set_post_filter_beta(this.#handle, opts.postFilterBeta); this.port.postMessage({ tipo: "listo" });`)
    .replace(ANCLA_FALLO, `${ANCLA_FALLO} this.port.postMessage({ tipo: "fallo" });`)
    .replace(ANCLA_REGISTRO, MEDIDOR);
}

export interface CargaDF { gastoMs: number; ventanaMs: number; lentos: number }

/**
 * ¿El equipo no da abasto? Dos ventanas seguidas (~4 s) con el hilo de audio
 * ocupado más de la mitad del tiempo, o con 3+ bloques lentos, = se baja a RNNoise.
 */
export function veredictoCarga(c: CargaDF, seguidasPrevias: number): { seguidas: number; pesado: boolean } {
  const mala = (c.ventanaMs > 0 && c.gastoMs / c.ventanaMs > 0.5) || c.lentos >= 3;
  const seguidas = mala ? seguidasPrevias + 1 : 0;
  return { seguidas, pesado: seguidas >= 2 };
}

/**
 * LA PRUEBA ANTES DE SALIR AL AIRE. DeepFilterNet corre ~2 s en paralelo, sin
 * que nadie lo oiga, mientras la llamada sigue con RNNoise. Solo toma el relevo
 * si en esa ventana usó como mucho el 35 % del hilo de audio y cortó a lo sumo
 * un bloque. Si no, el equipo queda marcado (14 días) y nadie oyó nada raro.
 */
export function pruebaDeCargaDF(c: CargaDF): boolean {
  if (!(c.ventanaMs > 0)) return false;
  return c.gastoMs / c.ventanaMs <= 0.35 && c.lentos <= 1;
}

/**
 * LA REGLA (Alvaro, 19/11/2026, opción B: «automático según el equipo»).
 * Computador FUERTE = 8 núcleos o más Y 8 GB de memoria o más (lo que dice el
 * navegador; Chrome y la app reportan como mucho 8), y que no sea celular.
 * Si el navegador no dice núcleos o memoria (Safari, Firefox), no es fuerte:
 * RNNoise. Sobre esto, la prueba de carga (pruebaDeCargaDF) y el vigía
 * (veredictoCarga) bajan a RNNoise al equipo que igual no aguante.
 */
export const NUCLEOS_PARA_DEEPFILTER = 8;
export const MEMORIA_GB_PARA_DEEPFILTER = 8;

export function equipoFuerte(e: { nucleos?: number; memoriaGb?: number; agente?: string }): boolean {
  if (!e.nucleos || e.nucleos < NUCLEOS_PARA_DEEPFILTER) return false;
  if (typeof e.memoriaGb !== "number" || e.memoriaGb < MEMORIA_GB_PARA_DEEPFILTER) return false;
  // En el celular, batería y calor pesan más que el ruido: sigue RNNoise.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(e.agente ?? "")) return false;
  return true;
}

const CLAVE_PESADO = "maven.nc.deepfilter.pesado";
const DIAS_SIN_REINTENTAR = 14;
let descartadoEnPestana = false;
let pesadoEnPestana = false;

/** Por qué este equipo NO usa DeepFilterNet (para datos.nc_info), o null si puede. */
export type SinDeepFilter = "apagado" | "equipo" | "pesado" | "no_cargo" | "sin_wasm";

/**
 * Interruptor general. Prendido desde el 19/11/2026 (opción B) con la regla de
 * equipo fuerte, la prueba de carga y los arreglos de la voz robotizada (arriba).
 * Historia: prendido 16/11, apagado 17/11 en el navegador y 18/11 en la app
 * porque la voz salía robotizada; 19/11 primero como prueba voluntaria y ese
 * mismo día para todos (Alvaro), con interruptor por persona en la llamada
 * (loadNCPreference en noise-suppression-processor.ts).
 */
export const DEEPFILTER_PRENDIDO = true;

export function motivoSinDeepFilter(): SinDeepFilter | null {
  if (!DEEPFILTER_PRENDIDO) return "apagado";
  if (pesadoEnPestana) return "pesado";
  if (descartadoEnPestana) return "no_cargo";
  if (typeof WebAssembly === "undefined") return "sin_wasm";
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (!equipoFuerte({ nucleos: nav.hardwareConcurrency, memoriaGb: nav.deviceMemory, agente: nav.userAgent })) return "equipo";
  try {
    const t = Number(localStorage.getItem(CLAVE_PESADO));
    if (t && Date.now() - t < DIAS_SIN_REINTENTAR * 86_400_000) return "pesado";
  } catch { /* sin storage: se intenta */ }
  return null;
}

/** ¿Vale la pena intentar DeepFilterNet en este equipo? */
export function deepFilterPermitido(): boolean {
  return motivoSinDeepFilter() === null;
}

/** El equipo no aguantó: no se reintenta en 14 días (ni en esta pestaña). */
export function marcarDeepFilterPesado(): void {
  pesadoEnPestana = true;
  try { localStorage.setItem(CLAVE_PESADO, String(Date.now())); } catch { /* noop */ }
}

/** No cargó (red, navegador): no se reintenta en esta pestaña. */
export function descartarDeepFilterEnPestana(): void {
  descartadoEnPestana = true;
}

// El WASM se baja y compila UNA vez por pestaña y se comparte entre cadenas.
let moduloDF: Promise<WebAssembly.Module> | null = null;
let urlWorklet: string | null = null;
const ESPERA_DESCARGA_MS = 90_000;
const ESPERA_LISTO_MS = 15_000;

function cargarModuloDF(): Promise<WebAssembly.Module> {
  moduloDF ??= (async () => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), ESPERA_DESCARGA_MS);
    try {
      const r = await fetch(dfWasmUrl, { signal: ctrl.signal });
      if (!r.ok) throw new Error(`el WASM de DeepFilterNet respondió ${r.status}`);
      return await WebAssembly.compile(await r.arrayBuffer());
    } finally {
      window.clearTimeout(t);
    }
  })();
  moduloDF.catch(() => { moduloDF = null; });
  return moduloDF;
}

/** Crea el nodo de DeepFilterNet en ese contexto y espera a que el modelo arranque. */
export async function crearNodoDF(ctx: AudioContext): Promise<AudioWorkletNode> {
  const umbral = umbralLentoMs(ctx.baseLatency, ctx.sampleRate);
  const modulo = await cargarModuloDF();
  urlWorklet ??= URL.createObjectURL(new Blob([workletDeepFilter(dfWorkletCrudo)], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(urlWorklet);
  const nodo = new AudioWorkletNode(ctx, PROCESADOR_DF, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: "explicit",
    processorOptions: { wasmModule: modulo, attenuationLimit: ATENUACION_DF_DB, postFilterBeta: POSFILTRO_DF, umbralLentoMs: umbral },
  });
  try {
    await new Promise<void>((listo, fallo) => {
      const t = window.setTimeout(() => fallo(new Error("DeepFilterNet no arrancó a tiempo")), ESPERA_LISTO_MS);
      nodo.port.onmessage = (e: MessageEvent) => {
        if (e.data?.tipo === "listo") { window.clearTimeout(t); listo(); }
        else if (e.data?.tipo === "fallo") { window.clearTimeout(t); fallo(new Error("el modelo de DeepFilterNet no arrancó en el worklet")); }
      };
    });
  } catch (e) {
    soltarNodoDF(nodo);
    throw e;
  }
  return nodo;
}

/** Apaga y suelta un nodo de DeepFilterNet (queda en paso directo hasta que el GC lo recoja). */
export function soltarNodoDF(nodo: AudioWorkletNode): void {
  try { nodo.port.onmessage = null; } catch { /* noop */ }
  try { nodo.port.postMessage({ type: "setEnabled", value: false }); } catch { /* noop */ }
  try { nodo.disconnect(); } catch { /* noop */ }
  try { nodo.port.close(); } catch { /* noop */ }
}

/** Cuánto se espera el primer reporte de carga en la prueba (el medidor manda uno cada ~2 s). */
export const ESPERA_PRUEBA_DF_MS = 6_000;

/** Espera el primer reporte de carga del medidor; null si no llega a tiempo. */
export function esperarCargaDF(nodo: AudioWorkletNode, ms = ESPERA_PRUEBA_DF_MS): Promise<CargaDF | null> {
  return new Promise((listo) => {
    const t = window.setTimeout(() => { nodo.port.onmessage = null; listo(null); }, ms);
    nodo.port.onmessage = (e: MessageEvent) => {
      if (e.data?.tipo !== "carga") return;
      window.clearTimeout(t);
      nodo.port.onmessage = null;
      listo({ gastoMs: e.data.gastoMs, ventanaMs: e.data.ventanaMs, lentos: e.data.lentos });
    };
  });
}

/**
 * Prende o apaga el noiseSuppression DEL NAVEGADOR en el micrófono crudo (causa
 * 3 de la voz robotizada). Se mantiene el resto de lo pedido al capturar (eco,
 * ganancia, dispositivo). Nunca tira: si el navegador no deja cambiarlo en
 * caliente, se queda como estaba. Devuelve lo que quedó, o null si no se sabe.
 */
export async function ruidoDelNavegador(t: MediaStreamTrack, prendido: boolean): Promise<boolean | null> {
  try {
    if (t.readyState !== "live" || typeof t.applyConstraints !== "function") return null;
    const actuales = typeof t.getConstraints === "function" ? t.getConstraints() : {};
    await t.applyConstraints({ ...actuales, noiseSuppression: prendido });
    const quedo = typeof t.getSettings === "function" ? t.getSettings().noiseSuppression : undefined;
    return typeof quedo === "boolean" ? quedo : null;
  } catch {
    return null;
  }
}
