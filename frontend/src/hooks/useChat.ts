import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ChatConversation,
  ChatMessage,
  ChatParticipant,
  ConversationWithDetails,
  UserProfile,
} from "@/pages/messenger/types";
import { profileName } from "@/pages/messenger/utils";
import { markMessagesDelivered } from "@/hooks/useReadReceipts";
import { toast } from "sonner";

export function useChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const [chatRealtimeVersion, setChatRealtimeVersion] = useState(0);
  const chatRealtimeRetryRef = useRef(0);
  const chatRealtimeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, whatsapp_push_name");
    if (data) {
      const map: Record<string, UserProfile> = {};
      data.forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: participations } = await supabase
        .from("chat_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);

      if (!participations || participations.length === 0) {
        setConversations([]);
        return;
      }

      const convIds = participations.map((p: any) => p.conversation_id);
      const lastReadMap: Record<string, string | null> = {};
      participations.forEach((p: any) => { lastReadMap[p.conversation_id] = p.last_read_at; });

      // Batch: conversations, all participants, and recent messages in parallel
      const [convsResult, allParticipantsResult, recentMsgsResult] = await Promise.all([
        supabase
          .from("chat_conversations")
          .select("*")
          .in("id", convIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("chat_participants")
          .select("*")
          .in("conversation_id", convIds),
        supabase
          .from("chat_messages")
          .select("*")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(convIds.length * 2 > 1000 ? 1000 : convIds.length * 2),
      ]);

      const convs = convsResult.data;
      const allParticipants = allParticipantsResult.data;

      if (!convs) {
        setConversations([]);
        return;
      }

      // Build last-message map from batch result (first occurrence per conv = latest)
      const lastMessageMap: Record<string, ChatMessage> = {};
      if (recentMsgsResult.data) {
        for (const msg of recentMsgsResult.data as ChatMessage[]) {
          if (!lastMessageMap[msg.conversation_id]) {
            lastMessageMap[msg.conversation_id] = msg;
          }
        }
      }

      // For any conversations missing from batch, fetch individually
      const missingConvIds = convIds.filter(id => !lastMessageMap[id]);
      if (missingConvIds.length > 0 && missingConvIds.length <= 20) {
        const fallbackResults = await Promise.all(
          missingConvIds.map(convId =>
            supabase.from("chat_messages").select("*")
              .eq("conversation_id", convId)
              .order("created_at", { ascending: false })
              .limit(1)
          )
        );
        fallbackResults.forEach(({ data }, i) => {
          if (data?.[0]) lastMessageMap[missingConvIds[i]] = data[0] as ChatMessage;
        });
      }

      // Server-side unread counts — single RPC call
      const unreadMap: Record<string, number> = {};
      const { data: unreadData } = await supabase.rpc("get_unread_counts", { _user_id: user.id });
      if (unreadData) {
        for (const row of unreadData as any[]) {
          unreadMap[row.conversation_id] = row.unread_count || 0;
        }
      }

      const enriched: ConversationWithDetails[] = convs.map((conv: any) => {
        const convParticipants = (allParticipants || []).filter(
          (p: any) => p.conversation_id === conv.id
        );

        const lastMessage = lastMessageMap[conv.id];

        let displayName = conv.name || "";
        if (conv.type === "direct") {
          const otherParticipant = convParticipants.find(
            (p: any) => p.user_id !== user.id
          );
          if (otherParticipant) {
            displayName = profileName(profilesRef.current[otherParticipant.user_id]);
          }
        }

        return {
          ...conv,
          participants: convParticipants.map((p: any) => ({
            ...p,
            profile: profilesRef.current[p.user_id],
          })),
          lastMessage,
          unreadCount: unreadMap[conv.id] || 0,
          displayName,
        } as ConversationWithDetails;
      });

      // Filter: hide direct chats from the non-creator until a message is sent
      const visible = enriched.filter(conv => {
        if (conv.type === "direct" && conv.created_by !== user.id && !conv.lastMessage) {
          return false;
        }
        return true;
      });

      visible.sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.updated_at;
        const bTime = b.lastMessage?.created_at || b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setConversations(visible);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfiles().then(() => loadConversations());
  }, [loadProfiles, loadConversations]);

  // Realtime subscription for conversation sync
  useEffect(() => {
    if (!user) return;

    // Throttled reload: avoid debounce starvation under high event volume
    const pendingReloadRef = { timer: null as ReturnType<typeof setTimeout> | null };
    const scheduleConversationsReload = (immediate = false) => {
      if (pendingReloadRef.timer) {
        if (!immediate) return;
        clearTimeout(pendingReloadRef.timer);
        pendingReloadRef.timer = null;
      }

      const delay = immediate ? 50 : 350;
      pendingReloadRef.timer = setTimeout(() => {
        pendingReloadRef.timer = null;
        void loadConversations();
      }, delay);
    };

    const isKnownConversation = (conversationId?: string | null) => {
      if (!conversationId) return false;
      return conversationsRef.current.some((c) => c.id === conversationId);
    };

    // Inline update: when a new message arrives, update the sidebar without full reload
    const updateConversationWithMessage = (msg: any) => {
      if (!msg?.conversation_id || msg.is_deleted) return;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversation_id);
        if (idx === -1) return prev;

        const conv = prev[idx];
        const isMine = msg.sender_id === user.id;
        const updated = {
          ...conv,
          lastMessage: msg as ChatMessage,
          updated_at: msg.created_at,
          unreadCount: isMine ? conv.unreadCount : conv.unreadCount + 1,
        };

        const next = [...prev];
        next.splice(idx, 1);
        next.unshift(updated);
        return next;
      });
    };

    const scheduleChannelReconnect = () => {
      if (chatRealtimeReconnectTimerRef.current) return;

      chatRealtimeRetryRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, chatRealtimeRetryRef.current), 15000);
      chatRealtimeReconnectTimerRef.current = setTimeout(() => {
        chatRealtimeReconnectTimerRef.current = null;
        setChatRealtimeVersion((v) => v + 1);
      }, delay);
    };

    const channel = supabase
      .channel(`chat-realtime-${user.id}-${chatRealtimeVersion}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (!isKnownConversation(msg?.conversation_id)) return;
          updateConversationWithMessage(msg);
          // Ack "entregado": llegó un mensaje de otro por el canal global (aunque el chat no
          // esté abierto) → marcar entregado para que el remitente vea ✓✓ gris.
          if (msg?.id && msg.sender_id !== user.id) {
            void markMessagesDelivered(user.id, [msg.id]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (!isKnownConversation(msg?.conversation_id)) return;

          setConversations((prev) => {
            const conv = prev.find((c) => c.id === msg.conversation_id);
            if (!conv) return prev;

            // If this was the lastMessage and it got soft-deleted, refresh latest message
            if (conv.lastMessage?.id === msg.id && msg.is_deleted) {
              scheduleConversationsReload();
              return prev;
            }

            if (conv.lastMessage?.id === msg.id) {
              return prev.map((c) =>
                c.id === msg.conversation_id
                  ? { ...c, lastMessage: msg as ChatMessage }
                  : c
              );
            }
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          const old = payload.old as any;
          if (!isKnownConversation(old?.conversation_id)) return;

          setConversations((prev) => {
            const affected = prev.find((c) => c.lastMessage?.id === old.id);
            if (affected) {
              scheduleConversationsReload();
            }
            return prev;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_participants" },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow?.conversation_id) return;

          const isForMe = newRow.user_id === user.id;
          if (isForMe) {
            scheduleConversationsReload(true);
            return;
          }

          if (!isKnownConversation(newRow.conversation_id)) return;

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== newRow.conversation_id) return conv;
              if (conv.participants.some((p) => p.user_id === newRow.user_id)) return conv;

              return {
                ...conv,
                participants: [
                  ...conv.participants,
                  {
                    ...newRow,
                    profile: profilesRef.current[newRow.user_id],
                  },
                ],
              };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_participants" },
        (payload) => {
          const old = payload.old as any;
          if (!old?.conversation_id) return;

          if (old.user_id === user.id) {
            scheduleConversationsReload(true);
            return;
          }

          if (!isKnownConversation(old.conversation_id)) return;

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === old.conversation_id
                ? {
                    ...conv,
                    participants: conv.participants.filter((p) => p.user_id !== old.user_id),
                  }
                : conv
            )
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_participants" },
        (payload) => {
          const row = payload.new as any;
          if (!row?.conversation_id) return;

          if (row.user_id === user.id) {
            const old = payload.old as any;
            if (
              old &&
              row.last_read_at !== old.last_read_at &&
              row.is_muted === old.is_muted &&
              row.notifications_mode === old.notifications_mode &&
              row.role === old.role
            ) {
              return; // Skip read-receipt-only updates
            }
            scheduleConversationsReload(true);
            return;
          }

          if (!isKnownConversation(row.conversation_id)) return;

          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== row.conversation_id) return conv;

              return {
                ...conv,
                participants: conv.participants.map((p) =>
                  p.user_id === row.user_id ? { ...p, ...row } : p
                ),
              };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_conversations" },
        (payload) => {
          const updated = payload.new as any;
          if (!isKnownConversation(updated?.id)) return;

          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === updated.id);
            if (idx === -1) return prev;
            const patched = {
              ...prev[idx],
              name: updated.name,
              avatar_url: updated.avatar_url,
              description: updated.description,
            };
            if (patched.type === "group" && updated.name) patched.displayName = updated.name;
            const next = [...prev];
            next[idx] = patched;
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_conversations" },
        (payload) => {
          const old = payload.old as any;
          setConversations((prev) => prev.filter((c) => c.id !== old.id));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          chatRealtimeRetryRef.current = 0;
          if (chatRealtimeReconnectTimerRef.current) {
            clearTimeout(chatRealtimeReconnectTimerRef.current);
            chatRealtimeReconnectTimerRef.current = null;
          }
          void loadConversations();
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleConversationsReload(true);
          scheduleChannelReconnect();
        }
      });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadConversations();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Fallback sync por si el websocket se cae. El realtime ya trae los cambios en
    // vivo, así que esto es solo red de seguridad → 20s (antes 5s recargaba toda la
    // lista 12×/min de más). visibilitychange + reconexión del canal cubren el resto.
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadConversations();
      }
    }, 20_000);

    return () => {
      if (pendingReloadRef.timer) clearTimeout(pendingReloadRef.timer);
      if (chatRealtimeReconnectTimerRef.current) {
        clearTimeout(chatRealtimeReconnectTimerRef.current);
        chatRealtimeReconnectTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations, chatRealtimeVersion]);

  const createDirectChat = useCallback(
    (otherUserId: string): string | null => {
      if (!user) return null;

      // Use ref for up-to-date conversations (avoid stale closures)
      const currentConvs = conversationsRef.current;
      const existing = currentConvs.find(
        (c) =>
          c.type === "direct" &&
          c.participants.some((p) => p.user_id === otherUserId)
      );
      if (existing) return existing.id;

      const newConvId = crypto.randomUUID();
      const now = new Date().toISOString();
      const otherProfile = profilesRef.current[otherUserId];

      const optimisticConv: ConversationWithDetails = {
        id: newConvId,
        type: "direct",
        name: null,
        description: null,
        avatar_url: null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        participants: [
          {
            id: crypto.randomUUID(),
            conversation_id: newConvId,
            user_id: user.id,
            role: "admin",
            joined_at: now,
            last_read_at: now,
            is_muted: false,
            notifications_mode: "all",
            profile: profilesRef.current[user.id],
          },
          {
            id: crypto.randomUUID(),
            conversation_id: newConvId,
            user_id: otherUserId,
            role: "member",
            joined_at: now,
            last_read_at: null,
            is_muted: false,
            notifications_mode: "all",
            profile: otherProfile,
          },
        ],
        unreadCount: 0,
        displayName: otherProfile?.full_name || "Chat",
      };

      setConversations((prev) => [optimisticConv, ...prev]);

      (async () => {
        // Check server-side for existing direct chat with this user
        const { data: myParticipations } = await supabase
          .from("chat_participants")
          .select("conversation_id")
          .eq("user_id", user.id);

        if (myParticipations && myParticipations.length > 0) {
          const myConvIds = myParticipations.map((p: any) => p.conversation_id);
          
          // Find if otherUserId is in any of my direct conversations
          const { data: otherP } = await supabase
            .from("chat_participants")
            .select("conversation_id, chat_conversations!inner(type)")
            .eq("user_id", otherUserId)
            .eq("chat_conversations.type", "direct")
            .in("conversation_id", myConvIds)
            .limit(1);

          if (otherP && otherP.length > 0) {
            // Already exists — replace optimistic with real one
            const existingConvId = otherP[0].conversation_id;
            setConversations((prev) => prev.filter((c) => c.id !== newConvId));
            return;
          }
        }

        const { error: createConvError } = await supabase
          .from("chat_conversations")
          .insert({ id: newConvId, type: "direct", created_by: user.id });

        if (createConvError) {
          setConversations((prev) => prev.filter((c) => c.id !== newConvId));
          toast.error("Error al crear conversación");
          return;
        }

        const { error: addCreatorError } = await supabase
          .from("chat_participants")
          .insert({ conversation_id: newConvId, user_id: user.id, role: "admin" });

        if (addCreatorError) {
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          setConversations((prev) => prev.filter((c) => c.id !== newConvId));
          toast.error("Error al crear conversación");
          return;
        }

        const { error: addOtherError } = await supabase
          .from("chat_participants")
          .insert({ conversation_id: newConvId, user_id: otherUserId, role: "member" });

        if (addOtherError) {
          await supabase.from("chat_participants").delete().eq("conversation_id", newConvId);
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          setConversations((prev) => prev.filter((c) => c.id !== newConvId));
          toast.error("Error al crear conversación");
          return;
        }
      })();

      return newConvId;
    },
    [user]
  );

  const createGroupChat = useCallback(
    (name: string, memberIds: string[]): string | null => {
      if (!user) return null;

      const newConvId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Optimistic UI — instant navigation
      const optimisticConv: ConversationWithDetails = {
        id: newConvId,
        type: "group",
        name,
        description: null,
        avatar_url: null,
        created_by: user.id,
        created_at: now,
        updated_at: now,
        participants: [
          { id: crypto.randomUUID(), conversation_id: newConvId, user_id: user.id, role: "admin", joined_at: now, last_read_at: now, is_muted: false, notifications_mode: "all", profile: profilesRef.current[user.id] },
          ...memberIds.map(id => ({
            id: crypto.randomUUID(), conversation_id: newConvId, user_id: id, role: "member" as const, joined_at: now, last_read_at: null, is_muted: false, notifications_mode: "all" as const, profile: profilesRef.current[id],
          })),
        ],
        unreadCount: 0,
        displayName: name,
      };
      setConversations(prev => [optimisticConv, ...prev]);

      // Background persist — fire and forget
      (async () => {
        const { error: createConvError } = await supabase
          .from("chat_conversations")
          .insert({ id: newConvId, type: "group", name, created_by: user.id });

        if (createConvError) {
          setConversations(prev => prev.filter(c => c.id !== newConvId));
          toast.error("Error al crear grupo");
          return;
        }

        const { error: addCreatorError } = await supabase.from("chat_participants").insert(
          { conversation_id: newConvId, user_id: user.id, role: "admin" }
        );

        if (addCreatorError) {
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          setConversations(prev => prev.filter(c => c.id !== newConvId));
          toast.error("Error al crear grupo");
          return;
        }

        if (memberIds.length > 0) {
          const { error: addMembersError } = await supabase.from("chat_participants").insert(
            memberIds.map((id) => ({
              conversation_id: newConvId,
              user_id: id,
              role: "member" as const,
            }))
          );

          if (addMembersError) {
            await supabase.from("chat_participants").delete().eq("conversation_id", newConvId);
            await supabase.from("chat_conversations").delete().eq("id", newConvId);
            setConversations(prev => prev.filter(c => c.id !== newConvId));
            toast.error("Error al crear grupo");
            return;
          }
        }

        toast.success(`Grupo "${name}" creado`);
      })();

      return newConvId;
    },
    [user]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return false;

      // Save for rollback
      const prevConversations = conversationsRef.current;

      // Optimistic UI — remove instantly
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      try {
        const { error } = await supabase.rpc("delete_conversation_cascade", {
          _conversation_id: conversationId,
        });

        if (error) throw error;

        toast.success("Conversación eliminada");
        return true;
      } catch (err) {
        console.error("Error deleting conversation:", err);
        toast.error("Error al eliminar conversación");
        // Rollback: restore previous state
        setConversations(prevConversations);
        return false;
      }
    },
    [user]
  );

  // Clear unread count locally and persist read state immediately
  const markConversationRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId && c.unreadCount > 0
          ? { ...c, unreadCount: 0 }
          : c
      )
    );

    if (!user) return;

    supabase
      .from("chat_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .then();
  }, [user]);

  return {
    conversations,
    loading,
    profiles,
    createDirectChat,
    createGroupChat,
    deleteConversation,
    loadConversations,
    markConversationRead,
  };
}

const PAGE_SIZE = 50;

export function useMessages(conversationId: string | null, onNewMessage?: (msg: ChatMessage) => void) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const onNewMessageRef = useRef(onNewMessage);
  const typingChannelRef = useRef<any>(null);
  const loadMessagesRef = useRef<() => Promise<void>>();
  const optimisticIdsRef = useRef<Set<string>>(new Set());
  const offlineQueueRef = useRef<Array<{
    optimisticId: string;
    conversationId: string;
    content: string;
    type: ChatMessage["type"];
    fileUrl?: string;
    fileName?: string;
    replyToId?: string;
  }>>([]);
  const [messagesRealtimeVersion, setMessagesRealtimeVersion] = useState(0);
  const messagesRealtimeRetryRef = useRef(0);
  const messagesRealtimeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref for loadOlderMessages to avoid stale closure on `messages`
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  onNewMessageRef.current = onNewMessage;

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(true);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      const sorted = ((data as ChatMessage[]) || []).reverse();
      setMessages(sorted);
      setHasMore((data?.length || 0) >= PAGE_SIZE);
      optimisticIdsRef.current.clear();

      // Backfill "entregado": al abrir la conversación, marcar como entregados los mensajes
      // de otros (los que llegaron mientras no estábamos conectados/mirando).
      if (user) {
        void markMessagesDelivered(user.id, sorted.filter(m => m.sender_id !== user.id).map(m => m.id));
      }

      // Mark as read
      if (user) {
        supabase
          .from("chat_participants")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .then();
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId, user]);

  // Keep ref updated for use inside effects without triggering re-subscriptions
  loadMessagesRef.current = loadMessages;

  // Load older messages (infinite scroll) — uses ref to avoid re-creation
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || loadingMore) return;
    const currentMessages = messagesRef.current;
    if (currentMessages.length === 0) return;
    
    setLoadingMore(true);
    const oldestMessage = currentMessages[0];
    
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (data && data.length > 0) {
        const older = (data as ChatMessage[]).reverse();
        setMessages(prev => [...older, ...prev]);
        setHasMore(data.length >= PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Flush offline queue when back online
  useEffect(() => {
    const handleOnline = async () => {
      if (!user) return;
      const queue = offlineQueueRef.current;
      if (queue.length === 0) return;
      offlineQueueRef.current = [];

      let synced = 0;
      for (const item of queue) {
        const { data, error } = await supabase.from("chat_messages").insert({
          conversation_id: item.conversationId,
          sender_id: user.id,
          content: item.content,
          type: item.type,
          file_url: item.fileUrl || null,
          file_name: item.fileName || null,
          reply_to_id: item.replyToId || null,
        }).select().single();

        if (!error && data) {
          synced += 1;
          const real = data as ChatMessage;
          optimisticIdsRef.current.delete(item.optimisticId);
          // Reemplazar el placeholder optimista por la fila real. Si el canal realtime
          // ya insertó esa fila (carrera), solo quitamos el optimista → nunca se duplica.
          setMessages((prev) =>
            prev.some((m) => m.id === real.id)
              ? prev.filter((m) => m.id !== item.optimisticId)
              : prev.map((m) => (m.id === item.optimisticId ? real : m))
          );
        } else {
          // Falló el re-envío → re-encolar para el próximo reconnect (no perder el mensaje).
          offlineQueueRef.current.push(item);
        }
      }
      if (synced > 0) toast.success(`${synced} mensaje(s) sincronizado(s)`);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [conversationId, user]);

  // Realtime messages with resilient reconnection
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    const userId = user.id;

    const scheduleMessagesReconnect = () => {
      if (messagesRealtimeReconnectTimerRef.current) return;

      messagesRealtimeRetryRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, messagesRealtimeRetryRef.current), 15000);

      messagesRealtimeReconnectTimerRef.current = setTimeout(() => {
        messagesRealtimeReconnectTimerRef.current = null;
        void loadMessagesRef.current?.();
        setMessagesRealtimeVersion((v) => v + 1);
      }, delay);
    };

    const channel = supabase
      .channel(`messages-${conversationId}-${messagesRealtimeVersion}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev;

            const optimisticMatch = prev.find(
              (m) =>
                optimisticIdsRef.current.has(m.id) &&
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000
            );

            if (optimisticMatch) {
              optimisticIdsRef.current.delete(optimisticMatch.id);
              return prev.map((m) => (m.id === optimisticMatch.id ? newMsg : m));
            }

            return [...prev, newMsg];
          });

          if (newMsg.sender_id !== userId) {
            onNewMessageRef.current?.(newMsg);
            if (document.hasFocus()) {
              supabase
                .from("chat_participants")
                .update({ last_read_at: new Date().toISOString() })
                .eq("conversation_id", conversationId)
                .eq("user_id", userId)
                .then();
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          messagesRealtimeRetryRef.current = 0;
          if (messagesRealtimeReconnectTimerRef.current) {
            clearTimeout(messagesRealtimeReconnectTimerRef.current);
            messagesRealtimeReconnectTimerRef.current = null;
          }
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleMessagesReconnect();
        }
      });

    // Mark as read when window regains focus
    const handleFocus = () => {
      supabase
        .from("chat_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId)
        .then();
    };
    window.addEventListener("focus", handleFocus);

    // Typing indicator via presence
    const presenceChannel = supabase
      .channel(`typing-${conversationId}`,
        {
          config: { presence: { key: userId } },
        })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing: string[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.typing && p.user_id !== userId) {
              typing.push(p.user_id);
            }
          });
        });
        setTypingUsers(typing);
      });

    typingChannelRef.current = presenceChannel;
    presenceChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void presenceChannel.track({ user_id: userId, typing: false });
      }
    });

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (messagesRealtimeReconnectTimerRef.current) {
        clearTimeout(messagesRealtimeReconnectTimerRef.current);
        messagesRealtimeReconnectTimerRef.current = null;
      }
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
      if (typingChannelRef.current === presenceChannel) {
        typingChannelRef.current = null;
      }
    };
  }, [conversationId, user?.id, messagesRealtimeVersion]);

  const sendMessage = useCallback(
    async (
      content: string,
      type: ChatMessage["type"] = "text",
      fileUrl?: string,
      fileName?: string,
      replyToId?: string
    ) => {
      if (!conversationId || !user) return;

      // Optimistic insert
      const optimisticId = crypto.randomUUID();
      optimisticIdsRef.current.add(optimisticId);

      const optimisticMsg: ChatMessage = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        type,
        file_url: fileUrl || null,
        file_name: fileName || null,
        file_size: null,
        reply_to_id: replyToId || null,
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      // If offline, queue the message (con el optimisticId para reconciliar por id al reconectar)
      if (!navigator.onLine) {
        offlineQueueRef.current.push({ optimisticId, conversationId, content, type, fileUrl, fileName, replyToId });
        toast.info("Sin conexión — el mensaje se enviará al reconectar");
        return;
      }

      const { data, error } = await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        type,
        file_url: fileUrl || null,
        file_name: fileName || null,
        reply_to_id: replyToId || null,
      }).select().single();

      if (error) {
        optimisticIdsRef.current.delete(optimisticId);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast.error("Error al enviar mensaje");
      } else if (data) {
        optimisticIdsRef.current.delete(optimisticId);
        setMessages((prev) => prev.map((m) => m.id === optimisticId ? (data as ChatMessage) : m));
      }

      // Fire-and-forget: don't block UI for the updated_at bump
      supabase
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .then();
    },
    [conversationId, user]
  );

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId || !user) return;
      const channel = typingChannelRef.current;
      if (!channel) return;
      await channel.track({ user_id: user.id, typing: isTyping });
    },
    [conversationId, user]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      // Si el mensaje todavía se está enviando (id optimista), el UPDATE no matchearía
      // ninguna fila real y la edición se perdería en silencio → bloquear hasta que persista.
      if (optimisticIdsRef.current.has(messageId)) {
        toast.info("Espera a que el mensaje termine de enviarse");
        return;
      }
      // Optimistic update
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, is_edited: true } : m));
      const { error } = await supabase
        .from("chat_messages")
        .update({ content: newContent, is_edited: true })
        .eq("id", messageId);
      if (error) {
        toast.error("Error al editar mensaje");
        void loadMessagesRef.current?.();
      }
    },
    []
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    // Igual que editMessage: si el id es optimista (aún enviándose), el UPDATE no
    // matchearía nada y el borrado se perdería en silencio → bloquear hasta que persista.
    if (optimisticIdsRef.current.has(messageId)) {
      toast.info("Espera a que el mensaje termine de enviarse");
      return;
    }
    // Optimistic soft delete
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true, content: null } : m));
    const { error } = await supabase
      .from("chat_messages")
      .update({ is_deleted: true, content: null })
      .eq("id", messageId);
    if (error) {
      toast.error("Error al eliminar mensaje");
      void loadMessagesRef.current?.();
    }
  }, []);

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    loadOlderMessages,
    typingUsers,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
  };
}

// Re-export from useReadReceipts.ts for backward compatibility
export { useReadReceipts } from "@/hooks/useReadReceipts";
