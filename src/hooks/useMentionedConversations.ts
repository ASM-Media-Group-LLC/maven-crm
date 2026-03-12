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

    const allMatchedConvIds = new Set<string>();

    // Query 1: match @fullName (case-insensitive)
    const { data: data1, error: err1 } = await supabase
      .from("chat_messages")
      .select("conversation_id")
      .in("conversation_id", stableConvIds)
      .eq("is_deleted", false)
      .neq("sender_id", user.id)
      .ilike("content", `%@${name}%`);

    if (err1) {
      console.error("[useMentionedConversations] query error (fullName):", err1);
    }
    if (data1) {
      data1.forEach((r: any) => allMatchedConvIds.add(r.conversation_id));
    }

    // Query 2: match @firstName if different from fullName
    if (firstName.toLowerCase() !== name.toLowerCase()) {
      const { data: data2, error: err2 } = await supabase
        .from("chat_messages")
        .select("conversation_id")
        .in("conversation_id", stableConvIds)
        .eq("is_deleted", false)
        .neq("sender_id", user.id)
        .ilike("content", `%@${firstName}%`);

      if (err2) {
        console.error("[useMentionedConversations] query error (firstName):", err2);
      }
      if (data2) {
        data2.forEach((r: any) => allMatchedConvIds.add(r.conversation_id));
      }
    }

    console.log("[useMentionedConversations] user:", name, "matched:", allMatchedConvIds.size, "/", stableConvIds.length);
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
          if (
            msg.sender_id !== user.id &&
            msg.content?.includes("@")
          ) {
            // Refresh to pick up new mentions
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
