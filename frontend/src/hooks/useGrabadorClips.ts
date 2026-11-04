import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { FaceWatch, FaceState } from "@/hooks/useFaceWatch";

// GRABADOR DE CLIPS de Argos (Álvaro, 02/11). Cuando la persona DEJA DE MIRAR a
// la cámara (se voltea, se va del cuadro, habla con alguien al lado), el navegador
// graba un clip corto de cámara + micrófono y lo deja en el buzón de Supabase.
// Otro proceso lo mueve al NAS (igual que los pantallazos). Corre al lado de
// useMonitorCamara, sobre el MISMO stream (así no prende otra cámara).
//
// Reglas (las que eligió Álvaro):
//  · Dispara cuando se distrae (no_face / too_small sostenido), no por parpadeos.
//  · Con audio si el stream lo trae (si no, solo video; nunca rompe).
//  · Máximo 3 min por clip; corta antes si la persona vuelve a mirar.
//  · Cooldown entre clips para no inundar el NAS.
//  · NUNCA a admins: el gate `activo` ya lo filtra arriba (useArgosVigilante).

interface Params {
  /** El stream vivo (video + audio si hubo permiso de micrófono). */
  stream: MediaStream | null;
  faceWatch: FaceWatch;
  /** Solo true cuando Argos debe vigilar a esta persona (no admin, activo). */
  activo: boolean;
  roomNombre: string | null;
}

const DISPARO_MS = 4_000;   // debe estar distraído ≥4 s para empezar (no parpadeos)
const VUELVE_MS = 2_500;    // si vuelve a mirar ≥2.5 s, corta el clip
const MAX_MS = 180_000;     // 3 minutos tope duro
const COOLDOWN_MS = 300_000; // 5 min entre clips de la misma persona
const CHEQUEO_MS = 1_000;
const BUCKET = "monitor-capturas"; // mismo buzón privado que las fotos

// Qué estados cuentan como "no está mirando la cámara".
const DISTRAIDO: FaceState[] = ["no_face", "too_small"];
const MOTIVO: Partial<Record<FaceState, string>> = { no_face: "se_fue", too_small: "cara_incompleta" };

const fechaBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** El mejor contenedor webm que soporte este navegador (con audio). */
function mejorMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const cands = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function useGrabadorClips({ stream, faceWatch, activo, roomNombre }: Params): void {
  const { user } = useAuth();
  const faceRef = useRef(faceWatch);
  faceRef.current = faceWatch;
  const streamRef = useRef(stream);
  streamRef.current = stream;
  const roomRef = useRef(roomNombre);
  roomRef.current = roomNombre;

  // Estado de grabación, en refs (el timer los lee en vivo).
  const grabandoRef = useRef(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const motivoRef = useRef<string>("se_fue");
  const distraidoDesdeRef = useRef<number>(0); // cuándo empezó a estar distraído (0 = mirando)
  const mirandoDesdeRef = useRef<number>(0);   // cuándo volvió a mirar (0 = distraído)
  const ultimoClipRef = useRef<number>(0);     // fin del último clip (cooldown)

  useEffect(() => {
    if (!activo || !user) return;
    const uid = user.id;

    const subir = async (blob: Blob, durSeg: number, motivo: string, conAudio: boolean) => {
      if (blob.size < 1024) return; // clip vacío, no vale la pena
      const path = `${uid}/${fechaBogota()}/clip/${Date.now()}.webm`;
      const sub = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "video/webm", upsert: false });
      if (sub.error) return;
      await sinTipar.from("monitor_clips").insert({
        user_id: uid, path, dur_seg: Math.round(durSeg), motivo, con_audio: conAudio, room_nombre: roomRef.current, en_nas: false,
      });
    };

    const parar = () => {
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* noop */ } }
    };

    const arrancar = () => {
      const s = streamRef.current;
      const mime = mejorMime();
      if (!s || !mime || grabandoRef.current) return;
      const tienePista = s.getVideoTracks().some((t) => t.readyState === "live");
      if (!tienePista) return;
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 800_000 });
      } catch { return; }
      const conAudio = s.getAudioTracks().some((t) => t.readyState === "live");
      chunksRef.current = [];
      inicioRef.current = Date.now();
      grabandoRef.current = true;
      recRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const durSeg = (Date.now() - inicioRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        chunksRef.current = [];
        grabandoRef.current = false;
        recRef.current = null;
        ultimoClipRef.current = Date.now();
        void subir(blob, durSeg, motivoRef.current, conAudio);
      };
      try { rec.start(); } catch { grabandoRef.current = false; recRef.current = null; }
    };

    const iv = window.setInterval(() => {
      const estado = faceRef.current.state;
      const distraido = DISTRAIDO.includes(estado);
      const ahora = Date.now();

      // Llevar el cronómetro de distraído/mirando.
      if (distraido) {
        mirandoDesdeRef.current = 0;
        if (distraidoDesdeRef.current === 0) distraidoDesdeRef.current = ahora;
        motivoRef.current = MOTIVO[estado] ?? "se_fue";
      } else {
        distraidoDesdeRef.current = 0;
        if (mirandoDesdeRef.current === 0) mirandoDesdeRef.current = ahora;
      }

      if (grabandoRef.current) {
        // Cortar si: volvió a mirar un rato, o llegó al tope de 3 min.
        const volvio = mirandoDesdeRef.current > 0 && ahora - mirandoDesdeRef.current >= VUELVE_MS;
        const tope = ahora - inicioRef.current >= MAX_MS;
        if (volvio || tope) parar();
      } else {
        // Arrancar si: distraído sostenido y fuera del cooldown.
        const sostenido = distraidoDesdeRef.current > 0 && ahora - distraidoDesdeRef.current >= DISPARO_MS;
        const fueraCooldown = ahora - ultimoClipRef.current >= COOLDOWN_MS;
        if (sostenido && fueraCooldown) arrancar();
      }
    }, CHEQUEO_MS);

    return () => {
      window.clearInterval(iv);
      parar();
    };
  }, [activo, user]);
}
