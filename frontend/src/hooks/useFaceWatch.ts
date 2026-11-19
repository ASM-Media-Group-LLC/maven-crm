import { useEffect, useRef, useState } from "react";
import { estaEnLlamadaDeMaven } from "@/lib/llamadaEnMaven";
import { supabase } from "@/integrations/supabase/client";
import {
  MUESTRAS_PARA_SOSPECHAR, tocaPreguntar, estadoConfirmado, type RespuestaIA,
} from "@/lib/caraConfirmada";
import {
  ANCHO_MUESTRA, analizarCuadro, crearDetector, recorteDelZoom,
  type DetectorDeCaras, type LecturaDeCuadro, type PedidoAlHilo, type RespuestaDelHilo,
} from "@/lib/detectorDeCaras";
import { lienzoAJpegBase64 } from "@/lib/jpegSinTrabas";

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
// COSTO: una muestra cada pocos segundos sobre un canvas de 192px, en un HILO
// APARTE (18/11/2026, ver lib/detectorDeCaras.ts) para no trabar la llamada. El modelo
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
// Si el hilo no contesta en este tiempo (la primera vez carga el WASM y el
// modelo), ese muestreo se da por perdido: no cambia el estado.
const ESPERA_DEL_HILO_MS = 30_000;

// ── El detector corre en un HILO APARTE (lib/detectorDeCaras.ts: por qué) ──
// Uno solo para toda la pestaña. Si el navegador no deja abrirlo, o se cae, se
// usa el detector en el hilo principal como antes: la supervisión no se pierde.
let hilo: Worker | null = null;
let hiloRoto = false;
let siguienteId = 0;
const esperando = new Map<number, (r: RespuestaDelHilo | null) => void>();

function abrirHilo(): Worker | null {
  if (hilo || hiloRoto) return hilo;
  if (typeof Worker === "undefined" || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    hiloRoto = true;
    return null;
  }
  try {
    // Worker CLÁSICO, no de módulo: MediaPipe necesita importScripts().
    hilo = new Worker(new URL("../workers/detectorDeCaras.worker.ts", import.meta.url));
    hilo.onmessage = (e: MessageEvent<RespuestaDelHilo>) => {
      const fin = esperando.get(e.data.id);
      if (fin) { esperando.delete(e.data.id); fin(e.data); }
    };
    hilo.onerror = (e) => {
      console.error("[encuadre] el hilo del detector falló; sigue en el hilo principal", e);
      hiloRoto = true;
      try { hilo?.terminate(); } catch { /* noop */ }
      hilo = null;
      for (const fin of esperando.values()) fin(null);
      esperando.clear();
    };
  } catch (e) {
    console.error("[encuadre] no se pudo abrir el hilo del detector; sigue en el hilo principal", e);
    hiloRoto = true;
    hilo = null;
  }
  return hilo;
}

/** null = el hilo no sirvió (se usa el respaldo); "perdido" = no contestó a tiempo. */
async function leerEnElHilo(video: HTMLVideoElement, w: number, h: number): Promise<RespuestaDelHilo | "perdido" | null> {
  const h1 = abrirHilo();
  if (!h1) return null;
  // createImageBitmap reduce el cuadro sin bloquear y el bitmap viaja al hilo
  // sin copiarse (transferible).
  const [sx, sy, sw, sh] = recorteDelZoom(video.videoWidth, video.videoHeight);
  const opciones: ImageBitmapOptions = { resizeWidth: w, resizeHeight: h, resizeQuality: "low" };
  const [completo, zoom] = await Promise.all([
    createImageBitmap(video, opciones),
    createImageBitmap(video, sx, sy, sw, sh, opciones),
  ]);
  if (!hilo) { completo.close(); zoom.close(); return null; }
  const id = ++siguienteId;
  return await new Promise((resolve) => {
    const reloj = window.setTimeout(() => { esperando.delete(id); resolve("perdido"); }, ESPERA_DEL_HILO_MS);
    esperando.set(id, (r) => { window.clearTimeout(reloj); resolve(r); });
    const pedido: PedidoAlHilo = { id, completo, zoom, w, h };
    hilo!.postMessage(pedido, [completo, zoom]);
  });
}

// Respaldo en el hilo principal (navegadores sin workers / hilo caído).
let detectorPromise: Promise<DetectorDeCaras | null> | null = null;
function getDetector(): Promise<DetectorDeCaras | null> {
  if (!detectorPromise) detectorPromise = crearDetector(() => import("@mediapipe/tasks-vision"));
  return detectorPromise;
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
    // Muestras seguidas sin cara, y lo último que dijo la IA (lib/caraConfirmada).
    let seguidasSinCara = 0;
    let ultimaIA: RespuestaIA | null = null;
    let iaEnVuelo = false;
    const preguntarIA = async () => {
      iaEnVuelo = true;
      try {
        const foto = document.createElement("canvas");
        const fw = Math.min(640, video.videoWidth);
        foto.width = fw;
        foto.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * fw));
        foto.getContext("2d")?.drawImage(video, 0, 0, foto.width, foto.height);
        // toBlob y no toDataURL: el JPEG se codifica fuera del hilo principal.
        const imagen = (await lienzoAJpegBase64(foto, 0.6)) ?? "";
        const { data, error } = await supabase.functions.invoke("argos-cara", { body: { imagen } });
        const persona = !error && typeof (data as { persona?: unknown } | null)?.persona === "boolean"
          ? (data as { persona: boolean }).persona : null;
        ultimaIA = { persona, en: Date.now() };
      } catch {
        ultimaIA = { persona: null, en: Date.now() };
      } finally {
        iaEnVuelo = false;
      }
    };
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
    // Lienzos del respaldo (hilo principal), creados una sola vez.
    let canvas: HTMLCanvasElement | null = null;
    let zoomCanvas: HTMLCanvasElement | null = null;
    const leerAqui = async (w: number, h: number): Promise<LecturaDeCuadro | "sin_detector"> => {
      const detector = await getDetector();
      if (!detector) return "sin_detector";
      canvas ??= document.createElement("canvas");
      zoomCanvas ??= document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("sin lienzo");
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      // Segunda pasada con ZOOM al centro (ver analizarCuadro).
      zoomCanvas.width = w; zoomCanvas.height = h;
      zoomCanvas.getContext("2d")?.drawImage(video, ...recorteDelZoom(video.videoWidth, video.videoHeight), 0, 0, w, h);
      return analizarCuadro(detector, canvas, zoomCanvas, ctx, w, h);
    };

    // Un muestreo a la vez: si el anterior sigue esperando al hilo, este se salta.
    let enCurso = false;
    const sample = async () => {
      if (cancelled || enCurso) return;
      // En una llamada de Maven (Messenger, Meet, 1:1) ni se carga ni se evalúa
      // el detector: los avisos de encuadre están silenciados de todas formas en
      // ese caso (useFaceNudge), así que sería gastar un pipeline WASM entero
      // para un aviso que no va a sonar — y arrancarlo mientras la otra pestaña
      // ya corre su video con WebGL es exactamente el momento del crash. El
      // muestreo sigue latiendo cada 3 s: al colgar la llamada retoma solo.
      if (estaEnLlamadaDeMaven()) return;
      enCurso = true;
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
        const w = ANCHO_MUESTRA;
        const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));

        // Primero el hilo aparte; si no sirve, el detector aquí, como antes.
        let lectura: LecturaDeCuadro | "sin_detector" | null = null;
        const delHilo = await leerEnElHilo(video, w, h).catch(() => null);
        if (cancelled || delHilo === "perdido") return;
        if (delHilo?.tipo === "lectura") lectura = delHilo.lectura;
        else if (delHilo?.tipo === "fallo") return; // un cuadro que falla: al siguiente
        else {
          // Sin hilo, o el hilo no pudo cargar el detector: se prueba aquí antes
          // de rendirse, para no perder la supervisión por culpa del hilo.
          if (delHilo?.tipo === "sin_detector") { hiloRoto = true; hilo?.terminate(); hilo = null; }
          lectura = await leerAqui(w, h);
        }
        if (cancelled) return;
        if (lectura === "sin_detector") {
          setState("unavailable");
          return; // sin detector no hay nada que mejore solo
        }
        const local = clasificarCuadro(lectura);
        // El detector solo SOSPECHA; «no_face» sale si la IA lo confirma.
        seguidasSinCara = local === "no_face" ? seguidasSinCara + 1 : 0;
        if (local !== "no_face") ultimaIA = null;
        const sospecha = seguidasSinCara >= MUESTRAS_PARA_SOSPECHAR;
        if (tocaPreguntar(sospecha, ultimaIA, iaEnVuelo, Date.now())) void preguntarIA();
        setState(estadoConfirmado(sospecha ? local : (local === "no_face" ? "ok" : local), ultimaIA, Date.now()));
      } catch {
        /* un frame que falla no cambia el estado: se reintenta al siguiente */
      } finally {
        enCurso = false;
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
