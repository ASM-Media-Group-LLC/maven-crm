import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import React from "react";

export type UserStatus = "available" | "busy" | "dnd" | "away";

interface OnlinePresenceContextType {
  onlineUsers: Set<string>;
  isOnline: (userId: string) => boolean;
  userStatuses: Record<string, UserStatus>;
  getStatus: (userId: string) => UserStatus | null;
  myStatus: UserStatus;
  setMyStatus: (status: UserStatus) => void;
}

const OnlinePresenceContext = createContext<OnlinePresenceContextType>({
  onlineUsers: new Set(),
  isOnline: () => false,
  userStatuses: {},
  getStatus: () => null,
  myStatus: "available",
  setMyStatus: () => {},
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});
  const [myStatus, setMyStatusState] = useState<UserStatus>("available");
  const channelRef = useRef<any>(null);
  const myStatusRef = useRef<UserStatus>("available");

  // Keep ref in sync
  myStatusRef.current = myStatus;

  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Single channel subscription — depends only on user identity
  useEffect(() => {
    if (!user?.id) return;

    const presenceChannel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    channelRef.current = presenceChannel;

    const syncState = () => {
      const state = presenceChannel.presenceState();
      const ids = new Set<string>();
      const statuses: Record<string, UserStatus> = {};
      Object.entries(state).forEach(([key, presences]) => {
        ids.add(key);
        const latest = (presences as any[])?.[0];
        if (latest?.status) statuses[key] = latest.status as UserStatus;
      });
      setOnlineUsers(ids);
      setUserStatuses(statuses);
    };

    presenceChannel
      .on("presence", { event: "sync" }, syncState)
      .on("presence", { event: "join" }, syncState)
      .on("presence", { event: "leave" }, syncState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
            // Si Maven se abre ya en segundo plano, no anunciar "Disponible".
            status: document.hidden ? "away" : myStatusRef.current,
          });
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(presenceChannel);
    };
  }, [user?.id]);

  // Presencia HONESTA: "Disponible" solo mientras la pestaña está visible.
  // Al pasar a segundo plano (cambiar de app, bloquear el celular, otra pestaña) se
  // publica "away" SIN pisar el estado que la persona eligió; al volver se restaura.
  // Antes la presencia se registraba una vez y quedaba en "Disponible" hasta que el
  // socket moría solo → alguien sin mirar la pantalla seguía "Disponible" y lo que le
  // mandaban quedaba en ✓ (enviado) sin pasar a ✓✓. Al cerrar (pagehide) se hace
  // untrack para que la presencia caiga de inmediato en vez de quedar colgada.
  useEffect(() => {
    if (!user?.id) return;
    const trackAs = (status: UserStatus) => {
      const channel = channelRef.current;
      if (!channel) return;
      void channel.track({ user_id: userIdRef.current, online_at: new Date().toISOString(), status });
    };
    const onVisibility = () => { trackAs(document.hidden ? "away" : myStatusRef.current); };
    const onPageHide = () => { void channelRef.current?.untrack(); };
    const onPageShow = () => { trackAs(myStatusRef.current); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [user?.id]);

  // When status changes, re-track without recreating channel
  const setMyStatus = useCallback((status: UserStatus) => {
    setMyStatusState(status);
    myStatusRef.current = status;
    const channel = channelRef.current;
    if (channel) {
      channel.track({
        user_id: userIdRef.current,
        online_at: new Date().toISOString(),
        status,
      });
    }
  }, []);

  const isOnline = useCallback(
    (userId: string) => onlineUsers.has(userId),
    [onlineUsers]
  );

  const getStatus = useCallback(
    (userId: string) => userStatuses[userId] || null,
    [userStatuses]
  );

  return React.createElement(
    OnlinePresenceContext.Provider,
    { value: { onlineUsers, isOnline, userStatuses, getStatus, myStatus, setMyStatus } },
    children
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
