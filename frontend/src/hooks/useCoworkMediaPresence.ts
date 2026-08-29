import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
  screenShareOn: boolean;
  // Pausa (baño). `breakStartedAt` es epoch ms para que el coordinador calcule
  // cuánto lleva, y lo mantiene el cliente de quien está en pausa: si el
  // coordinador recarga el dashboard, el presence se re-sincroniza y el contador
  // sigue bien. NO se guarda en la base a propósito — no queremos un historial
  // de idas al baño por persona, solo el estado de ahora.
  onBreak?: boolean;
  breakStartedAt?: number | null;
  // Encuadre: lo reporta el navegador de cada persona sobre su PROPIO video
  // (ver hooks/useFaceWatch). `faceSince` es el epoch del último cambio, para
  // poder decir "sin rostro hace 2 min" en vez de alarmar al primer frame.
  faceState?: string | null;
  faceSince?: number | null;
}

interface UseCoworkMediaPresenceResult {
  mediaStates: Record<string, MediaState>;
  trackMediaState: (state: MediaState) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// EL CANAL VIVE FUERA DE REACT, A PROPÓSITO.
//
// El bug que esto arregla: la llamada del chatter sobrevive a navegar (vive en
// el PersistentCallProvider, por encima del router), pero ESTE canal no. Al
// desmontarse la página de Cowork su `useEffect` hacía `removeChannel`, y
// Supabase emite un `leave` de presence al resto — así que el coordinador veía
// al chatter DESAPARECER de la sala mientras la persona seguía perfectamente
// dentro de la llamada, en la ventanita flotante. Supervisión mintiendo.
//
// Peor: con el canal muerto, `trackMediaState` no tenía a dónde escribir, así
// que aunque el chatter apagara el micro o se fuera de cuadro, el coordinador
// no se enteraba de nada más.
//
// La presencia tiene que durar lo que dura la LLAMADA, no lo que dura la
// página. Como la llamada ya no vive en React, el canal tampoco: se guarda acá
// y solo se cierra cuando alguien sale de verdad (`salirDePresencia`, que
// llama el botón de salir de la sala).
// ────────────────────────────────────────────────────────────────────────────

/** El canal de Supabase Realtime, tipado desde el propio cliente. */
type CanalRealtime = ReturnType<typeof supabase.channel>;

/** Lo que cada cliente publica sobre sí mismo en el presence. */
type PayloadPresencia = Partial<MediaState> & { user_id?: string };

interface CanalVivo {
  sessionId: string;
  userId: string;
  canal: CanalRealtime;
  /** Cuántos componentes montados lo están usando. Llega a 0 al navegar y el
   *  canal SIGUE VIVO — es justamente el punto. */
  usos: number;
  /** Lo avisan a quien esté escuchando cuando cambia el estado de la sala. */
  oyentes: Set<(estados: Record<string, MediaState>) => void>;
  /** Lo último que se publicó, para poder re-publicarlo si hiciera falta. */
  ultimoEstado: MediaState | null;
}

let vivo: CanalVivo | null = null;

function leerEstados(canal: CanalRealtime) {
  const estado = canal.presenceState<PayloadPresencia>();
  const resultado: Record<string, MediaState> = {};
  Object.entries(estado).forEach(([key, presencias]) => {
    const ultima = presencias?.[0];
    if (!ultima) return;
    resultado[key] = {
      micOn: !!ultima.micOn,
      camOn: !!ultima.camOn,
      screenShareOn: !!ultima.screenShareOn,
      onBreak: !!ultima.onBreak,
      breakStartedAt: ultima.breakStartedAt ?? null,
      faceState: ultima.faceState ?? null,
      faceSince: ultima.faceSince ?? null,
    };
  });
  return resultado;
}

function abrirCanal(sessionId: string, userId: string): CanalVivo {
  const canal = supabase.channel(`cowork-media-${sessionId}`, {
    config: { presence: { key: userId } },
  });
  const entrada: CanalVivo = { sessionId, userId, canal, usos: 0, oyentes: new Set(), ultimoEstado: null };

  const avisar = () => {
    const estados = leerEstados(canal);
    entrada.oyentes.forEach((f) => f(estados));
  };

  canal
    .on("presence", { event: "sync" }, avisar)
    .on("presence", { event: "join" }, avisar)
    .on("presence", { event: "leave" }, avisar)
    .subscribe();

  return entrada;
}

/** Cierra la presencia de verdad. Solo al salir de la sala o cambiar de sesión:
 *  desde acá el resto ve el `leave`, que es lo correcto en ese caso. */
export function salirDePresencia() {
  if (!vivo) return;
  supabase.removeChannel(vivo.canal);
  vivo = null;
}

export function useCoworkMediaPresence(
  sessionId: string | undefined,
  userId: string | undefined,
  // Solo el chatter: su presencia debe sobrevivir a que navegue a otra sección
  // de Maven, porque su llamada también sobrevive. El dashboard del coordinador
  // no lo necesita — cuando cierra el dashboard, deja de mirar y ya.
  opciones?: { persistente?: boolean },
): UseCoworkMediaPresenceResult {
  const [mediaStates, setMediaStates] = useState<Record<string, MediaState>>({});
  const persistente = !!opciones?.persistente;
  // En una ref para que cambiarla no re-suscriba el canal.
  const persistenteRef = useRef(persistente);
  persistenteRef.current = persistente;

  useEffect(() => {
    if (!sessionId || !userId) return;

    // Cambió la sesión (o el usuario): el canal viejo ya no sirve para nada.
    if (vivo && (vivo.sessionId !== sessionId || vivo.userId !== userId)) {
      supabase.removeChannel(vivo.canal);
      vivo = null;
    }
    if (!vivo) vivo = abrirCanal(sessionId, userId);

    const entrada = vivo;
    entrada.usos += 1;
    entrada.oyentes.add(setMediaStates);
    // Si el canal ya estaba abierto, arrancar con lo que ya sabe en vez de
    // esperar al próximo evento (si no, la lista aparece vacía un instante).
    setMediaStates(leerEstados(entrada.canal));

    return () => {
      entrada.oyentes.delete(setMediaStates);
      entrada.usos -= 1;
      // Acá está el arreglo: si nadie lo mira PERO la presencia es persistente,
      // el canal se queda abierto. Cerrarlo mandaría un `leave` y el
      // coordinador vería irse a alguien que sigue en la llamada.
      if (entrada.usos <= 0 && !persistenteRef.current && vivo === entrada) {
        supabase.removeChannel(entrada.canal);
        vivo = null;
      }
    };
  }, [sessionId, userId]);

  const trackMediaState = useCallback(
    (state: MediaState) => {
      const entrada = vivo;
      if (!entrada || entrada.userId !== userId) return;
      entrada.ultimoEstado = state;
      entrada.canal.track({
        user_id: userId,
        micOn: state.micOn,
        camOn: state.camOn,
        screenShareOn: state.screenShareOn,
        onBreak: !!state.onBreak,
        breakStartedAt: state.onBreak ? (state.breakStartedAt ?? Date.now()) : null,
        faceState: state.faceState ?? null,
        faceSince: state.faceSince ?? null,
      });
    },
    [userId],
  );

  return { mediaStates, trackMediaState };
}
