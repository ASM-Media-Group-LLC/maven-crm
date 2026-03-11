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
  const reactionsRef = useRef<Reaction[]>([]);

  // Keep ref in sync for synchronous reads in toggleReaction
  useEffect(() => { reactionsRef.current = reactions; }, [reactions]);

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
    // Parallel chunk fetching instead of sequential
    const chunks: string[][] = [];
    for (let i = 0; i < msgIds.length; i += 100) {
      chunks.push(msgIds.slice(i, i + 100));
    }
    const results = await Promise.all(
      chunks.map(chunk =>
        supabase.from("chat_reactions").select("*").in("message_id", chunk)
      )
    );
    for (const { data } of results) {
      if (data) allReactions.push(...(data as Reaction[]));
    }
    setReactions(allReactions);
  }, [conversationId]);

  // Lightweight refresh: only fetch reactions for known message IDs (skip re-fetching message list)
  const refreshReactions = useCallback(async () => {
    if (!conversationId || messageIdsRef.current.size === 0) return;

    const msgIds = Array.from(messageIdsRef.current);
    const allReactions: Reaction[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < msgIds.length; i += 100) {
      chunks.push(msgIds.slice(i, i + 100));
    }
    const results = await Promise.all(
      chunks.map(chunk =>
        supabase.from("chat_reactions").select("*").in("message_id", chunk)
      )
    );
    for (const { data } of results) {
      if (data) allReactions.push(...(data as Reaction[]));
    }
    setReactions(allReactions);
  }, [conversationId]);

  useEffect(() => { loadReactions(); }, [loadReactions]);

  // Realtime: use lightweight refresh (skip message ID re-fetch)
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions" }, () => {
        void refreshReactions();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, () => {
        void refreshReactions();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void refreshReactions();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, refreshReactions]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    // Read current state synchronously from ref to avoid closure bugs
    const current = reactionsRef.current;
    const existing = current.find(
      r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji
    );

    if (existing) {
      // Optimistic remove
      setReactions(prev => prev.filter(r => r.id !== existing.id));
      const { error } = await supabase.from("chat_reactions").delete().eq("id", existing.id);
      if (error) {
        // Rollback
        setReactions(prev =>
          prev.find(r => r.id === existing.id) ? prev : [...prev, existing]
        );
      }
      return;
    }

    // Optimistic add
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
