import { useEffect, useRef, useState } from "react";

// Vigilancia de encuadre: ¿se le ve la cara a quien está en la llamada?
//
// PARA QUÉ: hoy el coordinador sabe si la cámara está prendida, pero no si
// enfrente hay alguien. Esto detecta el caso normal —se levantó y se olvidó, o
// quedó fuera de cuadro— NO a quien quiera hacer trampa: una foto frente a la
// cámara pasa el detector.
//
// DÓNDE CORRE: en el navegador de la propia persona, sobre su video local. En el
// dashboard del coordinador no serviría: ahí las miniaturas llegan en calidad
// baja (adaptiveStream) y analizar nueve a la vez le quemaría la CPU.
//
// COSTO: una muestra cada pocos segundos sobre un canvas de 192px. El modelo
// (BlazeFace corto, ~230 KB) se descarga de los mismos servidores de MediaPipe
// que ya usa el desenfoque de fondo.
//
// SI EL DETECTOR NO CARGA (red, CSP, navegador viejo) el estado queda en
// "unavailable" y nadie ve indicadores: degrada a lo que había antes.

export type FaceState =
  | "ok"          // se le ve la cara
  | "no_face"     // cámara prendida, nadie enfrente (o de espaldas / fuera de cuadro)
  | "too_small"   // está, pero muy lejos o cortado por el borde
  | "too_dark"    // la imagen está tan oscura que no se distingue
  | "cam_off"     // no hay video que mirar
  | "unavailable"; // no se pudo cargar el detector

export interface FaceWatch {
  state: FaceState;
  /** epoch ms del último CAMBIO de estado, para poder decir "hace 2 min". */
  since: number;
}

const SAMPLE_MS = 3000;
// Debajo de esto la cara ocupa tan poco cuadro que no sirve para supervisar.
const MIN_FACE_RATIO = 0.035;
// Luminancia media (0-255) por debajo de la cual la imagen es una sombra.
const MIN_BRIGHTNESS = 24;

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.task";

// Un solo detector para toda la pestaña: cargarlo es lo caro, usarlo no.
let detectorPromise: Promise<any | null> | null = null;

async function getDetector(): Promise<any | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        return await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.5,
        });
      } catch {
        return null;
      }
    })();
  }
  return detectorPromise;
}

function averageBrightness(data: Uint8ClampedArray): number {
  let sum = 0;
  // Un pixel de cada 16: alcanza para saber si está a oscuras y cuesta 16x menos.
  for (let i = 0; i < data.length; i += 64) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / 64);
}

export function useFaceWatch(track: MediaStreamTrack | null, enabled: boolean): FaceWatch {
  const [watch, setWatch] = useState<FaceWatch>({ state: "cam_off", since: Date.now() });
  const stateRef = useRef<FaceState>("cam_off");

  useEffect(() => {
    if (!enabled) return;

    // Cambiamos `since` SOLO cuando el estado cambia de verdad: es lo que permite
    // decir "sin rostro hace 2 minutos" en vez de "hace 3 segundos" para siempre.
    const setState = (next: FaceState) => {
      if (stateRef.current === next) return;
      stateRef.current = next;
      setWatch({ state: next, since: Date.now() });
    };

    if (!track || track.readyState !== "live" || !track.enabled) {
      setState("cam_off");
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const sample = async () => {
      if (cancelled || !ctx) return;
      const detector = await getDetector();
      if (cancelled) return;
      if (!detector) {
        setState("unavailable");
        return; // sin detector no reintentamos: no hay nada que mejore solo
      }
      try {
        if (video.readyState < 2 || !video.videoWidth) return;
        // 192px de ancho: BlazeFace corto trabaja con entradas chicas y así el
        // muestreo no compite con el encoder de la llamada.
        const w = 192;
        const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);

        const frame = ctx.getImageData(0, 0, w, h);
        if (averageBrightness(frame.data) < MIN_BRIGHTNESS) {
          setState("too_dark");
          return;
        }

        const res = detector.detect(canvas);
        const caras = res?.detections ?? [];
        if (!caras.length) {
          setState("no_face");
          return;
        }
        const mayor = caras.reduce((best: any, d: any) => {
          const area = (d.boundingBox?.width ?? 0) * (d.boundingBox?.height ?? 0);
          const bestArea = (best?.boundingBox?.width ?? 0) * (best?.boundingBox?.height ?? 0);
          return area > bestArea ? d : best;
        }, caras[0]);
        const bb = mayor.boundingBox;
        const ratio = ((bb?.width ?? 0) * (bb?.height ?? 0)) / (w * h);
        setState(ratio < MIN_FACE_RATIO ? "too_small" : "ok");
      } catch {
        /* un frame que falla no cambia el estado: se reintenta al siguiente */
      }
    };

    void video.play().catch(() => { /* algunos navegadores no lo necesitan */ });
    void sample();
    timer = window.setInterval(sample, SAMPLE_MS);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      try { video.pause(); } catch { /* noop */ }
      video.srcObject = null;
    };
  }, [track, enabled]);

  return watch;
}

/** Texto corto para mostrarle a la persona qué está pasando con su cámara. */
export function faceStateLabel(state: FaceState): string | null {
  switch (state) {
    case "no_face": return "No se te ve la cara";
    case "too_small": return "Te ves muy lejos o cortado";
    case "too_dark": return "Hay muy poca luz";
    default: return null;
  }
}
