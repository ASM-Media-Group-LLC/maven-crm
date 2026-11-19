import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import {
  crearNodoDF, descartarDeepFilterEnPestana, esperarCargaDF, LATENCIA_CONTEXTO_DF, marcarDeepFilterPesado, motivoSinDeepFilter,
  pruebaDeCargaDF, ruidoDelNavegador, soltarNodoDF, veredictoCarga, type SinDeepFilter,
} from "@/lib/deepfilter";

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
// Desde el 13/11/2026 es OBLIGATORIA: no hay botón para apagarla (ver
// loadNCPreference abajo) y lib/estadoNC.ts mide si de verdad está corriendo.
//
// NIVEL 3 (16/11/2026): DeepFilterNet3 (lib/deepfilter.ts), más fuerte que
// RNNoise. Toma el relevo a los pocos segundos, cuando terminó de cargar, y si
// el equipo no da abasto se vuelve solo a RNNoise:
//
//   Micro → DeepFilterNet3 (o RNNoise) → puerta adaptativa → pista procesada
//
// NIVEL 3, OTRA VEZ (19/11/2026, Alvaro, opción B: automático según el equipo):
//   · Computador fuerte (8+ núcleos y 8+ GB, no celular): DeepFilterNet, después
//     de una prueba de carga de ~2 s en paralelo que nadie oye.
//   · Los demás: RNNoise (liviano, no suena robótico).
//   · Si algo falla: la puerta sola o, en el peor caso, el micrófono crudo con el
//     noiseSuppression del navegador (se pide al capturar).
// Las causas de la voz robotizada y sus arreglos están en lib/deepfilter.ts.

/** Qué motor de cancelación de ruido quedó armado en esta pestaña. */
export type MotorNC = "deepfilter+puerta" | "rnnoise+puerta" | "puerta";

/** El último motor que se armó. Para el aviso al usuario y para depurar. */
let motorVigente: MotorNC | null = null;
export function motorNCVigente(): MotorNC | null {
  return motorVigente;
}

/** Fracción del hilo de audio que gasta DeepFilterNet (0–1), según su último reporte. */
let cargaDFVigente: number | null = null;
export function cargaDeepFilter(): number | null {
  return cargaDFVigente;
}

// La librería se importa PEREZOSA, dentro de la cadena, por dos motivos: su
// módulo define clases que extienden AudioWorkletNode al cargarse (en Node/
// vitest eso revienta al importar cualquier cosa que toque este archivo), y
// así el código del denoiser solo se baja cuando se arma la primera cadena.
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

/** Lo que va en llamada_salud.datos.nc_info para medir qué filtro corre y por qué. */
export interface InfoNC {
  /** Por qué no corre DeepFilterNet (null si corre o todavía puede entrar). */
  sin_df: SinDeepFilter | "prueba" | null;
  /** Fracción del hilo de audio que gasta DeepFilterNet (0–1), si está al aire. */
  carga: number | null;
  /** Cómo quedó el noiseSuppression del navegador en el micrófono crudo (null = no se sabe). */
  ns_navegador: boolean | null;
}

export interface CadenaNC {
  /** La pista limpia, lista para publicar (o para clonar por sala). */
  salida: MediaStreamTrack;
  /** Cambia en vivo: RNNoise al armar, DeepFilterNet cuando toma el relevo. */
  readonly motor: MotorNC;
  readonly info: InfoNC;
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
// Cuánto puede estar la voz entrando sin que salga nada antes de dar el filtro
// por trabado: 8 revisiones de 2 s = 16 s hablando a un micrófono "activo" que
// nadie oye. Umbrales en RMS: 0.05 es voz normal (-26 dBFS); 0.0002 es nada.
export const VIGILANCIA_NC_MS = 2_000;
export const REVISIONES_MUDAS_PARA_FALLAR = 8;
export const RMS_VOZ = 0.05;
export const RMS_NADA = 0.0002;

/** Cuánto se espera después de armar antes de montar DeepFilterNet. */
export const ESPERA_ANTES_DE_DF_MS = 3_000;

/** RMS de la señal en el analizador (dominio del tiempo). Exportado para probarlo. */
export function rmsDe(muestras: Float32Array): number {
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
  return muestras.length ? Math.sqrt(suma / muestras.length) : 0;
}

/** El filtro se trabó: hay voz a la entrada y nada a la salida, varias veces seguidas. */
export function filtroTrabado(entradaRms: number, salidaRms: number, seguidasPrevias: number): { seguidas: number; trabado: boolean } {
  const seguidas = entradaRms > RMS_VOZ && salidaRms < RMS_NADA ? seguidasPrevias + 1 : 0;
  return { seguidas, trabado: seguidas >= REVISIONES_MUDAS_PARA_FALLAR };
}

/**
 * @param alFallar se llama UNA vez si el filtro deja de funcionar ya andando (el
 *   AudioContext se suspende y no reanuda, o la salida queda muda con voz a la
 *   entrada). Quien lo recibe apaga el procesador para que el micrófono vuelva
 *   crudo: mejor ruido que silencio.
 */
export async function armarCadenaNC(entrada: MediaStreamTrack, alFallar?: (motivo: string) => void): Promise<CadenaNC> {
  // 48 kHz no es una preferencia: RNNoise está entrenado a esa tasa y trabaja
  // en cuadros de 10 ms (480 muestras). El worklet del paquete hace el buffer
  // intermedio desde los 128 del AudioWorklet.
  //
  // Si este equipo va a usar DeepFilterNet, el contexto se crea con latencia
  // «balanced»: bloques de ~10 ms donde cabe el cuadro entero del modelo. Con
  // «interactive» (2,7 ms) el audio se cortaba cada 10 ms: la voz robotizada.
  const motivoSinDF = motivoSinDeepFilter();
  const conDF = motivoSinDF === null;
  const ctx = new AudioContext(conDF ? { sampleRate: 48000, latencyHint: LATENCIA_CONTEXTO_DF } : { sampleRate: 48000 });
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { /* se decide abajo */ }
  }
  // Un AudioContext suspendido NO produce audio: el track "procesado" que sale
  // de él es silencio puro, y LiveKit lo publica como si fuera la voz. Así
  // quedó Andrea el 10/09: "me salía el micrófono activo y no me escuchaban".
  // Si no arranca (sin gesto del usuario, o el navegador lo tiene interrumpido),
  // acá se corta: el llamador se queda con el micrófono crudo.
  if (ctx.state !== "running") {
    try { await ctx.close(); } catch { /* noop */ }
    throw new Error(`el AudioContext de la cancelación de ruido no arrancó (estado: ${ctx.state})`);
  }
  let avisado = false;
  const fallar = (motivo: string) => {
    if (avisado) return;
    avisado = true;
    console.warn("[NC] filtro fuera de servicio:", motivo);
    alFallar?.(motivo);
  };
  // Si el navegador lo suspende o interrumpe ya andando (cambio de dispositivo,
  // captura de audio del sistema al compartir pantalla, pestaña en segundo
  // plano en algunos móviles), un intento de reanudar y, si no vuelve, se avisa.
  ctx.onstatechange = () => {
    if (ctx.state === "running" || ctx.state === "closed") return;
    ctx.resume().then(
      () => { if (ctx.state !== "running") fallar(`el AudioContext quedó en ${ctx.state}`); },
      () => fallar(`el AudioContext quedó en ${ctx.state} y no se pudo reanudar`),
    );
  };

  // ⚠️ TODO LO QUE PUEDA FALLAR ACÁ CIERRA EL AudioContext ANTES DE PROPAGAR.
  // El contexto se crea arriba; si algo de esto tira y nadie lo cierra, queda un
  // hilo de audio a 48 kHz vivo por cada intento, reteniendo el micrófono. Los
  // navegadores topean los AudioContext por documento (Chrome, alrededor del
  // sexto), y al llegar al tope el `new AudioContext` de arriba empieza a tirar
  // él mismo — justo lo que no queremos durante un cambio de pista.
  // Ojo con `addModule`: es una descarga de RED (un 404 tras un deploy, un MIME
  // mal servido, una CSP) y hasta hoy era la única llamada de la cadena sin
  // ninguna protección.
  let fuente: MediaStreamAudioSourceNode;
  let destino: MediaStreamAudioDestinationNode;
  let puerta: AudioWorkletNode;
  try {
    fuente = ctx.createMediaStreamSource(new MediaStream([entrada]));
    destino = ctx.createMediaStreamDestination();
    // La puerta de siempre, ahora de remate. Su regla está testeada en
    // lib/pisoDeRuido.ts con un port fiel en el worklet.
    await ctx.audioWorklet.addModule("/worklets/noise-suppression-worklet.js");
    puerta = new AudioWorkletNode(ctx, "noise-suppression-processor");
  } catch (e) {
    try { await ctx.close(); } catch { /* noop */ }
    throw e;
  }
  const nodos: AudioNode[] = [];
  let rnnoise: InstanceType<LibNC["RnnoiseWorkletNode"]> | null = null;
  let motor: MotorNC = "puerta";

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
  // Vigilante de mudez: voz a la entrada y nada a la salida durante 16 s = el
  // filtro (worklet o WASM) se trabó sin que el contexto cambie de estado.
  const analizadorEntrada = ctx.createAnalyser();
  const analizadorSalida = ctx.createAnalyser();
  analizadorEntrada.fftSize = 256;
  analizadorSalida.fftSize = 256;
  fuente.connect(analizadorEntrada);
  puerta.connect(analizadorSalida);
  nodos.push(analizadorEntrada, analizadorSalida);
  const muestras = new Float32Array(256);
  let seguidas = 0;
  const vigilante = window.setInterval(() => {
    if (ctx.state !== "running") return;
    analizadorEntrada.getFloatTimeDomainData(muestras);
    const entradaRms = rmsDe(muestras);
    analizadorSalida.getFloatTimeDomainData(muestras);
    const veredicto = filtroTrabado(entradaRms, rmsDe(muestras), seguidas);
    seguidas = veredicto.seguidas;
    if (veredicto.trabado) {
      window.clearInterval(vigilante);
      fallar("hay voz a la entrada y la salida lleva 16 s en silencio");
    }
  }, VIGILANCIA_NC_MS);
  motorVigente = motor;
  console.info(`[NC] cancelación de ruido armada: ${motor}`);

  // RELEVO A DEEPFILTERNET. Unos segundos después de armar (que la entrada a
  // la llamada no compita con la descarga) se monta DeepFilterNet en lugar de
  // RNNoise, en caliente y en el mismo contexto: la pista de salida no cambia,
  // LiveKit no se entera. Si no carga, sigue RNNoise; si el equipo no da
  // abasto, se vuelve a RNNoise.
  let cerrada = false;
  let nodoDF: AudioWorkletNode | null = null;
  let sinDF: InfoNC["sin_df"] = motivoSinDF;
  let nsNavegador: boolean | null = null;
  let cargaDF: number | null = null;
  // El noiseSuppression del navegador se apaga SOLO mientras DeepFilterNet está
  // al aire (limpiar dos veces ensuciaba la voz) y se devuelve al bajar.
  const devolverRuidoDelNavegador = () => {
    if (nsNavegador !== false) return;
    void ruidoDelNavegador(entrada, true).then((q) => { nsNavegador = q; });
  };
  const conectarAnterior = () => {
    if (rnnoise) { fuente.connect(rnnoise); rnnoise.connect(puerta); }
    else fuente.connect(puerta);
  };
  const desconectarAnterior = () => {
    if (rnnoise) {
      try { fuente.disconnect(rnnoise); } catch { /* noop */ }
      try { rnnoise.disconnect(puerta); } catch { /* noop */ }
    } else {
      try { fuente.disconnect(puerta); } catch { /* noop */ }
    }
  };
  const bajarDeDeepFilter = (motivo: string) => {
    const nodo = nodoDF;
    if (!nodo) return;
    nodoDF = null;
    conectarAnterior();
    try { fuente.disconnect(nodo); } catch { /* noop */ }
    soltarNodoDF(nodo);
    devolverRuidoDelNavegador();
    cargaDF = null;
    sinDF = "pesado";
    motor = rnnoise ? "rnnoise+puerta" : "puerta";
    motorVigente = motor;
    console.warn(`[NC] DeepFilterNet apagado (${motivo}); sigue ${motor}`);
  };
  const subirADeepFilter = async () => {
    let nodo: AudioWorkletNode | null = null;
    let banco: MediaStreamAudioDestinationNode | null = null;
    try {
      nodo = await crearNodoDF(ctx);
      if (cerrada || ctx.state === "closed") { soltarNodoDF(nodo); return; }
      // PRUEBA DE CARGA: DeepFilterNet corre ~2 s en paralelo hacia un destino
      // mudo (nadie lo oye; la llamada sigue con RNNoise). Solo sale al aire si
      // el equipo de verdad aguanta.
      banco = ctx.createMediaStreamDestination();
      fuente.connect(nodo);
      nodo.connect(banco);
      const prueba = await esperarCargaDF(nodo);
      // El contexto pudo cerrarse durante la espera (TS no lo sabe: lo leemos de nuevo).
      if (cerrada || (ctx.state as AudioContextState) === "closed") { soltarNodoDF(nodo); return; }
      if (!prueba || !pruebaDeCargaDF(prueba)) {
        try { fuente.disconnect(nodo); } catch { /* noop */ }
        soltarNodoDF(nodo);
        nodo = null;
        if (prueba) marcarDeepFilterPesado(); else descartarDeepFilterEnPestana();
        sinDF = "prueba";
        console.warn("[NC] DeepFilterNet no pasó la prueba de carga; sigue", motor, prueba ?? "(sin reporte)");
        return;
      }
      nodo.connect(puerta);
      desconectarAnterior();
      try { nodo.disconnect(banco); } catch { /* noop */ }
      nodoDF = nodo;
      motor = "deepfilter+puerta";
      motorVigente = motor;
      cargaDF = prueba.gastoMs / prueba.ventanaMs;
      cargaDFVigente = cargaDF;
      nsNavegador = await ruidoDelNavegador(entrada, false);
      let malas = 0;
      nodo.port.onmessage = (e: MessageEvent) => {
        if (e.data?.tipo !== "carga") return;
        cargaDF = e.data.ventanaMs > 0 ? e.data.gastoMs / e.data.ventanaMs : null;
        cargaDFVigente = cargaDF;
        const v = veredictoCarga(e.data, malas);
        malas = v.seguidas;
        if (v.pesado) {
          marcarDeepFilterPesado();
          bajarDeDeepFilter("el computador no da abasto");
        }
      };
      console.info("[NC] cancelación de ruido fuerte armada: deepfilter+puerta");
    } catch (e) {
      if (nodo) { try { fuente.disconnect(nodo); } catch { /* noop */ } soltarNodoDF(nodo); }
      descartarDeepFilterEnPestana();
      sinDF = "no_cargo";
      console.warn("[NC] DeepFilterNet no disponible, sigue", motor, "·", (e as Error)?.message ?? e);
    }
  };
  const relevoDF = conDF
    ? window.setTimeout(() => { void subirADeepFilter(); }, ESPERA_ANTES_DE_DF_MS)
    : 0;

  const salida = destino.stream.getAudioTracks()[0];
  return {
    salida,
    get motor() { return motor; },
    get info(): InfoNC { return { sin_df: nodoDF ? null : sinDF, carga: nodoDF ? cargaDF : null, ns_navegador: nsNavegador }; },
    async destruir() {
      cerrada = true;
      window.clearTimeout(relevoDF);
      if (nodoDF) { soltarNodoDF(nodoDF); nodoDF = null; }
      devolverRuidoDelNavegador();
      window.clearInterval(vigilante);
      ctx.onstatechange = null;
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
 * Architecture: Mic → DeepFilterNet3 (o RNNoise) → puerta → Processed Track → LiveKit
 */
export class NoiseSuppresionTrackProcessor {
  name = "noise-suppression";
  processedTrack?: MediaStreamTrack;
  /** Con qué motor está corriendo ahora (cambia cuando DeepFilterNet toma el relevo). */
  get motor(): MotorNC | null {
    return this.cadena?.motor ?? null;
  }
  /** Qué filtro corre y por qué (para llamada_salud.datos.nc_info). */
  get info(): InfoNC | null {
    return this.cadena?.info ?? null;
  }

  private cadena?: CadenaNC;

  /** Ver `armarCadenaNC`: quién apaga el filtro si deja de funcionar andando. */
  constructor(private readonly alFallar?: (motivo: string) => void) {}

  // ⚠️ NI `init` NI `restart` PUEDEN TIRAR NUNCA. NO ES ESTILO: ES LA DIFERENCIA
  // ENTRE QUE ALGUIEN SALGA CON RUIDO O QUE SE QUEDE MUDO.
  //
  // LiveKit llama a `restart()` DENTRO de `setMediaStreamTrack`, ANTES de
  // `sender.replaceTrack` (livekit-client.esm.mjs:18049 y :18057). Si tiramos
  // ahí, el `replaceTrack` NUNCA corre: el emisor se queda con la pista vieja
  // —que ya paramos— y la nueva ni se asigna. Silencio permanente, con el
  // micrófono en verde y sin un solo evento que lo delate. Es exactamente el
  // bug que venimos persiguiendo desde el 10/09.
  //
  // En cambio, si dejamos `processedTrack` sin definir, la línea 18057 hace
  // `replaceTrack(processedTrack ?? newTrack)` y sale la pista CRUDA. Ruido en
  // vez de silencio, que es la política que este archivo declara arriba.
  //
  // Hasta el 18/09/2026 nada de esto importaba porque `init` tiraba SIEMPRE (le
  // pasábamos `track.mediaStreamTrack` de un MediaStreamTrack) y LiveKit solo
  // asigna `this.processor` DESPUÉS de que `init` resuelva: la rama del
  // procesador dentro de `setMediaStreamTrack` no se ejecutaba jamás. Al
  // corregir la llamada, esa rama se enciende en TODOS los restartTrack.
  async init({ track }: { track: MediaStreamTrack; element?: HTMLMediaElement }) {
    await this.armar(track);
  }

  // ⚠️ NO DESTRUCTIVO. Antes hacía `destroy()` y DESPUÉS `init()`, o sea que
  // paraba la pista que el emisor estaba transmitiendo y recién entonces
  // intentaba armar la nueva. Si armar fallaba, ya no había a qué volver.
  // Ahora se arma la nueva primero y la vieja se suelta solo si la nueva quedó.
  async restart({ track }: { track: MediaStreamTrack; element?: HTMLMediaElement }) {
    const vieja = this.cadena;
    await this.armar(track);
    if (vieja && vieja !== this.cadena) {
      try { await vieja.destruir(); } catch { /* ya estaba caída */ }
    }
  }

  private async armar(track: MediaStreamTrack) {
    try {
      const nueva = await armarCadenaNC(track, this.alFallar);
      this.cadena = nueva;
      this.processedTrack = nueva.salida;
    } catch (e) {
      // Mejor ruido que silencio: sin pista procesada, LiveKit publica la cruda.
      this.cadena = undefined;
      this.processedTrack = undefined;
      const motivo = e instanceof Error ? e.message : String(e);
      console.warn("[NC] no se pudo armar; se sigue con el micrófono crudo:", motivo);
      // ⚠️ Diferido a propósito: `alFallar` termina llamando a `stopProcessor()`,
      // y acá todavía estamos DENTRO de `setProcessor`/`setMediaStreamTrack`,
      // que tienen tomado el cerrojo de cambio de pista de LiveKit. Llamarlo
      // en línea lo trabaría.
      if (this.alFallar) { const f = this.alFallar; setTimeout(() => f(motivo), 0); }
    }
  }

  async destroy() {
    const c = this.cadena;
    this.cadena = undefined;
    this.processedTrack = undefined;
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

/**
 * OBLIGATORIA DESDE EL 13/11/2026 (Alvaro). Antes (03/09) arrancaba activada
 * pero se podía apagar desde el menú del micrófono, y quien la apagaba una vez
 * quedaba apagado para siempre en ese navegador. Ahora siempre se arma: el botón
 * se quitó de la llamada y un «false» guardado de antes se IGNORA (y se borra,
 * para que no reaparezca si algún día vuelve el botón).
 *
 * Lo que NO cambia: si el navegador no la soporta o el motor no carga, la cadena
 * cae a la puerta de antes o al micrófono crudo. Obligatoria nunca quiere decir
 * «sin audio». Si de verdad está corriendo lo mide lib/estadoNC.ts en cada
 * muestra de la llamada.
 *
 * Se conserva el nombre porque lo usan la llamada y el micrófono que el
 * supervisor de Cowork reparte a las salas.
 */
export function loadNCPreference(): boolean {
  try {
    if (localStorage.getItem(NC_STORAGE_KEY) !== null) localStorage.removeItem(NC_STORAGE_KEY);
  } catch { /* sin storage: da igual, es obligatoria */ }
  return true;
}
