import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
  screenShareOn: boolean;
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
        });
      }
    },
    [userId]
  );

  return { mediaStates, trackMediaState };
}
