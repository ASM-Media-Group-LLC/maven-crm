// Hilo aparte del detector de encuadre (ver lib/detectorDeCaras.ts: por qué).
//
// Es un worker CLÁSICO a propósito: MediaPipe carga su WASM con importScripts(),
// que no existe en los workers de módulo. useFaceWatch le manda dos ImageBitmap
// ya reducidos (la cámara entera y el centro ampliado) y recibe la lectura.
import * as vision from "@mediapipe/tasks-vision";
import {
  analizarCuadro, crearDetector,
  type DetectorDeCaras, type PedidoAlHilo, type RespuestaDelHilo,
} from "@/lib/detectorDeCaras";

const hilo = self as unknown as {
  onmessage: ((e: MessageEvent<PedidoAlHilo>) => void) | null;
  postMessage: (m: RespuestaDelHilo) => void;
};

let detector: Promise<DetectorDeCaras | null> | null = null;
let lienzo: OffscreenCanvas | null = null;

hilo.onmessage = async (e) => {
  const { id, completo, zoom, w, h } = e.data;
  try {
    detector ??= crearDetector(async () => vision);
    const d = await detector;
    if (!d) { hilo.postMessage({ id, tipo: "sin_detector" }); return; }
    if (!lienzo || lienzo.width !== w || lienzo.height !== h) lienzo = new OffscreenCanvas(w, h);
    const ctx = lienzo.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) { hilo.postMessage({ id, tipo: "fallo" }); return; }
    hilo.postMessage({ id, tipo: "lectura", lectura: analizarCuadro(d, completo, zoom, ctx, w, h) });
  } catch {
    hilo.postMessage({ id, tipo: "fallo" });
  } finally {
    completo.close();
    zoom.close();
  }
};
