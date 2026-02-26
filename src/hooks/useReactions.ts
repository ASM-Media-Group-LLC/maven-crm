import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  includesMe: boolean;
}

export function useReactions(conversationId: string | null) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const messageIdsRef = useRef<Set<string>>(new Set());

  const loadReactions = useCallback(async () => {
    if (!conversationId) { setReactions([]); messageIdsRef.current = new Set(); return; }

    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conversationId);

    if (!msgs || msgs.length === 0) { setReactions([]); messageIdsRef.current = new Set(); return; }

    const msgIds = msgs.map((m: any) => m.id);
    messageIdsRef.current = new Set(msgIds);

    const allReactions: Reaction[] = [];
    for (let i = 0; i < msgIds.length; i += 100) {
      const chunk = msgIds.slice(i, i + 100);
      const { data } = await supabase
        .from("chat_reactions")
        .select("*")
        .in("message_id", chunk);
      if (data) allReactions.push(...(data as Reaction[]));
    }
    setReactions(allReactions);
  }, [conversationId]);

  useEffect(() => { loadReactions(); }, [loadReactions]);

  // Realtime: always re-sync from DB on reaction changes to avoid stale/race conditions
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions" }, () => {
        void loadReactions();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, () => {
        void loadReactions();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void loadReactions();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadReactions]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    let removedReaction: Reaction | null = null;
    let existingId: string | null = null;

    setReactions(prev => {
      const found = prev.find(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
      if (!found) return prev;
      removedReaction = found;
      existingId = found.id;
      return prev.filter(r => r.id !== found.id);
    });

    if (existingId) {
      const { error } = await supabase.from("chat_reactions").delete().eq("id", existingId);
      if (error && removedReaction) {
        setReactions(prev => prev.find(r => r.id === removedReaction!.id) ? prev : [...prev, removedReaction!]);
      }
      return;
    }

    const tempId = crypto.randomUUID();
    const tempReaction: Reaction = {
      id: tempId,
      message_id: messageId,
      user_id: user.id,
      emoji,
      created_at: new Date().toISOString(),
    };

    setReactions(prev => [...prev, tempReaction]);

    const { data, error } = await supabase.from("chat_reactions").insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    }).select().single();

    if (data) {
      setReactions(prev => {
        const withoutTemp = prev.filter(r => r.id !== tempId);
        return withoutTemp.some(r => r.id === (data as Reaction).id)
          ? withoutTemp
          : [...withoutTemp, data as Reaction];
      });
    } else if (error) {
      setReactions(prev => prev.filter(r => r.id !== tempId));
    }
  }, [user]);

  // Track new messages added to the conversation
  const addMessageId = useCallback((msgId: string) => {
    messageIdsRef.current.add(msgId);
  }, []);

  const getReactionsForMessage = useCallback((messageId: string): ReactionGroup[] => {
    const msgReactions = reactions.filter(r => r.message_id === messageId);
    const grouped: Record<string, { count: number; users: string[]; includesMe: boolean }> = {};
    msgReactions.forEach(r => {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], includesMe: false };
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_id);
      if (r.user_id === user?.id) grouped[r.emoji].includesMe = true;
    });
    return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
  }, [reactions, user]);

  return { toggleReaction, getReactionsForMessage, addMessageId };
}
