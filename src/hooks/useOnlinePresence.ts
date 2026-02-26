import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
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

  useEffect(() => {
    if (!user) return;

    const presenceChannel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
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
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
            status: myStatus,
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [user, myStatus]);

  const setMyStatus = useCallback((status: UserStatus) => {
    setMyStatusState(status);
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
