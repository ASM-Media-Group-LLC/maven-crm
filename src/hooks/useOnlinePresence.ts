import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import React from "react";

interface OnlinePresenceContextType {
  onlineUsers: Set<string>;
  isOnline: (userId: string) => boolean;
}

const OnlinePresenceContext = createContext<OnlinePresenceContextType>({
  onlineUsers: new Set(),
  isOnline: () => false,
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const presenceChannel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const ids = new Set<string>();
        Object.keys(state).forEach((key) => ids.add(key));
        setOnlineUsers(ids);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [user]);

  const isOnline = useCallback(
    (userId: string) => onlineUsers.has(userId),
    [onlineUsers]
  );

  return React.createElement(
    OnlinePresenceContext.Provider,
    { value: { onlineUsers, isOnline } },
    children
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
