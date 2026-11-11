import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMonitorEstado } from "@/hooks/useMonitorEstado";
import type { FaceWatch } from "@/hooks/useFaceWatch";
import { debePreguntarIA } from "@/lib/ojoDeIA";

// Argos — ESCALERA de muestreo + grabación al distraerse (Alvaro, 08/11/2026).
//
// Tres niveles de ritmo, se ajustan solos según la IA:
//   • NORMAL  → una foto cada ~1 min  (al azar 50–70 s)
//   • APRETADO → cada ~30 s
//   • CRÍTICO  → cada ~20 s + GRABA la pantalla hasta que vuelva (tope 10 min)
//
// Transición (la foto del edge monitor-vision devuelve `falta: {tipo, detalle} | null`):
//   NORMAL   + falta → APRETADO
//   APRETADO + falta → CRÍTICO (y arranca a grabar la pantalla ahí mismo)
//   CRÍTICO  + ok    → APRETADO; APRETADO + ok → NORMAL (y corta grabación al llegar a NORMAL).
//
// SILENCIOSO: no se avisa; el clip queda solo para el dueño (RLS).
// Solo corre si: no es admin, config.activo=true, y hay track de PANTALLA compartida.

const PASO: Record<"normal" | "apretado" | "critico", { minMs: number; rangoMs: number }> = {
  normal: { minMs: 50_000, rangoMs: 20_000 },  // 50–70 s
  apretado: { minMs: 25_000, rangoMs: 10_000 }, // 25–35 s
  critico: { minMs: 15_000, rangoMs: 10_000 },  // 15–25 s
};
const TOPE_GRABACION_MS = 10 * 60_000; // 10 min
const BUCKET = "argos-clips";

interface Params {
  trackCamara: MediaStreamTrack | null;
  trackPantalla: MediaStreamTrack | null;
  faceWatch: FaceWatch;
  /** sala viva + consentimiento del supervisor para encuadrar: lo mismo que
   *  usa useMonitorCamara para encenderse. */
  activo: boolean;
  roomNombre: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Un JPEG base64 (sin prefijo) de un track, igual que useMonitorCamara. */
async function capturarJPEG(track: MediaStreamTrack, maxAncho = 640, calidad = 0.6): Promise<string | null> {
  return await new Promise((resolve) => {
    let listo = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    const limpiar = () => { try { video.pause(); } catch { /* noop */ } video.srcObject = null; };
    const intentar = () => {
      if (listo) return;
      if (video.readyState < 2 || !video.videoWidth) return;
      listo = true;
      try {
        const w = Math.min(maxAncho, video.videoWidth);
        const h = Math.round((video.videoHeight / video.videoWidth) * w);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
        limpiar();
        resolve(canvas.toDataURL("image/jpeg", calidad).split(",")[1] || null);
      } catch { limpiar(); resolve(null); }
    };
    video.play().catch(() => {});
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      intentar();
      if (listo || Date.now() - t0 > 3000) { window.clearInterval(iv); if (!listo) { limpiar(); resolve(null); } }
    }, 200);
  });
}

/** Mejor mimeType de video que el navegador soporte, o null si ninguno. */
function mejorMimeVideo(): string | null {
  const opciones = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const MR = (typeof MediaRecorder !== "undefined" ? MediaRecorder : null) as unknown as { isTypeSupported?: (m: string) => boolean } | null;
  if (!MR?.isTypeSupported) return null;
  for (const m of opciones) if (MR.isTypeSupported(m)) return m;
  return null;
}

/**
 * Enciende la escalera para esta persona. Solo trabaja cuando hay track de
 * pantalla compartida — sin eso no hay nada que grabar, no vale la pena medir
 * tan seguido. Se apaga limpia (corta grabación) al desmontarse.
 */
export function useArgosEscaleraClip({ trackCamara, trackPantalla, faceWatch, activo, roomNombre }: Params): void {
  const { user } = useAuth();
  const { esAdmin, activo: cfgActivo } = useMonitorEstado(activo);
  const encendido = activo && !!user && esAdmin === false && cfgActivo === true && !!trackPantalla;

  const trackCamRef = useRef(trackCamara); trackCamRef.current = trackCamara;
  const trackPantRef = useRef(trackPantalla); trackPantRef.current = trackPantalla;
  const faceRef = useRef(faceWatch); faceRef.current = faceWatch;
  const roomRef = useRef(roomNombre); roomRef.current = roomNombre;

  useEffect(() => {
    if (!encendido || !user) return;
    const uid = user.id;
    let cancelado = false;
    let timerFoto: number | undefined;
    let nivel: "normal" | "apretado" | "critico" = "normal";
    let enVuelo = false;

    // Estado de grabación.
    let rec: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let recStartedAt = 0;
    let recMotivo = "distraida";
    let topeTimer: number | undefined;

    const detenerGrabacion = async (razon: "vuelve" | "tope" | "cleanup"): Promise<void> => {
      if (!rec || rec.state === "inactive") { rec = null; return; }
      await new Promise<void>((resolve) => {
        rec!.addEventListener("stop", () => resolve(), { once: true });
        try { rec!.stop(); } catch { resolve(); }
      });
      if (topeTimer) { window.clearTimeout(topeTimer); topeTimer = undefined; }
      const blob = new Blob(chunks, { type: rec?.mimeType || "video/webm" });
      chunks = [];
      rec = null;
      // Subir al bucket + registrar fila.
      try {
        const ahora = Date.now();
        const path = `${uid}/${new Date().toISOString().slice(0, 10)}/${ahora}.webm`;
        const sub = await supabase.storage.from(BUCKET).upload(path, blob, {
          contentType: blob.type, upsert: false,
        });
        if (sub.error) { console.warn("[argos-clip] subir falló", sub.error.message); return; }
        const seg = Math.max(1, Math.round((ahora - recStartedAt) / 1000));
        await sinTipar.from("argos_clips").insert({
          user_id: uid,
          room_nombre: roomRef.current,
          motivo: recMotivo,
          started_at: new Date(recStartedAt).toISOString(),
          ended_at: new Date(ahora).toISOString(),
          duracion_seg: seg,
          path,
        });
      } catch (e) {
        console.warn("[argos-clip] no se pudo registrar", (e as Error)?.message);
      }
      // 'cleanup' / 'tope' no reencienden solos; 'vuelve' tampoco: el ciclo decide.
      void razon;
    };

    const arrancarGrabacion = (motivo: string) => {
      if (rec) return;
      const pantalla = trackPantRef.current;
      if (!pantalla || pantalla.readyState !== "live") return;
      const mime = mejorMimeVideo();
      if (!mime) return; // navegador sin soporte: no grabamos, solo subimos ritmo
      try {
        const stream = new MediaStream([pantalla]);
        const r = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 800_000 });
        chunks = [];
        r.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        r.start(2000); // chunk cada 2 s (por si se corta algo, no se pierde todo)
        rec = r;
        recStartedAt = Date.now();
        recMotivo = motivo;
        // Tope duro de 10 min para no eternizar.
        topeTimer = window.setTimeout(() => { void detenerGrabacion("tope"); }, TOPE_GRABACION_MS);
      } catch (e) {
        console.warn("[argos-clip] MediaRecorder falló", (e as Error)?.message);
      }
    };

    // Un paso de la escalera: saca una foto de la cámara, se la pide al edge, y
    // ajusta el nivel según el veredicto. Si el nivel crítico aparece, graba.
    const paso = async () => {
      if (enVuelo) return;
      const cam = trackCamRef.current;
      if (!cam || cam.readyState !== "live") return;
      if (faceRef.current.state !== "ok") return; // sin cara no gastamos IA
      // Solo si algo se ve raro (lib/ojoDeIA.ts): falta reciente, cambio de la
      // cara hace poco, o la revisión de rutina cada 10 min.
      if (!debePreguntarIA({ apretado: nivel !== "normal", caraCambio: faceRef.current.since, ultimaIA, ahora: Date.now() })) return;
      ultimaIA = Date.now();
      enVuelo = true;
      let distraida = false;
      let motivo = "distraida";
      try {
        const b64 = await capturarJPEG(cam);
        if (!b64) return;
        const { data } = await supabase.functions.invoke("monitor-vision", {
          body: { imagen_base64: b64, mime: "image/jpeg", room_nombre: roomRef.current },
        });
        const d = data as { falta?: { tipo?: string; detalle?: string } | null } | undefined;
        if (d?.falta) { distraida = true; motivo = d.falta.tipo || "distraida"; }
      } catch {
        /* una ronda fallida no sube ni baja la escalera: el próximo tick decide */
      } finally {
        enVuelo = false;
      }
      if (distraida) {
        if (nivel === "normal") nivel = "apretado";
        else if (nivel === "apretado") { nivel = "critico"; arrancarGrabacion(motivo); }
        else /* crítico */ {
          // Sigue mal estando en crítico: si por alguna razón se cortó la grabación
          // antes del tope, la reintentamos.
          if (!rec) arrancarGrabacion(motivo);
        }
      } else {
        // Se ve bien. Baja por escalones; corta la grabación al llegar a normal.
        if (nivel === "critico") nivel = "apretado";
        else if (nivel === "apretado") {
          nivel = "normal";
          if (rec) void detenerGrabacion("vuelve");
        }
      }
    };

    let ultimaIA = 0;
    const agendar = (ms: number) => {
      timerFoto = window.setTimeout(async () => {
        await paso();
        if (!cancelado) {
          const p = PASO[nivel];
          agendar(p.minMs + Math.floor(Math.random() * p.rangoMs));
        }
      }, ms);
    };
    // Primer paso a los ~10 s (no interfiere con el rondín normal que corre
    // también); luego el ritmo lo manda `nivel`.
    agendar(10_000);
    return () => {
      cancelado = true;
      if (timerFoto) window.clearTimeout(timerFoto);
      // Corta grabación al desmontar (cambio de sala, salida de Cowork, cierre).
      if (rec) void detenerGrabacion("cleanup");
    };
  }, [encendido, user]);
}
