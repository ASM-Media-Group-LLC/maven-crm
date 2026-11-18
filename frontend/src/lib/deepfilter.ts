import dfWasmUrl from "@lofcz/deepfilternet-web/df_bg.wasm?url";
import dfWorkletCrudo from "@lofcz/deepfilternet-web/worklet?raw";
import { escritorio } from "@/lib/escritorio";

// CANCELACIÓN DE RUIDO FUERTE: DeepFilterNet3 (Alvaro, 16/11/2026: «sí, más fuerte»).
//
// RNNoise quita ventilador, teclado y zumbido, pero con ruido fuerte (gente
// hablando al lado, música, calle) se queda corto. DeepFilterNet3 es un modelo
// bastante más capaz, cercano a lo de Meet, y corre en el navegador como WASM
// dentro de un AudioWorklet. A cambio pesa (~12 MB comprimido, se baja una vez
// y queda en caché) y gasta más procesador.
//
// Por eso NUNCA es la primera: la llamada arranca con RNNoise y DeepFilterNet
// toma el relevo cuando terminó de cargar (ver armarCadenaNC). Si el equipo no
// da abasto, la cadena vuelve sola a RNNoise y ese computador no lo vuelve a
// intentar en 14 días. El peor caso sigue siendo el de ayer.
//
// El paquete (@lofcz/deepfilternet-web, MIT/Apache, versión FIJA) trae el
// modelo dentro del WASM. Su worklet se usa tal cual, con tres retoques de
// texto: avisar «listo»/«fallo» (el original se pasa a crudo en silencio si no
// arranca) y medir cuánto tarda cada bloque de audio.

export const PROCESADOR_DF = "maven-deepfilter";

/** Atenuación máxima en dB. 100 = sin tope: lo más fuerte que da el modelo. */
export const ATENUACION_DF_DB = 100;

/**
 * Posfiltro del modelo (beta). 0 = apagado. Con él aprieta más el ruido que
 * queda entre palabras y en las pausas; el valor de referencia de DeepFilterNet es 0.02.
 */
export const POSFILTRO_DF = 0.02;

const ANCLA_LISTO = "this.#ready = true;";
const ANCLA_FALLO = "this.#ready = false;";
const ANCLA_REGISTRO = "registerProcessor(PROCESSOR_NAME, DeepFilterProcessor);";

// Medidor: cada ~2 s de audio cuenta el tiempo gastado dentro del procesador y
// cuántos bloques de 128 muestras tardaron más de 8 ms (ahí el audio se corta).
const MEDIDOR = `
  const relojDF = (globalThis.performance && typeof globalThis.performance.now === "function")
    ? () => globalThis.performance.now() : () => Date.now();
  class MedidorDF extends DeepFilterProcessor {
    constructor(o) { super(o); this.gastoMs = 0; this.lentos = 0; this.bloques = 0; }
    process(i, o) {
      const a = relojDF();
      const r = super.process(i, o);
      const d = relojDF() - a;
      this.gastoMs += d;
      if (d > 8) this.lentos++;
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
 * Alvaro, 17/11: solo en equipos de 8 núcleos o más; en los demás trababa.
 * Con menos núcleos (o si el navegador no dice cuántos) la llamada se queda con
 * RNNoise («activa» en datos.nc) y NUNCA baja los ~12 MB del modelo: el relevo
 * ni se programa (ver armarCadenaNC en noise-suppression-processor.ts).
 */
export const NUCLEOS_PARA_DEEPFILTER = 8;

const CLAVE_PESADO = "maven.nc.deepfilter.pesado";
const DIAS_SIN_REINTENTAR = 14;
let descartadoEnPestana = false;

/** ¿Vale la pena intentar DeepFilterNet en este equipo? */
// APAGADO (Alvaro, 17/11/2026): «no sirve el audio, no se escucha, es lento,
// que larga». Se vuelve a RNNoise como antes. Para volver a probar
// DeepFilterNet, poner esto en true.
export const DEEPFILTER_PRENDIDO = false;

// PRENDIDO EN LA APP DE COMPUTADOR (Alvaro, 18/11/2026: «prender todo lo que es
// el noise cancellation en la aplicación… ahorita enfocamos en la app»). En la
// app de Mac/Windows corre DeepFilterNet3 (equipos de 8 núcleos o más); el
// navegador sigue con RNNoise hasta que se decida igualarlo. Si el equipo no
// aguanta, el relevo vuelve solo a RNNoise como siempre.
// APAGADO OTRA VEZ (Alvaro, 18/11/2026, en la tarde: «es nuestra voz la que se
// ve rara cuando uno habla»): en la app la voz salía robotizada, igual que el
// 17/11 en el navegador. Todos vuelven a RNNoise.
export const DEEPFILTER_EN_APP = false;

export function deepFilterPermitido(): boolean {
  const enApp = DEEPFILTER_EN_APP && escritorio() !== null;
  if (!DEEPFILTER_PRENDIDO && !enApp) return false;
  if (descartadoEnPestana || typeof WebAssembly === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (!nav.hardwareConcurrency || nav.hardwareConcurrency < NUCLEOS_PARA_DEEPFILTER) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return false;
  // En el celular, batería y calor pesan más que el ruido: sigue RNNoise.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent)) return false;
  try {
    const t = Number(localStorage.getItem(CLAVE_PESADO));
    if (t && Date.now() - t < DIAS_SIN_REINTENTAR * 86_400_000) return false;
  } catch { /* sin storage: se intenta */ }
  return true;
}

/** El equipo no aguantó: no se reintenta en 14 días (ni en esta pestaña). */
export function marcarDeepFilterPesado(): void {
  descartadoEnPestana = true;
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
  const modulo = await cargarModuloDF();
  urlWorklet ??= URL.createObjectURL(new Blob([workletDeepFilter(dfWorkletCrudo)], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(urlWorklet);
  const nodo = new AudioWorkletNode(ctx, PROCESADOR_DF, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: "explicit",
    processorOptions: { wasmModule: modulo, attenuationLimit: ATENUACION_DF_DB, postFilterBeta: POSFILTRO_DF },
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
