import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMonitorEstado } from "@/hooks/useMonitorEstado";
import type { FaceWatch } from "@/hooks/useFaceWatch";
import { anunciar } from "@/lib/anunciarVoz";

// Argos — NUDGE a la PERSONA (Alvaro, 09/11). Cuando Argos ve que la persona
// se está rajando en vivo, le avisa a ELLA con tono de jefe directo (toast +
// voz Javi), antes de escalar a HR/supervisor/dueño. Si ignora 5 min, el edge
// `argos-escalar-persona` (llamado al tick siguiente) hace push a los de arriba.
//
// Qué se le avisa:
//   • camara_apagada   → "Enciende la cámara."
//   • fuera_cuadro     → "Vuelve al puesto, no te veo."
//   • sin_pantalla     → "Comparte tu pantalla."
//   • pausa_pasada     → "Pasaste el cupo, vuelve al puesto." (lo detecta edge)
//   • distraido        → "Vuelve a la tarea." (viene del veredicto IA)
//
// Un solo nudge por tipo por sesión abierta (no repite); si la persona se
// corrige, el episodio se cierra y puede volver a disparar si pasa otra vez.
// NO corre para admins.

interface Params {
  trackCamara: MediaStreamTrack | null;
  trackPantalla: MediaStreamTrack | null;
  camaraRealOn: boolean;
  faceWatch: FaceWatch;
  /** sala viva + supervisorEncuadre, como useMonitorCamara. */
  activo: boolean;
  roomNombre: string | null;
}

type Tipo = "camara_apagada" | "fuera_cuadro" | "sin_pantalla";
const UMBRAL: Record<Tipo, number> = {
  camara_apagada: 120_000,   // 2 min sin cámara → aviso
  fuera_cuadro: 90_000,      // 1.5 min fuera de cuadro
  sin_pantalla: 180_000,     // 3 min sin compartir pantalla
};
const MSG: Record<Tipo, string> = {
  camara_apagada: "Enciende la cámara.",
  fuera_cuadro: "Vuelve al puesto, no te veo.",
  sin_pantalla: "Comparte tu pantalla.",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useArgosNudgePersona({ trackPantalla, camaraRealOn, faceWatch, activo, roomNombre }: Params): void {
  const { user } = useAuth();
  const { esAdmin, activo: cfgActivo } = useMonitorEstado(activo);
  const encendido = activo && !!user && esAdmin === false && cfgActivo !== false;

  const camRef = useRef(camaraRealOn); camRef.current = camaraRealOn;
  const panRef = useRef(trackPantalla); panRef.current = trackPantalla;
  const faceRef = useRef(faceWatch); faceRef.current = faceWatch;
  const roomRef = useRef(roomNombre); roomRef.current = roomNombre;

  useEffect(() => {
    if (!encendido || !user) return;
    const uid = user.id;
    const inicio: Partial<Record<Tipo, number>> = {};
    const avisado: Partial<Record<Tipo, number>> = {};

    const registrarEscalacion = async (tipo: Tipo, mensaje: string) => {
      // Marca "la persona ya fue avisada" para que, si sigue mal pasados 5 min,
      // el edge escale. Idempotente por (user, tipo) abierto.
      try {
        await sinTipar.from("argos_nudges").upsert({
          user_id: uid, tipo, mensaje, room_nombre: roomRef.current,
          avisado_at: new Date().toISOString(), cerrado_at: null,
        }, { onConflict: "user_id,tipo,cerrado_at", ignoreDuplicates: true });
      } catch { /* si upsert falla, el aviso ya se dio en pantalla */ }
    };

    const avisar = (tipo: Tipo) => {
      const ahora = Date.now();
      const ultimo = avisado[tipo] ?? 0;
      if (ahora - ultimo < 60_000) return; // no repetir el mismo aviso en < 1 min
      avisado[tipo] = ahora;
      const msg = MSG[tipo];
      try { toast(`Argos: ${msg}`, { duration: 6000 }); } catch { /* ignore */ }
      try { void anunciar(msg); } catch { /* ignore */ }
      void registrarEscalacion(tipo, msg);
    };

    const cerrar = (tipo: Tipo) => {
      delete inicio[tipo];
      // Marca el nudge como cerrado para que el escalador no mande push (ya se
      // corrigió). Si la fila no existe, da igual.
      void (async () => {
        try {
          await sinTipar.from("argos_nudges").update({ cerrado_at: new Date().toISOString() })
            .eq("user_id", uid).eq("tipo", tipo).is("cerrado_at", null);
        } catch { /* ignore */ }
      })();
    };

    const evaluar = () => {
      const ahora = Date.now();
      // Cámara apagada: camaraRealOn === false.
      if (!camRef.current) {
        inicio.camara_apagada ??= ahora;
        if (ahora - inicio.camara_apagada! >= UMBRAL.camara_apagada) avisar("camara_apagada");
      } else {
        if (inicio.camara_apagada) cerrar("camara_apagada");
      }
      // Fuera de cuadro: faceWatch.state en no_face.
      const estado = faceRef.current.state;
      if (camRef.current && estado === "no_face") {
        inicio.fuera_cuadro ??= ahora;
        if (ahora - inicio.fuera_cuadro! >= UMBRAL.fuera_cuadro) avisar("fuera_cuadro");
      } else {
        if (inicio.fuera_cuadro) cerrar("fuera_cuadro");
      }
      // Sin pantalla compartida.
      const pan = panRef.current;
      if (!pan || pan.readyState !== "live") {
        inicio.sin_pantalla ??= ahora;
        if (ahora - inicio.sin_pantalla! >= UMBRAL.sin_pantalla) avisar("sin_pantalla");
      } else {
        if (inicio.sin_pantalla) cerrar("sin_pantalla");
      }
    };

    const iv = window.setInterval(evaluar, 10_000);
    return () => { window.clearInterval(iv); };
  }, [encendido, user]);
}
