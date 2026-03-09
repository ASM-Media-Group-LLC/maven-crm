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
import { toast } from "sonner";

export function useChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const profilesRef = useRef(profiles);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  profilesRef.current = profiles;

  // Load all profiles once
  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url");
    if (data) {
      const map: Record<string, UserProfile> = {};
      data.forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
  }, []);

  // Load conversations with participants and last message
  const loadConversations = useCallback(async () => {
    if (!user) return;

    // Get conversations user participates in
    const { data: participations } = await supabase
      .from("chat_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      return;
    }

    const convIds = participations.map((p: any) => p.conversation_id);

    // Get conversations
    const { data: convs } = await supabase
      .from("chat_conversations")
      .select("*")
      .in("id", convIds)
      .order("updated_at", { ascending: false });

    if (!convs) {
      setConversations([]);
      return;
    }

    // Get all participants for these conversations
    const { data: allParticipants } = await supabase
      .from("chat_participants")
      .select("*")
      .in("conversation_id", convIds);

    // Get last message for each conversation
    const enriched: ConversationWithDetails[] = await Promise.all(
      convs.map(async (conv: any) => {
        const convParticipants = (allParticipants || []).filter(
          (p: any) => p.conversation_id === conv.id
        );

        // Get last message
        const { data: lastMsgs } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const lastMessage = lastMsgs?.[0] || undefined;

        // Count unread messages
        const myParticipation = convParticipants.find(
          (p: any) => p.user_id === user.id
        );
        let unreadCount = 0;
        if (myParticipation?.last_read_at) {
          const { count } = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", user.id)
            .gt("created_at", myParticipation.last_read_at);
          unreadCount = count || 0;
        } else if (lastMessage) {
          const { count } = await supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", user.id);
          unreadCount = count || 0;
        }

        // Display name
        let displayName = conv.name || "";
        if (conv.type === "direct") {
          const otherParticipant = convParticipants.find(
            (p: any) => p.user_id !== user.id
          );
          if (otherParticipant) {
            displayName =
              profilesRef.current[otherParticipant.user_id]?.full_name ||
              "Usuario";
          }
        }

        return {
          ...conv,
          participants: convParticipants.map((p: any) => ({
            ...p,
            profile: profilesRef.current[p.user_id],
          })),
          lastMessage,
          unreadCount,
          displayName,
        } as ConversationWithDetails;
      })
    );

    // Sort: most recent first
    enriched.sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.updated_at;
      const bTime = b.lastMessage?.created_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setConversations(enriched);
    setLoading(false);
  }, [user]);

  // Initial load
  useEffect(() => {
    loadProfiles().then(() => loadConversations());
  }, [loadProfiles, loadConversations]);

  // Realtime subscription for conversation sync
  useEffect(() => {
    if (!user) return;

    const scheduleConversationsReload = (isDeleteEvent = false) => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        void loadConversations();
      }, 180);

      if (isDeleteEvent) {
        if (delayedRefreshTimeoutRef.current) clearTimeout(delayedRefreshTimeoutRef.current);
        delayedRefreshTimeoutRef.current = setTimeout(() => {
          void loadConversations();
        }, 900);
      }
    };

    const channel = supabase
      .channel("chat-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => {
          scheduleConversationsReload();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_participants" },
        (payload) => {
          scheduleConversationsReload(payload.eventType === "DELETE");
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        (payload) => {
          scheduleConversationsReload(payload.eventType === "DELETE");
        }
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      if (delayedRefreshTimeoutRef.current) clearTimeout(delayedRefreshTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations]);

  // Create direct conversation
  const createDirectChat = useCallback(
    async (otherUserId: string) => {
      if (!user) return null;

      // Check if direct chat already exists
      const { data: myConvs } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (myConvs) {
        const convIds = myConvs.map((mc: any) => mc.conversation_id);
        
        // Get only direct conversations in a single query
        const { data: directConvs } = await supabase
          .from("chat_conversations")
          .select("id")
          .in("id", convIds)
          .eq("type", "direct");

        if (directConvs) {
          const directIds = directConvs.map((c: any) => c.id);
          
          // Check if the other user is a participant in any of these
          const { data: otherP } = await supabase
            .from("chat_participants")
            .select("conversation_id")
            .in("conversation_id", directIds)
            .eq("user_id", otherUserId)
            .limit(1);

          if (otherP && otherP.length > 0) {
            return otherP[0].conversation_id;
          }
        }
      }

      // Create new conversation
      const newConvId = crypto.randomUUID();
      const { error: createConvError } = await supabase
        .from("chat_conversations")
        .insert({ id: newConvId, type: "direct", created_by: user.id });

      if (createConvError) {
        toast.error("Error al crear conversación");
        return null;
      }

      // Add creator first (so RLS recognizes them as participant)
      const { error: addCreatorError } = await supabase.from("chat_participants").insert(
        { conversation_id: newConvId, user_id: user.id, role: "admin" }
      );

      if (addCreatorError) {
        await supabase.from("chat_conversations").delete().eq("id", newConvId);
        toast.error("Error al crear conversación");
        return null;
      }

      const { error: addOtherError } = await supabase.from("chat_participants").insert(
        { conversation_id: newConvId, user_id: otherUserId, role: "member" }
      );

      if (addOtherError) {
        await supabase.from("chat_conversations").delete().eq("id", newConvId);
        toast.error("Error al crear conversación");
        return null;
      }

      await loadConversations();
      return newConvId;
    },
    [user, loadConversations]
  );

  // Create group conversation
  const createGroupChat = useCallback(
    async (name: string, memberIds: string[]) => {
      if (!user) return null;

      const newConvId = crypto.randomUUID();
      const { error: createConvError } = await supabase
        .from("chat_conversations")
        .insert({ id: newConvId, type: "group", name, created_by: user.id });

      if (createConvError) {
        toast.error("Error al crear grupo");
        return null;
      }

      // Add creator first (so RLS recognizes them as participant)
      const { error: addCreatorError } = await supabase.from("chat_participants").insert(
        { conversation_id: newConvId, user_id: user.id, role: "admin" }
      );

      if (addCreatorError) {
        await supabase.from("chat_conversations").delete().eq("id", newConvId);
        toast.error("Error al crear grupo");
        return null;
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
          await supabase.from("chat_conversations").delete().eq("id", newConvId);
          toast.error("Error al crear grupo");
          return null;
        }
      }

      await loadConversations();
      toast.success(`Grupo "${name}" creado`);
      return newConvId;
    },
    [user, loadConversations]
  );

  // Delete conversation (and all related data)
  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return false;

      // Delete messages, reactions, read receipts, participants, then conversation
      // Order matters due to foreign keys
      const { error: msgError } = await supabase
        .from("chat_messages")
        .delete()
        .eq("conversation_id", conversationId);

      if (msgError) {
        toast.error("Error al eliminar mensajes");
        return false;
      }

      const { error: partError } = await supabase
        .from("chat_participants")
        .delete()
        .eq("conversation_id", conversationId);

      if (partError) {
        toast.error("Error al eliminar participantes");
        return false;
      }

      const { error: convError } = await supabase
        .from("chat_conversations")
        .delete()
        .eq("id", conversationId);

      if (convError) {
        toast.error("Error al eliminar conversación");
        return false;
      }

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      toast.success("Conversación eliminada");
      return true;
    },
    [user]
  );

  return {
    conversations,
    loading,
    profiles,
    createDirectChat,
    createGroupChat,
    deleteConversation,
    loadConversations,
  };
}

export function useMessages(conversationId: string | null, onNewMessage?: (msg: ChatMessage) => void) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const onNewMessageRef = useRef(onNewMessage);
  const typingChannelRef = useRef<any>(null);
  onNewMessageRef.current = onNewMessage;

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    setMessages((data as ChatMessage[]) || []);
    setLoading(false);

    // Mark as read
    if (user) {
      await supabase
        .from("chat_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
    }
  }, [conversationId, user]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime messages
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
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
            return [...prev, newMsg];
          });

          // Notify via callback for browser notifications
          if (user && newMsg.sender_id !== user.id) {
            onNewMessageRef.current?.(newMsg);
          }

          // Mark as read if we're viewing this conversation
          if (user && newMsg.sender_id !== user.id) {
            supabase
              .from("chat_participants")
              .update({ last_read_at: new Date().toISOString() })
              .eq("conversation_id", conversationId)
              .eq("user_id", user.id)
              .then();
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
      .subscribe();

    // Typing indicator via presence
    const presenceChannel = supabase
      .channel(`typing-${conversationId}`, {
        config: { presence: { key: user?.id ?? `anon-${conversationId}` } },
      })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing: string[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.typing && p.user_id !== user?.id) {
              typing.push(p.user_id);
            }
          });
        });
        setTypingUsers(typing);
      });

    typingChannelRef.current = presenceChannel;
    presenceChannel.subscribe((status) => {
      if (status === "SUBSCRIBED" && user) {
        void presenceChannel.track({ user_id: user.id, typing: false });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
      if (typingChannelRef.current === presenceChannel) {
        typingChannelRef.current = null;
      }
    };
  }, [conversationId, user]);

  const sendMessage = useCallback(
    async (
      content: string,
      type: ChatMessage["type"] = "text",
      fileUrl?: string,
      fileName?: string,
      replyToId?: string
    ) => {
      if (!conversationId || !user) return;

      // Optimistic insert so the message appears instantly
      const optimisticId = crypto.randomUUID();
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
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast.error("Error al enviar mensaje");
      } else if (data) {
        // Replace optimistic with real message
        setMessages((prev) => prev.map((m) => m.id === optimisticId ? (data as ChatMessage) : m));
      }

      // Update conversation updated_at
      await supabase
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
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
      await supabase
        .from("chat_messages")
        .update({ content: newContent, is_edited: true })
        .eq("id", messageId);
    },
    []
  );

  const deleteMessage = useCallback(async (messageId: string) => {
    await supabase
      .from("chat_messages")
      .update({ is_deleted: true, content: null })
      .eq("id", messageId);
  }, []);

  return {
    messages,
    loading,
    typingUsers,
    sendMessage,
    sendTyping,
    editMessage,
    deleteMessage,
  };
}

export function useReadReceipts(messageIds: string[]) {
  const [receipts, setReceipts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (messageIds.length === 0) return;

    const load = async () => {
      const { data } = await supabase
        .from("chat_read_receipts")
        .select("message_id")
        .in("message_id", messageIds);

      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((r: any) => {
          counts[r.message_id] = (counts[r.message_id] || 0) + 1;
        });
        setReceipts(counts);
      }
    };
    load();
  }, [messageIds]);

  return receipts;
}
