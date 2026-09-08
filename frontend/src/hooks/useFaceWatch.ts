import { useEffect, useRef, useState } from "react";
import { estaEnLlamadaDeMaven } from "@/lib/llamadaEnMaven";

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
const MAX_SIN_CUADROS = 5;
// Debajo de esto la cara ocupa tan poco cuadro que no sirve para supervisar.
const MIN_FACE_RATIO = 0.035;
// Luminancia media (0-255) por debajo de la cual la imagen es una sombra.
const MIN_BRIGHTNESS = 24;

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
// ⚠️ OJO: esta URL YA SE ROMPIÓ UNA VEZ. Estuvo apuntando a
// `.../float16/1/blaze_face_short_range.task` y Google cambió la extensión a
// `.tflite`: devolvía 404, el detector nunca se creaba y —como el error se
// tragaba -- el supervisor de encuadre estuvo MUERTO sin que nadie se enterara.
// Nadie reportó "falla el supervisor"; se reportó "no me dice nada".
// Si vuelve a pasar, la consola ahora lo grita (ver getDetector).
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

// Un solo detector para toda la pestaña: cargarlo es lo caro, usarlo no.
let detectorPromise: Promise<any | null> | null = null;

async function getDetector(): Promise<any | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
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
          minDetectionConfidence: 0.5,
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

/** Qué decir de un cuadro. Puro, para poder probarlo sin cámara.
 *  - oscuro y SIN cara → "no_face": no se ve a nadie (el reloj se detiene).
 *  - oscuro y CON cara → "too_dark": está, pero con mala luz (solo alerta).
 *  - claro y sin cara → "no_face"; con cara chica → "too_small"; si no → "ok". */
export function clasificarCuadro(c: { oscuro: boolean; hayCara: boolean; ratio: number }): FaceState {
  if (!c.hayCara) return "no_face";
  if (c.oscuro) return "too_dark";
  return c.ratio < MIN_FACE_RATIO ? "too_small" : "ok";
}

export function useFaceWatch(track: MediaStreamTrack | null, enabled: boolean): FaceWatch {
  const [watch, setWatch] = useState<FaceWatch>({ state: "cam_off", since: Date.now() });
  const stateRef = useRef<FaceState>("cam_off");

  useEffect(() => {
    // Cambiamos `since` SOLO cuando el estado cambia de verdad: es lo que permite
    // decir "sin rostro hace 2 minutos" en vez de "hace 3 segundos" para siempre.
    const setState = (next: FaceState) => {
      if (stateRef.current === next) return;
      stateRef.current = next;
      setWatch({ state: next, since: Date.now() });
    };

    // Apagar la cámara deshabilita el muestreo, pero ANTES esto hacía `return`
    // sin tocar el estado: quedaba reportando el último valor conocido, así que
    // el coordinador seguía viendo "ok" con la cámara apagada. Ahora se dice.
    if (!enabled) {
      setState("cam_off");
      return;
    }

    // Y al VOLVER a encenderla hay que soltar el `cam_off` YA, sin esperar al
    // primer muestreo (que tarda hasta 3 s). Si no, el supervisor —que revisa
    // cada 5 s— alcanzaba a ver un `cam_off` con su `since` viejo y le
    // reclamaba a alguien que ya había encendido la cámara. Le pasó a Jhon
    // probando: "me llegó el aviso pero ya la tenía encendida".
    //
    // Se pone "ok" de arranque: es optimista por 3 segundos como mucho, y si
    // de verdad no hay nadie el propio muestreo lo corrige enseguida. Mentir
    // 3 segundos a favor de la persona es mejor que acusarla sin razón.
    if (stateRef.current === "cam_off") setState("ok");

    if (!track || track.readyState !== "live" || !track.enabled) {
      setState("cam_off");
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    // Cuántos muestreos seguidos sin poder ver un cuadro antes de admitir que
    // no se puede supervisar. 5 x 3 s = 15 s de gracia.
    let sinCuadros = 0;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    // play() NO es opcional: sin esto el elemento nunca decodifica cuadros y
    // `readyState` se queda en 0. Funcionaba de casualidad mientras la página
    // estaba montada; al pasar la llamada a la ventanita flotante dejaba de
    // recibir cuadros y el muestreo salía sin tocar el estado — o sea que se
    // quedaba clavado en el último problema y le reclamaba a alguien que estaba
    // perfectamente frente a la cámara.
    const asegurarReproduccion = () => { if (video.paused) video.play().catch(() => {}); };
    asegurarReproduccion();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const sample = async () => {
      if (cancelled || !ctx) return;
      // En una llamada de Maven (Messenger, Meet, 1:1) ni se carga ni se evalúa
      // el detector: los avisos de encuadre están silenciados de todas formas en
      // ese caso (useFaceNudge), así que sería gastar un pipeline WASM entero
      // para un aviso que no va a sonar — y arrancarlo mientras la otra pestaña
      // ya corre su video con WebGL es exactamente el momento del crash. El
      // muestreo sigue latiendo cada 3 s: al colgar la llamada retoma solo.
      if (estaEnLlamadaDeMaven()) return;
      const detector = await getDetector();
      if (cancelled) return;
      if (!detector) {
        setState("unavailable");
        return; // sin detector no reintentamos: no hay nada que mejore solo
      }
      try {
        if (video.readyState < 2 || !video.videoWidth) {
          asegurarReproduccion();
          // Si no se pueden ver cuadros por un rato, hay que DECIRLO en vez de
          // dejar el último problema colgado. "No puedo ver" no es lo mismo que
          // "no estás", y acusar a alguien de algo que no se puede comprobar es
          // la peor falla posible en una función de supervisión.
          if (++sinCuadros >= MAX_SIN_CUADROS) setState("unavailable");
          return;
        }
        sinCuadros = 0;
        // 192px de ancho: BlazeFace corto trabaja con entradas chicas y así el
        // muestreo no compite con el encoder de la llamada.
        const w = 192;
        const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);

        const frame = ctx.getImageData(0, 0, w, h);
        const oscuro = averageBrightness(frame.data) < MIN_BRIGHTNESS;

        // Antes, con poca luz, se decía "too_dark" y NO se buscaba la cara. Eso
        // mezclaba dos cosas distintas (Jhon, 07/09): la persona está pero con
        // mala luz —alerta de encuadre, el reloj sigue— y la imagen es negra y
        // no se ve a NADIE —es "fuera de cámara", el reloj se detiene—. Ahora
        // la cara se busca siempre; la oscuridad solo califica el resultado.
        const res = detector.detect(canvas);
        const caras = res?.detections ?? [];
        const mayor = caras.length ? caras.reduce((best: any, d: any) => {
          const area = (d.boundingBox?.width ?? 0) * (d.boundingBox?.height ?? 0);
          const bestArea = (best?.boundingBox?.width ?? 0) * (best?.boundingBox?.height ?? 0);
          return area > bestArea ? d : best;
        }, caras[0]) : null;
        const bb = mayor?.boundingBox;
        const ratio = mayor ? ((bb?.width ?? 0) * (bb?.height ?? 0)) / (w * h) : 0;
        setState(clasificarCuadro({ oscuro, hayCara: !!mayor, ratio }));
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
