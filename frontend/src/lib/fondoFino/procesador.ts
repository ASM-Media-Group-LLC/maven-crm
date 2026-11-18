// EL PROCESADOR DE FONDO DE LAS LLAMADAS (17/11/2026).
//
// Reemplaza al `BackgroundProcessor` de `@livekit/track-processors`, que Alvaro
// describió como «una porquería, no como Google». Lo que tenía mal ese paquete:
//   · usaba solo la máscara de CATEGORÍAS del detector (sí/no por píxel), así que
//     el borde era un escalón estirado de 256×256, con halo y sin pelo;
//   · ningún suavizado en el tiempo: el borde parpadeaba cuadro a cuadro;
//   · el blur corría a 1/4 con un tope de 16 muestras: el nivel normal apenas
//     difuminaba y el fuerte no llegaba a esconder el cuarto;
//   · al desenfocar mezclaba a la persona con la pared: halo claro alrededor.
//
// Este usa la CONFIANZA del detector (0..1 por píxel), la suaviza en el tiempo,
// la ajusta a los bordes reales de la imagen y desenfoca el fondo SIN la persona
// (ver pipelineGL.ts para el detalle de cada pasada).
//
// La forma de uso es la MISMA que la del paquete viejo, para que el cambio en
// useLiveKit y en el lobby sea solo el import:
//   const p = ProcesadorDeFondo({ mode: "disabled" });
//   await track.setProcessor(p, true);
//   await p.switchTo({ mode: "background-blur", blurRadius: radioDeBlur(effect) });
//   await p.switchTo({ mode: "virtual-background", imagePath: url });
// Lo que sigue del paquete es el `ProcessorWrapper`: el caño que saca cuadros de
// la cámara y entrega la pista procesada (con su respaldo para navegadores sin
// MediaStreamTrackProcessor). Eso funciona bien y no hay por qué rehacerlo.

import * as vision from "@mediapipe/tasks-vision";
import { ProcessorWrapper } from "@livekit/track-processors";
import type {
  ProcessorWrapperOptions,
  TrackTransformerDestroyOptions,
  VideoTrackTransformer,
  VideoTransformerInitOptions,
} from "@livekit/track-processors";
import { RADIO_DE_BLUR, cadaCuantosCuadrosSegmentar } from "@/lib/fondoDeLlamada";
import { crearPipelineFondo, type PipelineFondo } from "./pipelineGL";
import { FUSION_POR_DEFECTO, tocaMulticlase } from "./parametros";

// ── El detector ──────────────────────────────────────────────────────────────
//
// Versión de los .wasm de MediaPipe: la MISMA que la librería instalada
// (package.json la fija exacta en 0.10.14). Si no coinciden, el wasm no carga.
export const VERSION_MEDIAPIPE = "0.10.14";
const WASM_MEDIAPIPE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION_MEDIAPIPE}/wasm`;

/**
 * Los dos modelos de MediaPipe que sirven para esto, comparados en Chrome con
 * la cámara a 1280×720 (PR del 17/11/2026, capturas en el PR):
 *
 *  · `selfie_segmenter` (250 KB, entrada 256×256): el que usaba el paquete.
 *    Con su CONFIANZA más nuestro borde guiado y el suavizado, el contorno ya
 *    no tiene escalones ni parpadea. ~5,9 ms por cuadro (detector + dibujo,
 *    esperando a la GPU) en la Mac de pruebas: lo mismo que el procesador viejo.
 *  · `selfie_multiclass_256x256` (16 MB, 6 clases con el pelo aparte): con
 *    buena luz recorta un poco mejor el pelo esponjado, PERO con poca luz o de
 *    perfil se comía la cabeza y las manos (pedazos de persona convertidos en
 *    fondo, que es lo peor que puede pasar), cuesta ~13 ms por cuadro (más del
 *    doble) y son 16 MB que bajar: con el internet del equipo eso pasa el tope de
 *    6 s del enganche y el fondo fallaría.
 *  · `selfie_segmenter_landscape` (144×256) no se probó a fondo: ve la cara con
 *    144 filas en vez de 256, menos detalle justo donde importa.
 *
 * Se queda `selfie_segmenter`. El 17/11 (noche) se probó el multiclase como
 * AYUDA del liviano (`fusion: true`, ver personaFusionada en parametros.ts): se
 * baja de fondo DESPUÉS de que el fondo ya está puesto (nunca demora el
 * enganche), queda en el Cache Storage, corre uno de cada
 * CADA_CUANTOS_MULTICLASE cuadros y solo puede SUMAR persona cerca del
 * contorno del liviano. Así ya no se come la cabeza ni las manos, PERO:
 *   · el borde no mejoró a la vista (con el pelo esponjado sumaba más pared
 *     gris, no menos: lo que falla ahí es el color, no el detector);
 *   · el cuadro en que corre tarda ~20 ms: promedio ~9-10 ms (antes ~5) y se
 *     pierden cuadros (29,2-29,7 por segundo en vez de 30).
 * Por eso queda APAGADO (FUSION_POR_DEFECTO) y lo que sí mejoró el borde es el
 * «borde por color» de pipelineGL.ts (mate), que cuesta menos de 0,5 ms.
 */
export const MODELOS = {
  selfie: {
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    // Su única máscara es la confianza de «persona».
    mascara: 0,
    invertir: false,
  },
  multiclase: {
    url: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
    // La máscara 0 es «fondo»: persona = 1 − fondo (incluye pelo, ropa, accesorios).
    mascara: 0,
    invertir: true,
  },
} as const;

export type ModeloDeFondo = keyof typeof MODELOS;
export const MODELO_POR_DEFECTO: ModeloDeFondo = "selfie";

export interface EstadisticasDeCuadro {
  processingTimeMs: number;
  segmentationTimeMs: number;
  filterTimeMs: number;
}

export type OpcionesFondoFino = {
  /** Sigma del desenfoque en px a 720p (RADIO_DE_BLUR). */
  blurRadius?: number;
  imagePath?: string;
  backgroundDisabled?: boolean;
  /** Cada cuántos cuadros se segmenta (1 en equipos fuertes, 2 en flojos). */
  cadaCuantos?: number;
  /** Detector (por defecto, MODELO_POR_DEFECTO). Se fija al crear el procesador. */
  modelo?: ModeloDeFondo;
  /**
   * Sumar el multiclase como ayuda del borde (por defecto, FUSION_POR_DEFECTO:
   * no; ver arriba por qué). Se fija al crear el procesador.
   */
  fusion?: boolean;
  /** Borde por color en la franja del contorno (por defecto, sí). */
  mate?: boolean;
  onFrameProcessed?: (stats: EstadisticasDeCuadro) => void;
};

const CACHE_DE_MODELOS = "maven-fondo-modelos-v1";

/**
 * Baja un modelo guardándolo en el Cache Storage: la primera llamada lo baja
 * (de fondo, sin apuro), las siguientes lo leen del disco al instante. Sin
 * Cache Storage (contexto no seguro), se baja igual.
 */
async function bajarModeloConCache(url: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try { cache = await caches.open(CACHE_DE_MODELOS); } catch { cache = undefined; }
  const guardado = await cache?.match(url).catch(() => undefined);
  if (guardado?.ok) return new Uint8Array(await guardado.arrayBuffer());
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fondo-fino: el modelo respondió ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  await cache?.put(url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } })).catch(() => undefined);
  return bytes;
}

function soportaTransformador(): boolean {
  try {
    return (
      typeof OffscreenCanvas !== "undefined" &&
      typeof VideoFrame !== "undefined" &&
      typeof createImageBitmap !== "undefined" &&
      typeof document !== "undefined" &&
      !!document.createElement("canvas").getContext("webgl2")
    );
  } catch {
    return false;
  }
}

async function cargarImagen(url: string): Promise<ImageBitmap> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("fondo-fino: no carga la imagen"));
    img.src = url;
  });
  return createImageBitmap(img);
}

export class TransformadorFondoFino implements VideoTrackTransformer<OpcionesFondoFino> {
  static get isSupported() {
    return soportaTransformador();
  }

  transformer?: TransformStream;
  options: OpcionesFondoFino;
  canvas?: OffscreenCanvas | HTMLCanvasElement;
  inputVideo?: HTMLVideoElement;

  private pipeline?: PipelineFondo;
  private segmentador?: vision.ImageSegmenter;
  private imagen: { url: string; bitmap: ImageBitmap } | null = null;
  private cuadro = 0;
  private ultimoTs = 0;
  private apagado = false;
  private segmentacionMs = 0;
  // El multiclase de ayuda: se carga de fondo; mientras no esté, no se usa.
  private fino?: vision.ImageSegmenter;
  private ultimoTsFino = 0;
  private generacion = 0;

  constructor(opciones: OpcionesFondoFino) {
    this.options = { ...opciones };
  }

  async init({ outputCanvas, inputElement }: VideoTransformerInitOptions): Promise<void> {
    if (!(inputElement instanceof HTMLVideoElement)) {
      throw new TypeError("fondo-fino: necesita un <video> de entrada");
    }
    this.inputVideo = inputElement;
    this.canvas = outputCanvas;
    this.transformer = new TransformStream({
      transform: (frame, controller) => this.transform(frame, controller),
    });
    // Primero NUESTRO contexto WebGL (si falla, el enganche falla y la llamada
    // sigue sin fondo, avisando: ver el catch de useLiveKit). Después MediaPipe
    // pide el mismo contexto al mismo canvas.
    this.pipeline = crearPipelineFondo(outputCanvas);
    this.segmentador = await this.crearSegmentador(outputCanvas);
    this.apagado = false;
    this.cuadro = 0;
    this.cargarFinoDeFondo(outputCanvas);
    if (this.options.imagePath) {
      await this.cargarFondo(this.options.imagePath).catch((e) => console.warn("[fondo] imagen:", e));
    }
  }

  private modelo() {
    return MODELOS[this.options.modelo ?? MODELO_POR_DEFECTO];
  }

  private usaFusion(): boolean {
    // Si el principal ya es el multiclase, no tiene sentido sumarlo otra vez.
    if ((this.options.modelo ?? MODELO_POR_DEFECTO) === "multiclase") return false;
    return this.options.fusion ?? FUSION_POR_DEFECTO;
  }

  /**
   * Baja (o saca del caché) el multiclase y lo prepara, SIN esperar: el fondo ya
   * funciona con el liviano. Si falla (sin internet, sin GPU), sigue sin él.
   */
  private cargarFinoDeFondo(canvas: OffscreenCanvas | HTMLCanvasElement) {
    if (!this.usaFusion()) return;
    const gen = ++this.generacion;
    void (async () => {
      try {
        const bytes = await bajarModeloConCache(MODELOS.multiclase.url);
        if (gen !== this.generacion || this.apagado) return;
        const archivos = await vision.FilesetResolver.forVisionTasks(WASM_MEDIAPIPE);
        const fino = await vision.ImageSegmenter.createFromOptions(archivos, {
          // Solo en la GPU: en la CPU cuesta demasiado para ser una ayuda.
          baseOptions: { modelAssetBuffer: bytes, delegate: "GPU" },
          canvas,
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (gen !== this.generacion || this.apagado) { fino.close(); return; }
        this.fino = fino;
      } catch (e) {
        console.warn("[fondo] el multiclase de ayuda no cargó, sigue el liviano solo:", e);
      }
    })();
  }

  private cerrarFino() {
    this.generacion++;
    try { this.fino?.close(); } catch { /* ya cerrado */ }
    this.fino = undefined;
    this.pipeline?.olvidarFina();
  }

  private async crearSegmentador(canvas: OffscreenCanvas | HTMLCanvasElement) {
    const archivos = await vision.FilesetResolver.forVisionTasks(WASM_MEDIAPIPE);
    const crear = (delegate: "GPU" | "CPU") =>
      vision.ImageSegmenter.createFromOptions(archivos, {
        baseOptions: { modelAssetPath: this.modelo().url, delegate },
        canvas,
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    try {
      return await crear("GPU");
    } catch (e) {
      // Sin GPU usable (driver viejo, bloqueada): la CPU es más lenta pero sirve.
      console.warn("[fondo] detector en GPU no disponible, se usa la CPU:", e);
      return crear("CPU");
    }
  }

  async restart({ outputCanvas, inputElement }: VideoTransformerInitOptions) {
    // Cambió la cámara: contexto nuevo sobre el canvas nuevo. El detector va
    // atado al canvas viejo, así que se rehace también.
    this.cerrarFino();
    this.pipeline?.destruir();
    this.segmentador?.close();
    this.segmentador = undefined;
    this.canvas = outputCanvas;
    this.inputVideo = inputElement;
    this.pipeline = crearPipelineFondo(outputCanvas);
    this.segmentador = await this.crearSegmentador(outputCanvas);
    if (this.imagen) this.pipeline.ponerImagen(this.imagen.bitmap);
    this.apagado = false;
    this.cuadro = 0;
    this.cargarFinoDeFondo(outputCanvas);
  }

  async destroy(_opciones?: TrackTransformerDestroyOptions) {
    this.apagado = true;
    this.cerrarFino();
    try { this.segmentador?.close(); } catch { /* ya cerrado */ }
    this.segmentador = undefined;
    try { this.pipeline?.destruir(); } catch { /* contexto perdido */ }
    this.pipeline = undefined;
    this.imagen?.bitmap.close();
    this.imagen = null;
    this.canvas = undefined;
  }

  private async cargarFondo(url: string) {
    if (this.imagen?.url !== url) {
      const bitmap = await cargarImagen(url);
      this.imagen?.bitmap.close();
      this.imagen = { url, bitmap };
    }
    this.pipeline?.ponerImagen(this.imagen.bitmap);
  }

  async update(opciones: OpcionesFondoFino) {
    // La imagen se carga ANTES de cambiar de modo: mientras baja se sigue viendo
    // el efecto anterior, nunca un cuadro sin fondo. Si no carga, se lanza y el
    // modo no cambia (quien llama avisa).
    if (opciones.imagePath) {
      await this.cargarFondo(opciones.imagePath);
    }
    this.options = { ...this.options, ...opciones };
  }

  private modo(): "borroso" | "imagen" | null {
    const o = this.options;
    if (o.backgroundDisabled) return null;
    if (typeof o.blurRadius === "number" && o.blurRadius > 0) return "borroso";
    if (typeof o.imagePath === "string" && this.imagen?.url === o.imagePath) return "imagen";
    return null;
  }

  async transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    let entregado = false;
    try {
      if (!(frame instanceof VideoFrame) || frame.codedWidth === 0 || frame.codedHeight === 0) return;
      const modo = this.modo();
      if (this.apagado || !modo || !this.pipeline || !this.canvas) {
        // Sin efecto pedido: el cuadro pasa tal cual (cero costo).
        controller.enqueue(frame);
        entregado = true;
        return;
      }
      const w = frame.displayWidth;
      const h = frame.displayHeight;
      this.pipeline.ajustarTamano(w, h);

      const t0 = performance.now();
      const cadaCuantos = Math.max(1, this.options.cadaCuantos ?? 1);
      if (this.segmentador && this.cuadro % cadaCuantos === 0) {
        const modelo = this.modelo();
        // VIDEO exige marcas de tiempo crecientes.
        const ts = Math.max(performance.now(), this.ultimoTs + 1);
        this.ultimoTs = ts;
        // Sincrónico: la máscara solo vale DENTRO del callback, ahí se copia.
        this.segmentador.segmentForVideo(frame, ts, (resultado) => {
          const mascara = resultado.confidenceMasks?.[modelo.mascara];
          if (mascara) this.pipeline?.actualizarMascara(mascara.getAsWebGLTexture(), modelo.invertir, cadaCuantos);
          resultado.close();
        });
        this.segmentacionMs = performance.now() - t0;
      }
      if (this.fino && tocaMulticlase(this.cuadro)) {
        const ts = Math.max(performance.now(), this.ultimoTsFino + 1);
        this.ultimoTsFino = ts;
        try {
          this.fino.segmentForVideo(frame, ts, (resultado) => {
            // Máscara 0 = fondo; la pasada la invierte a «persona».
            const mascara = resultado.confidenceMasks?.[0];
            if (mascara) this.pipeline?.actualizarFina(mascara.getAsWebGLTexture());
            resultado.close();
          });
        } catch (e) {
          // Una ayuda que falla no puede tumbar el fondo: se apaga y listo.
          console.warn("[fondo] el multiclase falló, sigue el liviano solo:", e);
          this.cerrarFino();
        }
        this.segmentacionMs = performance.now() - t0;
      }
      this.cuadro++;
      const t1 = performance.now();
      this.pipeline.dibujar(frame, modo, this.options.blurRadius ?? 0, this.options.mate ?? true);
      const nuevo = new VideoFrame(this.canvas, { timestamp: frame.timestamp ?? 0 });
      controller.enqueue(nuevo);
      const filtroMs = performance.now() - t1;
      this.options.onFrameProcessed?.({
        processingTimeMs: this.segmentacionMs + filtroMs,
        segmentationTimeMs: this.segmentacionMs,
        filterTimeMs: filtroMs,
      });
    } catch (e) {
      // Igual que el paquete viejo: el cuadro se descarta (nunca se manda la
      // cámara cruda: la persona cree que tiene el fondo puesto).
      console.error("[fondo] error procesando un cuadro:", e);
    } finally {
      if (!entregado) frame.close();
    }
  }
}

// ── El envoltorio, con la misma API que el paquete viejo ─────────────────────

export type OpcionesDeCambio =
  | { mode: "disabled" }
  | { mode: "background-blur"; blurRadius?: number }
  | { mode: "virtual-background"; imagePath: string };

export class ProcesadorFondoFino extends ProcessorWrapper<OpcionesFondoFino, TransformadorFondoFino> {
  get mode(): OpcionesDeCambio["mode"] {
    const o = this.transformer.options;
    if (o.backgroundDisabled) return "disabled";
    if (typeof o.blurRadius === "number") return "background-blur";
    if (typeof o.imagePath === "string") return "virtual-background";
    return "disabled";
  }

  async switchTo(opciones: OpcionesDeCambio) {
    switch (opciones.mode) {
      case "background-blur":
        await this.updateTransformerOptions({ imagePath: undefined, blurRadius: opciones.blurRadius ?? RADIO_DE_BLUR.blur, backgroundDisabled: false });
        break;
      case "virtual-background":
        await this.updateTransformerOptions({ imagePath: opciones.imagePath, blurRadius: undefined, backgroundDisabled: false });
        break;
      case "disabled":
        await this.updateTransformerOptions({ backgroundDisabled: true });
        break;
    }
  }
}

/** ¿Este navegador puede poner fondos? (WebGL2 + VideoFrame + un camino de pistas). */
// ── La primera vez (17/11/2026) ─────────────────────────────────────────────
// El detector baja ~9,4 MB de WASM (jsdelivr) + el modelo (~250 KB) la PRIMERA
// vez en cada navegador o app. Con 5–10 Mbps eso son 8–15 s, y poner el fondo
// tenía un tope de 6 s: en la app de computador (caché nueva) el desenfoque
// fallaba SIEMPRE («no me deja poner el blur», Alvaro). Ahora:
//  · precalentarFondo() baja esos archivos una vez (quedan en la caché HTTP) y
//    avisa cuando están;
//  · mientras no estén, el tope para poner el fondo es largo (TOPE_PRIMERA_CARGA_MS).
export const TOPE_PRIMERA_CARGA_MS = 45_000;
const ARCHIVOS_DEL_DETECTOR = [
  `${WASM_MEDIAPIPE}/vision_wasm_internal.js`,
  `${WASM_MEDIAPIPE}/vision_wasm_internal.wasm`,
];
let precalentado: Promise<boolean> | null = null;
let listo = false;

/** Baja (una vez) el WASM y el modelo del detector. Nunca falla: si no puede, dice false y se vuelve a intentar la próxima vez. */
export function precalentarFondo(modelo: ModeloDeFondo = MODELO_POR_DEFECTO): Promise<boolean> {
  if (listo) return Promise.resolve(true);
  if (precalentado) return precalentado;
  precalentado = Promise.all(
    [...ARCHIVOS_DEL_DETECTOR, MODELOS[modelo].url].map(async (url) => {
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) throw new Error(`fondo-fino: ${r.status} ${url}`);
      await r.arrayBuffer();
    }),
  ).then(
    () => { listo = true; return true; },
    (e) => { console.warn("[fondo] no se pudo precalentar:", e); precalentado = null; return false; },
  );
  return precalentado;
}

/** ¿Ya están en la caché el WASM y el modelo? */
export function fondoPrecalentado(): boolean {
  return listo;
}

/** El tope para poner el fondo: el de siempre si ya está todo bajado; largo si es la primera vez. */
export function topeParaPonerFondo(normalMs: number): number {
  return listo ? normalMs : Math.max(normalMs, TOPE_PRIMERA_CARGA_MS);
}

export function soportaProcesadorDeFondo(): boolean {
  return TransformadorFondoFino.isSupported && ProcessorWrapper.isSupported;
}

/**
 * Crea el procesador. Igual que el paquete viejo: arranca en el modo pedido y
 * después se cambia con `switchTo` sin cortar el video.
 */
export function ProcesadorDeFondo(
  opciones: OpcionesDeCambio & Pick<OpcionesFondoFino, "modelo" | "cadaCuantos" | "fusion" | "mate" | "onFrameProcessed"> & ProcessorWrapperOptions,
  nombre = "background-processor",
): ProcesadorFondoFino {
  if (!TransformadorFondoFino.isSupported) throw new Error("fondo-fino: el navegador no soporta el procesador");
  if (!ProcessorWrapper.isSupported) throw new Error("fondo-fino: el navegador no puede procesar pistas");
  const base: OpcionesFondoFino = {
    modelo: opciones.modelo,
    fusion: opciones.fusion,
    mate: opciones.mate,
    cadaCuantos: opciones.cadaCuantos ?? cadaCuantosCuadrosSegmentar(),
    onFrameProcessed: opciones.onFrameProcessed,
  };
  if (opciones.mode === "background-blur") base.blurRadius = opciones.blurRadius ?? RADIO_DE_BLUR.blur;
  else if (opciones.mode === "virtual-background") base.imagePath = opciones.imagePath;
  else base.backgroundDisabled = true;
  return new ProcesadorFondoFino(new TransformadorFondoFino(base), nombre, { maxFps: opciones.maxFps });
}
