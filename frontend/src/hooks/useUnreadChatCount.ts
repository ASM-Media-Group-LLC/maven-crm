import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns the total number of unread chat messages across all conversations.
 * Uses a single server-side function instead of N+1 queries.
 */
export function useUnreadChatCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }

    const { data, error } = await supabase.rpc("get_unread_counts", {
      _user_id: user.id,
    });

    if (error || !data) { setCount(0); return; }

    const total = (data as any[]).reduce((sum, row) => sum + (row.unread_count || 0), 0);
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
