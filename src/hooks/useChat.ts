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
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const profilesRef = useRef(profiles);
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
      setLoading(false);
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
      setLoading(false);
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

  // Realtime subscription for new messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("chat-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => {
          // Reload conversations to update last message and unread counts
          loadConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_participants" },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
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
        for (const mc of myConvs) {
          const { data: conv } = await supabase
            .from("chat_conversations")
            .select("*")
            .eq("id", mc.conversation_id)
            .eq("type", "direct")
            .single();

          if (conv) {
            const { data: otherP } = await supabase
              .from("chat_participants")
              .select("user_id")
              .eq("conversation_id", conv.id)
              .eq("user_id", otherUserId)
              .single();

            if (otherP) {
              return conv.id;
            }
          }
        }
      }

      // Create new conversation
      const { data: newConv, error } = await supabase
        .from("chat_conversations")
        .insert({ type: "direct", created_by: user.id })
        .select()
        .single();

      if (error || !newConv) {
        toast.error("Error al crear conversación");
        return null;
      }

      // Add both participants
      await supabase.from("chat_participants").insert([
        { conversation_id: newConv.id, user_id: user.id, role: "admin" },
        { conversation_id: newConv.id, user_id: otherUserId, role: "member" },
      ]);

      await loadConversations();
      return newConv.id;
    },
    [user, loadConversations]
  );

  // Create group conversation
  const createGroupChat = useCallback(
    async (name: string, memberIds: string[]) => {
      if (!user) return null;

      const { data: newConv, error } = await supabase
        .from("chat_conversations")
        .insert({ type: "group", name, created_by: user.id })
        .select()
        .single();

      if (error || !newConv) {
        toast.error("Error al crear grupo");
        return null;
      }

      const participants = [
        { conversation_id: newConv.id, user_id: user.id, role: "admin" as const },
        ...memberIds.map((id) => ({
          conversation_id: newConv.id,
          user_id: id,
          role: "member" as const,
        })),
      ];

      await supabase.from("chat_participants").insert(participants);
      await loadConversations();
      toast.success(`Grupo "${name}" creado`);
      return newConv.id;
    },
    [user, loadConversations]
  );

  return {
    conversations,
    loading,
    profiles,
    createDirectChat,
    createGroupChat,
    loadConversations,
  };
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

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
      .channel(`typing-${conversationId}`)
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
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
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

      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        type,
        file_url: fileUrl || null,
        file_name: fileName || null,
        reply_to_id: replyToId || null,
      });

      if (error) {
        toast.error("Error al enviar mensaje");
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
      const channel = supabase.channel(`typing-${conversationId}`);
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
