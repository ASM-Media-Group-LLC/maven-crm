import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ReadReceipt {
  message_id: string;
  user_id: string;
  read_at: string;
}

export function useReadReceipts(conversationId: string | null, messageIds: string[]) {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);

  const loadReceipts = useCallback(async () => {
    if (!conversationId || messageIds.length === 0) { setReceipts([]); return; }
    const last50 = messageIds.slice(-50);
    const { data } = await supabase
      .from("chat_read_receipts")
      .select("message_id, user_id, read_at")
      .in("message_id", last50);
    if (data) setReceipts(data as ReadReceipt[]);
  }, [conversationId, messageIds.length]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  // Mark messages as read by inserting read receipts
  const markAsRead = useCallback(async (msgIds: string[]) => {
    if (!user || msgIds.length === 0) return;
    // Insert one by one, ignoring errors for duplicates
    for (const id of msgIds) {
      await supabase.from("chat_read_receipts").insert({ message_id: id, user_id: user.id }).maybeSingle();
    }
  }, [user]);

  // Auto-mark visible messages as read
  useEffect(() => {
    if (!user || !conversationId || messageIds.length === 0) return;
    const unread = messageIds.filter(id => {
      return !receipts.find(r => r.message_id === id && r.user_id === user.id);
    });
    // Only mark messages not sent by me
    // We don't have sender info here, so mark all — duplicates are ignored
    if (unread.length > 0) markAsRead(unread);
  }, [messageIds, user, conversationId, receipts, markAsRead]);

  const getReadBy = useCallback((messageId: string): string[] => {
    return receipts.filter(r => r.message_id === messageId && r.user_id !== user?.id).map(r => r.user_id);
  }, [receipts, user]);

  const getReadCount = useCallback((messageId: string): number => {
    return receipts.filter(r => r.message_id === messageId && r.user_id !== user?.id).length;
  }, [receipts, user]);

  return { getReadBy, getReadCount, markAsRead };
}
