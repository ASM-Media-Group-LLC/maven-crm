import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { huellaDeCanvas } from "@/lib/huellaPantalla";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useMonitorEstado } from "@/hooks/useMonitorEstado";
import type { FaceWatch, FaceState } from "@/hooks/useFaceWatch";
import { TIPO_POR_CARA } from "@/lib/monitorFaltas";
import { anotarPantallazo, tomarLosDeAfuera } from "@/lib/monitorLocal";
import { debePreguntarIA } from "@/lib/ojoDeIA";

// Monitor de cámara de RRHH (Álvaro, 30/10). Corre en el navegador de la propia
// persona, DENTRO de la llamada de Cowork (al lado de useFaceNudge), para que
// sobreviva a navegar por Maven (se muda a la ventanita flotante).
//
// Dos trabajos:
//  1) FALTAS GRATIS — reusa el estado de `useFaceWatch` (BlazeFace ya corriendo):
//     cámara apagada/tapada, se fue, cara incompleta. Si una se sostiene >20 s,
//     registra UNA falta (una por episodio). No cuesta IA.
//  2) OJO DE IA — cada ~2 min, si hay cámara y cara, saca un JPEG y lo manda al
//     edge `monitor-vision`, que juzga lo fino (celular/distraído/no mira),
//     registra la falta y guarda la captura. El edge decide; acá solo se envía.
//
// NUNCA monitorea admins (el dueño es admin): se corta acá y el edge lo revalida.

interface Params {
  track: MediaStreamTrack | null;
  camaraRealOn: boolean;
  faceWatch: FaceWatch;
  /** supervisorEncuadre && sala viva: solo true en una sala de Cowork activa. */
  activo: boolean;
  roomNombre: string | null;
  /** Track de PANTALLA compartida (solo Cowork, solo compu). Si viene, se guarda
   *  un pantallazo de la pantalla cada minuto, además del de la cámara. */
  trackPantalla?: MediaStreamTrack | null;
}

const UMBRAL_FALTA_MS = 20_000; // una mala postura sostenida >20 s cuenta como falta
const CHEQUEO_MS = 5_000; // cada cuánto se revisa la duración del estado
const LATIDO_MS = 60_000; // cada cuánto se deja el latido del rondín (monitor_rondas)
// Un pantallazo cada ~1 min a HORA ALEATORIA (modelo Hubstaff): no se sabe el
// momento exacto, para que no se pueda jugar. Promedio 1 min, entre 45 y 75 s
// (Alvaro, 13/11/2026: «cada minuto»; antes ~2 min, 90–150 s).
const CAPTURA_MIN_MS = 45_000;
const CAPTURA_RANGO_MS = 30_000;
const BUCKET_CAPTURAS = "monitor-capturas"; // buzón privado; luego se mueve al NAS

// Avísale a la persona que se le tomó un pantallazo (transparencia, como Hubstaff),
// una sola vez aunque corran dos capturadores a la vez (Cowork + app-wide).
let ultimoAvisoCaptura = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Saca un JPEG (base64 sin prefijo) del track local. null si no se pudo.
 *  `maxAncho`/`calidad`: la CÁMARA va chica (una cara se ve bien en 640); la
 *  PANTALLA va grande (1600) para que se lea el texto de los chats y las tabs. */
async function capturarJPEG(
  track: MediaStreamTrack,
  maxAncho = 640,
  calidad = 0.6,
  alHuella?: (huella: string | null) => void,
): Promise<string | null> {
  return await new Promise((resolve) => {
    let listo = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    const limpiar = () => {
      try { video.pause(); } catch { /* noop */ }
      video.srcObject = null;
    };
    const intentar = () => {
      if (listo) return;
      if (video.readyState < 2 || !video.videoWidth) return;
      listo = true;
      try {
        const w = Math.min(maxAncho, video.videoWidth);
        const h = Math.round((video.videoHeight / video.videoWidth) * w);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { limpiar(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, w, h);
        // Argos a USD 15: huella gratis de la pantalla (lib/huellaPantalla.ts).
        if (alHuella) alHuella(huellaDeCanvas(canvas));
        const dataUrl = canvas.toDataURL("image/jpeg", calidad);
        limpiar();
        resolve(dataUrl.split(",")[1] ?? null);
      } catch {
        limpiar();
        resolve(null);
      }
    };
    void video.play().catch(() => { /* algunos navegadores no lo necesitan */ });
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      intentar();
      if (listo || Date.now() - t0 > 3000) {
        window.clearInterval(iv);
        if (!listo) { limpiar(); resolve(null); }
      }
    }, 300);
  });
}

/** Día contable en Bogotá (YYYY-MM-DD), igual que el reloj de Cowork y el edge. */
const fechaBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

/** base64 (sin prefijo) → Blob JPEG para subir al bucket. */
function base64AJpeg(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

/**
 * Guarda un pantallazo en el BUZÓN de Supabase (bucket privado monitor-capturas)
 * y registra la fila en monitor_capturas (en_nas=false, analizado=false). Es
 * SILENCIOSO: no juzga nada (eso lo hace la IA aparte) — solo deja la evidencia
 * periódica, estilo Hubstaff. Un proceso aparte mueve el buzón al NAS y lo borra.
 * La RLS deja al propio usuario subir a su carpeta (foldername[1]=uid) e insertar
 * su propia fila. Si algo falla, no rompe nada: la próxima ronda reintenta.
 */
async function guardarEnBuzon(
  userId: string,
  track: MediaStreamTrack,
  tipo: "camara" | "pantalla",
  roomNombre: string | null,
  caraVisible: boolean | null,
): Promise<void> {
  // Pantalla nítida (1600) para leer el texto; cámara chica (640) basta para una cara.
  let huella: string | null = null;
  const b64 = tipo === "pantalla"
    ? await capturarJPEG(track, 1600, 0.8, (h) => { huella = h; })
    : await capturarJPEG(track);
  if (!b64) return;
  const path = `${userId}/${fechaBogota()}/${tipo}/${Date.now()}.jpg`;
  const sub = await supabase.storage
    .from(BUCKET_CAPTURAS)
    .upload(path, base64AJpeg(b64), { contentType: "image/jpeg", upsert: false });
  if (sub.error) return;
  await sinTipar.from("monitor_capturas").insert({
    user_id: userId,
    tipo,
    path,
    room_nombre: roomNombre,
    analizado: false,
    en_nas: false,
    // Solo para cámara: ¿el detector veía una cara en este instante? De aquí sale
    // la cámara% REAL del día (momentos con cara ÷ momentos medidos), en vez del
    // viejo 100% de adorno. Para pantalla no aplica (null).
    cara_visible: caraVisible,
    // Solo pantalla: ¿cambió respecto de la anterior? (semana de prueba, 18/11).
    huella,
  });
}

/** ¿Había una cara cuando se tomó la foto? De `useFaceWatch`:
 *  - ok / too_small / too_dark → el detector SÍ encontró una cara.
 *  - no_face → cámara prendida pero no se ve a nadie.
 *  - cam_off / unavailable → no se pudo medir (null, no cuenta ni a favor ni en contra). */
function caraVisibleDeEstado(state: FaceState): boolean | null {
  if (state === "unavailable" || state === "cam_off") return null;
  return state !== "no_face";
}

export function useMonitorCamara({ track, trackPantalla = null, camaraRealOn, faceWatch, activo, roomNombre }: Params): void {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { esAdmin, activo: cfgActivo, intervaloSeg, avisarCaptura } = useMonitorEstado(activo);
  // El switch de transparencia, en ref para que el timer use el valor en vivo.
  const avisarCapturaRef = useRef(avisarCaptura);
  avisarCapturaRef.current = avisarCaptura;

  // Solo se monitorea una vez confirmado que NO es admin (esAdmin === false).
  const base = activo && !!user && esAdmin === false;
  // Un fallo/espera de config NO apaga el monitor: las faltas gratis corren
  // salvo que esté explícitamente apagado. La IA sí espera a saber que está ON.
  const activoFree = base && cfgActivo !== false;
  const activoIA = base && cfgActivo === true;

  const faceRef = useRef(faceWatch);
  faceRef.current = faceWatch;
  const roomRef = useRef(roomNombre);
  roomRef.current = roomNombre;

  // ── 1) Faltas gratis (del detector de cara) + latido del rondín ──
  const ultimoEpisodioRef = useRef<number>(0); // faceWatch.since ya marcado
  const ultimoLatidoRef = useRef<number>(0);
  useEffect(() => {
    if (!activoFree || !user) return;
    const iv = window.setInterval(() => {
      const fw = faceRef.current;

      // Latido del rondín (cada ~1 min): deja constancia de que el robot "pasó"
      // por esta persona, aunque todo esté bien. Alimenta el cartel "última ronda
      // · N en sala". No depende de la IA ni de que haya falta.
      const ahora = Date.now();
      if (ahora - ultimoLatidoRef.current > LATIDO_MS) {
        ultimoLatidoRef.current = ahora;
        void sinTipar.from("monitor_rondas").upsert({
          user_id: user.id,
          room_nombre: roomRef.current,
          presente: fw.state === "ok" || fw.state === "too_small" || fw.state === "too_dark",
          trabajando: fw.state === "ok",
          last_at: new Date().toISOString(),
        });
      }

      const tipo = TIPO_POR_CARA[fw.state];
      if (!tipo) return; // "ok" / "unavailable": nada que marcar
      if (Date.now() - fw.since < UMBRAL_FALTA_MS) return; // todavía en gracia
      if (ultimoEpisodioRef.current === fw.since) return; // este episodio ya se marcó
      ultimoEpisodioRef.current = fw.since;
      void sinTipar.from("monitor_eventos").insert({
        user_id: user.id,
        room_nombre: roomRef.current,
        tipo,
        fuente: "local",
      });
    }, CHEQUEO_MS);
    return () => window.clearInterval(iv);
  }, [activoFree, user]);

  // ── 2) Ojo de IA cada ~intervalo ──
  const trackRef = useRef(track);
  trackRef.current = track;
  const camRef = useRef(camaraRealOn);
  camRef.current = camaraRealOn;
  const trackPantallaRef = useRef(trackPantalla);
  trackPantallaRef.current = trackPantalla;
  const enVueloRef = useRef(false);
  const guardandoRef = useRef(false);

  // Si hay PANTALLA compartida, la ESCALERA DE CLIP (useArgosEscaleraClip) corre
  // en Cowork y ya se encarga de llamar a monitor-vision con su propio ritmo
  // adaptativo (1 min → 30 s → 20 s → graba). No duplicamos las llamadas acá.
  const escaleraCorriendo = !!trackPantalla;
  const ultimaIARef = useRef(0);
  useEffect(() => {
    if (!activoIA || escaleraCorriendo) return;
    const disparar = async () => {
      if (enVueloRef.current) return;
      if (!camRef.current) return; // cámara apagada: ya lo marca lo gratis
      if (faceRef.current.state !== "ok") return; // sin cara/oscuro: no gastar IA
      // Solo si algo se ve raro (lib/ojoDeIA.ts): cambio de la cara hace poco o
      // la revisión de rutina cada 10 min.
      if (!debePreguntarIA({ apretado: false, caraCambio: faceRef.current.since, ultimaIA: ultimaIARef.current, ahora: Date.now() })) return;
      const t = trackRef.current;
      if (!t || t.readyState !== "live") return;
      enVueloRef.current = true;
      try {
        const b64 = await capturarJPEG(t);
        if (!b64) return;
        ultimaIARef.current = Date.now();
        await supabase.functions.invoke("monitor-vision", {
          body: { imagen_base64: b64, mime: "image/jpeg", room_nombre: roomRef.current },
        });
      } catch {
        /* una captura que falla no rompe la llamada */
      } finally {
        enVueloRef.current = false;
      }
    };
    const iv = window.setInterval(() => { void disparar(); }, Math.max(30, intervaloSeg) * 1000);
    return () => window.clearInterval(iv);
  }, [activoIA, intervaloSeg, escaleraCorriendo]);

  // ── 3) Captura periódica al buzón (modelo Hubstaff) ──
  // Cada minuto deja un pantallazo de la CÁMARA y, si hay pantalla compartida
  // (Cowork), también de la PANTALLA. Va al buzón de Supabase; otro proceso lo
  // mueve al NAS. No juzga: la IA corre aparte. Corre con activoFree (monitoreo
  // encendido), no espera a la IA.
  useEffect(() => {
    if (!activoFree || !user) return;
    const uid = user.id;
    let cancelado = false;
    let timer: number | undefined;
    const tick = async () => {
      if (guardandoRef.current) return;
      guardandoRef.current = true;
      let guardoAlgo = false;
      try {
        const cam = trackRef.current;
        if (camRef.current && cam && cam.readyState === "live") {
          await guardarEnBuzon(uid, cam, "camara", roomRef.current, caraVisibleDeEstado(faceRef.current.state));
          guardoAlgo = true;
        }
        const pan = trackPantallaRef.current;
        if (pan && pan.readyState === "live") {
          await guardarEnBuzon(uid, pan, "pantalla", roomRef.current, null);
          guardoAlgo = true;
        }
      } catch {
        /* una captura que falla no rompe nada: la próxima ronda reintenta */
      } finally {
        guardandoRef.current = false;
      }
      // La llamada muestra «monitoreo activo · hace X» (también en la ventanita
      // flotante y en la ventana del sistema) y, si estaba en otra app, al
      // volver se le cuenta cuántos se tomaron (lib/monitorLocal).
      if (guardoAlgo) anotarPantallazo();
      // Transparencia: la persona ve que se le tomó un pantallazo (una vez, aunque
      // corran dos capturadores a la vez).
      if (guardoAlgo && !cancelado && avisarCapturaRef.current !== false && Date.now() - ultimoAvisoCaptura > 30_000) {
        ultimoAvisoCaptura = Date.now();
        try { toast(t("hr.monitor.pantallazo"), { duration: 2600 }); } catch { /* sin toast no pasa nada */ }
      }
    };
    // Primer pantallazo a los ~8 s; luego cada ~1 min a HORA ALEATORIA (45–75 s).
    const agendar = (ms: number) => {
      timer = window.setTimeout(async () => {
        await tick();
        if (!cancelado) agendar(CAPTURA_MIN_MS + Math.floor(Math.random() * CAPTURA_RANGO_MS));
      }, ms);
    };
    agendar(8000);
    // «Cuando me voy a otro lado ya no me toma pantallazos» (Alvaro, 10/11): sí
    // los toma; el aviso solo se ve dentro de Maven. Al volver, se le dice cuántos.
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      const n = tomarLosDeAfuera();
      if (n > 0 && avisarCapturaRef.current !== false) {
        try { toast(t("hr.monitor.pantallazosAfuera", { n }), { duration: 6000 }); } catch { /* sin toast no pasa nada */ }
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cancelado = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activoFree, user, t]);
}
