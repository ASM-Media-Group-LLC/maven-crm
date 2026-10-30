import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useMonitorConfig } from "@/hooks/useMonitorConfig";
import type { FaceWatch } from "@/hooks/useFaceWatch";
import { TIPO_POR_CARA } from "@/lib/monitorFaltas";

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
}

const UMBRAL_FALTA_MS = 20_000; // una mala postura sostenida >20 s cuenta como falta
const CHEQUEO_MS = 5_000; // cada cuánto se revisa la duración del estado

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Saca un JPEG (base64 sin prefijo) del track local. null si no se pudo. */
async function capturarJPEG(track: MediaStreamTrack): Promise<string | null> {
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
        const w = Math.min(640, video.videoWidth);
        const h = Math.round((video.videoHeight / video.videoWidth) * w);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { limpiar(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
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

export function useMonitorCamara({ track, camaraRealOn, faceWatch, activo, roomNombre }: Params): void {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { config } = useMonitorConfig(activo && !isAdmin);

  const base = activo && !isAdmin && !!user;
  // Un fallo de lectura de config NO apaga el monitor: las faltas gratis corren
  // salvo que esté explícitamente apagado. La IA sí espera a tener config.
  const activoFree = base && (config ? config.activo : true);
  const activoIA = base && !!config?.activo;

  const faceRef = useRef(faceWatch);
  faceRef.current = faceWatch;
  const roomRef = useRef(roomNombre);
  roomRef.current = roomNombre;

  // ── 1) Faltas gratis (del detector de cara) ──
  const ultimoEpisodioRef = useRef<number>(0); // faceWatch.since ya marcado
  useEffect(() => {
    if (!activoFree || !user) return;
    const iv = window.setInterval(() => {
      const fw = faceRef.current;
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
  const enVueloRef = useRef(false);
  const intervaloSeg = config?.intervaloIaSeg ?? 120;

  useEffect(() => {
    if (!activoIA) return;
    const disparar = async () => {
      if (enVueloRef.current) return;
      if (!camRef.current) return; // cámara apagada: ya lo marca lo gratis
      if (faceRef.current.state !== "ok") return; // sin cara/oscuro: no gastar IA
      const t = trackRef.current;
      if (!t || t.readyState !== "live") return;
      enVueloRef.current = true;
      try {
        const b64 = await capturarJPEG(t);
        if (!b64) return;
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
  }, [activoIA, intervaloSeg]);
}
