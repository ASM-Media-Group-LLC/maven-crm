import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns a Set of conversation IDs where the current user
 * has been mentioned (@fullName or @firstName) in any message.
 */
export function useMentionedConversations(
  currentUserName: string | null,
  conversationIds: string[],
) {
  const { user } = useAuth();
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const prevKey = useRef("");

  // Stabilize conversationIds to avoid unnecessary re-renders
  const stableConvIds = useMemo(() => conversationIds, [conversationIds.join(",")]);

  const refresh = useCallback(async () => {
    if (!user || !currentUserName || stableConvIds.length === 0) {
      setMentionedIds(new Set());
      return;
    }

    const name = currentUserName.trim();
    const firstName = name.split(" ")[0];

    // Query with two separate calls to avoid PostgREST OR filter issues
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

    console.log("[useMentionedConversations] user:", name, "matched conversations:", allMatchedConvIds.size, "from", stableConvIds.length, "total conversations");
    setMentionedIds(allMatchedConvIds);
  }, [user, currentUserName, stableConvIds]);

  // Refresh when conversations or user name change
  useEffect(() => {
    const key = `${currentUserName}|${stableConvIds.join(",")}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    refresh();
  }, [refresh, currentUserName, stableConvIds]);

  // Subscribe to realtime inserts on chat_messages to catch new mentions
  useEffect(() => {
    if (!user || stableConvIds.length === 0) return;

    const channel = supabase
      .channel("mentions-realtime")
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
            stableConvIds.includes(msg.conversation_id) &&
            msg.sender_id !== user.id &&
            msg.content?.includes("@")
          ) {
            console.log("[useMentionedConversations] realtime mention detected, refreshing...");
            refresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, stableConvIds, refresh]);

  return { mentionedIds, refreshMentions: refresh };
}
