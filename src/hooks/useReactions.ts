import { useState, useEffect, useCallback } from "react";
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

  const loadReactions = useCallback(async () => {
    if (!conversationId) { setReactions([]); return; }

    // Get all message IDs for this conversation, then reactions
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conversationId);

    if (!msgs || msgs.length === 0) { setReactions([]); return; }

    const msgIds = msgs.map((m: any) => m.id);
    // Batch in chunks of 100
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

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions" }, (payload) => {
        const r = payload.new as Reaction;
        setReactions(prev => prev.find(x => x.id === r.id) ? prev : [...prev, r]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, (payload) => {
        const id = (payload.old as any).id;
        setReactions(prev => prev.filter(x => x.id !== id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("chat_reactions").delete().eq("id", existing.id);
      setReactions(prev => prev.filter(r => r.id !== existing.id));
    } else {
      const { data, error } = await supabase.from("chat_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      }).select().single();
      if (data) setReactions(prev => [...prev, data as Reaction]);
    }
  }, [user, reactions]);

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

  return { toggleReaction, getReactionsForMessage };
}
