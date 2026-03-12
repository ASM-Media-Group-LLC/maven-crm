import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns a Set of conversation IDs where the current user
 * has been mentioned (@fullName or @firstName) in any message.
 */
export function useMentionedConversations(
  currentUserName: string | null | undefined,
  conversationIds: string[],
) {
  const { user } = useAuth();
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const channelCounterRef = useRef(0);

  // Stabilize conversationIds by joining into a string key
  const convIdsKey = useMemo(() => conversationIds.join(","), [conversationIds]);
  const stableConvIds = useMemo(() => conversationIds, [convIdsKey]);

  const refresh = useCallback(async () => {
    if (!user || !currentUserName || stableConvIds.length === 0) {
      setMentionedIds(new Set());
      return;
    }

    const name = currentUserName.trim();
    if (!name) {
      setMentionedIds(new Set());
      return;
    }
    const firstName = name.split(" ")[0];

    // First, get the user's last_read_at per conversation
    const { data: participants, error: partErr } = await supabase
      .from("chat_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id)
      .in("conversation_id", stableConvIds);

    if (partErr) {
      console.error("[useMentionedConversations] participants query error:", partErr);
      setMentionedIds(new Set());
      return;
    }

    const lastReadMap = new Map<string, string | null>();
    (participants || []).forEach((p: any) => {
      lastReadMap.set(p.conversation_id, p.last_read_at);
    });

    const allMatchedConvIds = new Set<string>();

    // For each conversation, only find mentions AFTER last_read_at
    for (const convId of stableConvIds) {
      const lastRead = lastReadMap.get(convId);

      let q1 = supabase
        .from("chat_messages")
        .select("id")
        .eq("conversation_id", convId)
        .eq("is_deleted", false)
        .neq("sender_id", user.id)
        .ilike("content", `%@${name}%`)
        .limit(1);

      if (lastRead) {
        q1 = q1.gt("created_at", lastRead);
      }

      const { data: d1 } = await q1;
      if (d1 && d1.length > 0) {
        allMatchedConvIds.add(convId);
        continue; // already matched, skip firstName query
      }

      // Query 2: @firstName
      if (firstName.toLowerCase() !== name.toLowerCase()) {
        let q2 = supabase
          .from("chat_messages")
          .select("id")
          .eq("conversation_id", convId)
          .eq("is_deleted", false)
          .neq("sender_id", user.id)
          .ilike("content", `%@${firstName}%`)
          .limit(1);

        if (lastRead) {
          q2 = q2.gt("created_at", lastRead);
        }

        const { data: d2 } = await q2;
        if (d2 && d2.length > 0) {
          allMatchedConvIds.add(convId);
        }
      }
    }

    setMentionedIds(allMatchedConvIds);
  }, [user, currentUserName, stableConvIds]);

  // Refresh when dependencies change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to realtime inserts on chat_messages to catch new mentions
  useEffect(() => {
    if (!user || stableConvIds.length === 0 || !currentUserName) return;

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Use unique channel name to prevent Supabase JS from reusing stale channel
    channelCounterRef.current += 1;
    const channelName = `mentions-rt-${user.id.slice(0, 8)}-${channelCounterRef.current}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id !== user.id && msg.content?.includes("@")) {
            refresh();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_participants",
        },
        (payload) => {
          const row = payload.new as any;
          // When current user's last_read_at changes, re-check mentions
          if (row.user_id === user.id) {
            refresh();
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, currentUserName, stableConvIds, refresh]);

  return { mentionedIds, refreshMentions: refresh };
}
