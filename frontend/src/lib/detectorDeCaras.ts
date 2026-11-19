// El detector de caras (BlazeFace) y el análisis de UN cuadro, sin React.
//
// Lo usan dos lugares: el hilo aparte (workers/detectorDeCaras.worker.ts), que
// es el camino normal, y useFaceWatch como respaldo cuando el navegador no deja
// abrir hilos. Por eso aquí no hay nada de React ni de Supabase.
//
// POR QUÉ UN HILO APARTE (18/11/2026): la medición de llamadas (llamada_salud →
// trabas) mostró que el muestreo de encuadre era el mayor culpable de trabas del
// código propio: «index.js:y» = el `sample` de useFaceWatch, 150–230 ms en
// promedio cada 3 s y picos de 3 a 16 s (cargar el WASM). En un Mac sin carga
// el mismo cuadro tarda ~10 ms: lo caro en los equipos del piso es que MediaPipe
// sube el cuadro a WebGL y lo vuelve a leer mientras la llamada usa la GPU.
// Fuera del hilo principal, esa espera ya no congela la pantalla ni el audio.

export const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
// ⚠️ OJO: esta URL YA SE ROMPIÓ UNA VEZ. Estuvo apuntando a
// `.../float16/1/blaze_face_short_range.task` y Google cambió la extensión a
// `.tflite`: devolvía 404, el detector nunca se creaba y —como el error se
// tragaba -- el supervisor de encuadre estuvo MUERTO sin que nadie se enterara.
// Nadie reportó "falla el supervisor"; se reportó "no me dice nada".
// Si vuelve a pasar, la consola ahora lo grita (ver crearDetector).
export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

/** Ancho del cuadro que se analiza: BlazeFace corto trabaja con entradas chicas. */
export const ANCHO_MUESTRA = 192;
// Luminancia media (0-255) por debajo de la cual la imagen es una sombra.
const MIN_BRIGHTNESS = 24;

/** Lo que sale de mirar un cuadro; useFaceWatch lo convierte en estado. */
export interface LecturaDeCuadro {
  oscuro: boolean;
  hayCara: boolean;
  ratio: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DetectorDeCaras = any;

type MediaPipeVision = typeof import("@mediapipe/tasks-vision");

/** `cargarVision` lo pone quien llama: el hilo importa MediaPipe directo (un
 *  worker clásico no puede partirse en pedazos) y el respaldo lo pide bajo
 *  demanda para no sumarlo al arranque de la página. */
export async function crearDetector(cargarVision: () => Promise<MediaPipeVision>): Promise<DetectorDeCaras | null> {
  try {
    const vision = await cargarVision();
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    // CPU, no GPU — a propósito (02/09/2026, crash reportado por Grace).
    //
    // Chrome pone las pestañas del MISMO sitio en el MISMO proceso: la del
    // Meet (/call/...) y la de Cowork comparten renderer. Con delegate GPU,
    // arrancar este detector (WASM + WebGL) en la pestaña de Cowork mientras
    // la del Meet ya tiene su propio pipeline de video con WebGL (el fondo
    // borroso también es MediaPipe) tumbaba el proceso entero — SIGSEGV,
    // "No se puede abrir esta página · código 11" — y la persona salía de la
    // llamada sin haber tocado nada en esa pestaña.
    //
    // El modelo es BlazeFace short-range sobre un cuadro de 192px, una vez
    // cada 3 segundos: en CPU sobra, y saca a MediaPipe de la pelea por la
    // GPU. Si algún día hace falta más, medir antes de volver a GPU.
    return await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      runningMode: "IMAGE",
      // 0.35 y no 0.5 (17/11/2026): con audífonos, de lado o con luz detrás la
      // confianza baja y se perdían caras de gente que estaba ahí.
      minDetectionConfidence: 0.35,
    });
  } catch (e) {
    // NO se traga el error en silencio. La versión anterior hacía
    // `catch { return null }` y eso convirtió un 404 de una URL externa en
    // una función que simplemente no existía: el chatter creía que lo
    // estaban supervisando y el coordinador creía que le iban a avisar.
    // Un aviso que nunca llega es peor que no tener aviso.
    console.error(
      "[encuadre] no se pudo cargar el detector de rostros: el supervisor NO va a avisar. " +
      "Revisar que respondan 200:\n  " + WASM_BASE + "\n  " + MODEL_URL,
      e,
    );
    return null;
  }
}

function averageBrightness(data: Uint8ClampedArray): number {
  let sum = 0;
  // Un pixel de cada 16: alcanza para saber si está a oscuras y cuesta 16x menos.
  for (let i = 0; i < data.length; i += 64) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / 64);
}

type Lienzo2D = { getImageData: (x: number, y: number, w: number, h: number) => ImageData; drawImage: (img: CanvasImageSource, x: number, y: number) => void };

/**
 * Mira un cuadro ya reducido a ANCHO_MUESTRA. `completo` es la cámara entera y
 * `zoom` el centro ampliado (o null). `lienzo` es un 2D del mismo tamaño para
 * leer la luz. Lanza si el cuadro no se puede leer: quien llama lo ignora.
 */
export function analizarCuadro(
  detector: DetectorDeCaras,
  completo: CanvasImageSource,
  zoom: CanvasImageSource | null,
  lienzo: Lienzo2D,
  w: number,
  h: number,
): LecturaDeCuadro {
  lienzo.drawImage(completo, 0, 0);
  const oscuro = averageBrightness(lienzo.getImageData(0, 0, w, h).data) < MIN_BRIGHTNESS;

  // Antes, con poca luz, se decía "too_dark" y NO se buscaba la cara. Eso
  // mezclaba dos cosas distintas (Jhon, 07/09): la persona está pero con
  // mala luz —alerta de encuadre, el reloj sigue— y la imagen es negra y
  // no se ve a NADIE —es "fuera de cámara", el reloj se detiene—. Ahora
  // la cara se busca siempre; la oscuridad solo califica el resultado.
  let caras = detector.detect(completo)?.detections ?? [];
  // Segunda pasada con ZOOM al centro: el modelo es de distancia corta y
  // una persona un poco lejos le queda chica en el cuadro entero.
  if (!caras.length && zoom) caras = detector.detect(zoom)?.detections ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mayor = caras.length ? caras.reduce((best: any, d: any) => {
    const area = (d.boundingBox?.width ?? 0) * (d.boundingBox?.height ?? 0);
    const bestArea = (best?.boundingBox?.width ?? 0) * (best?.boundingBox?.height ?? 0);
    return area > bestArea ? d : best;
  }, caras[0]) : null;
  const bb = mayor?.boundingBox;
  const ratio = mayor ? ((bb?.width ?? 0) * (bb?.height ?? 0)) / (w * h) : 0;
  return { oscuro, hayCara: !!mayor, ratio };
}

/** Recorte del ZOOM al centro, en pixeles del video original. */
export function recorteDelZoom(anchoVideo: number, altoVideo: number): [number, number, number, number] {
  return [anchoVideo * 0.2, altoVideo * 0.1, anchoVideo * 0.6, altoVideo * 0.6];
}

// Mensajes entre useFaceWatch y el hilo.
export interface PedidoAlHilo {
  id: number;
  completo: ImageBitmap;
  zoom: ImageBitmap;
  w: number;
  h: number;
}
export type RespuestaDelHilo =
  | { id: number; tipo: "lectura"; lectura: LecturaDeCuadro }
  | { id: number; tipo: "sin_detector" }
  | { id: number; tipo: "fallo" };
