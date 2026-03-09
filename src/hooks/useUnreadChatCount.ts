import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns the total number of unread chat messages across all conversations.
 * Subscribes to realtime updates so the count stays fresh.
 */
export function useUnreadChatCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }

    // Get all conversations the user participates in
    const { data: participations } = await supabase
      .from("chat_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) { setCount(0); return; }

    let total = 0;
    for (const p of participations) {
      let query = supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", p.conversation_id)
        .neq("sender_id", user.id);

      if (p.last_read_at) {
        query = query.gt("created_at", p.last_read_at);
      }

      const { count: c } = await query;
      total += c || 0;
    }
    setCount(total);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Listen for new messages to refresh count
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("unread-count-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          if (payload.new && (payload.new as any).sender_id !== user.id) {
            refresh();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_participants" },
        (payload) => {
          if (payload.new && (payload.new as any).user_id === user.id) {
            refresh();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  return count;
}
