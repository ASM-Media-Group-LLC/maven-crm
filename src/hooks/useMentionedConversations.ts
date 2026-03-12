import { useState, useEffect, useCallback, useRef } from "react";
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

  const refresh = useCallback(async () => {
    if (!user || !currentUserName || conversationIds.length === 0) {
      setMentionedIds(new Set());
      return;
    }

    const name = currentUserName.toLowerCase();
    const firstName = name.split(" ")[0];

    // Build ILIKE patterns
    const patterns = [`%@${name}%`];
    if (firstName !== name) patterns.push(`%@${firstName}%`);

    // Query messages that mention the user across all their conversations
    // We use an OR of ilike patterns
    let query = supabase
      .from("chat_messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .eq("is_deleted", false)
      .neq("sender_id", user.id);

    if (patterns.length === 1) {
      query = query.ilike("content", patterns[0]);
    } else {
      query = query.or(patterns.map(p => `content.ilike.${p}`).join(","));
    }

    const { data } = await query;

    if (data) {
      const ids = new Set(data.map((r: any) => r.conversation_id as string));
      setMentionedIds(ids);
    }
  }, [user, currentUserName, conversationIds]);

  // Refresh when conversations or user name change
  useEffect(() => {
    const key = `${currentUserName}|${conversationIds.join(",")}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    refresh();
  }, [refresh, currentUserName, conversationIds]);

  // Subscribe to realtime inserts on chat_messages to catch new mentions
  useEffect(() => {
    if (!user || conversationIds.length === 0) return;

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
          // Only refresh if the message is in one of our conversations,
          // not from us, and contains an @ symbol
          if (
            conversationIds.includes(msg.conversation_id) &&
            msg.sender_id !== user.id &&
            msg.content?.includes("@")
          ) {
            refresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, conversationIds, refresh]);

  return { mentionedIds, refreshMentions: refresh };
}
