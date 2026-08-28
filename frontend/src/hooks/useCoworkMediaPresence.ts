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

export function useCoworkMediaPresence(
  sessionId: string | undefined,
  userId: string | undefined
): UseCoworkMediaPresenceResult {
  const [mediaStates, setMediaStates] = useState<Record<string, MediaState>>({});
  const channelRef = useRef<any>(null);
  const lastStateRef = useRef<MediaState | null>(null);

  useEffect(() => {
    if (!sessionId || !userId) return;

    const channel = supabase.channel(`cowork-media-${sessionId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    const syncState = () => {
      const state = channel.presenceState();
      const result: Record<string, MediaState> = {};
      Object.entries(state).forEach(([key, presences]) => {
        const latest = (presences as any[])?.[0];
        if (latest) {
          result[key] = {
            micOn: !!latest.micOn,
            camOn: !!latest.camOn,
            screenShareOn: !!latest.screenShareOn,
            onBreak: !!latest.onBreak,
            breakStartedAt: latest.breakStartedAt ?? null,
            faceState: latest.faceState ?? null,
            faceSince: latest.faceSince ?? null,
          };
        }
      });
      setMediaStates(result);
    };

    channel
      .on("presence", { event: "sync" }, syncState)
      .on("presence", { event: "join" }, syncState)
      .on("presence", { event: "leave" }, syncState)
      .subscribe();

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [sessionId, userId]);

  const trackMediaState = useCallback(
    (state: MediaState) => {
      lastStateRef.current = state;
      const channel = channelRef.current;
      if (channel) {
        channel.track({
          user_id: userId,
          micOn: state.micOn,
          camOn: state.camOn,
          screenShareOn: state.screenShareOn,
          onBreak: !!state.onBreak,
          breakStartedAt: state.onBreak ? (state.breakStartedAt ?? Date.now()) : null,
          faceState: state.faceState ?? null,
          faceSince: state.faceSince ?? null,
        });
      }
    },
    [userId]
  );

  return { mediaStates, trackMediaState };
}
