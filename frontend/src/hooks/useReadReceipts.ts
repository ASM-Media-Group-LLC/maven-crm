import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

  // Stabilize messageIds to avoid infinite channel re-subscriptions
  const messageIdsKey = messageIds.join(",");
  const stableMessageIds = useMemo(() => messageIds, [messageIdsKey]);

  const loadReceipts = useCallback(async () => {
    if (!conversationId || stableMessageIds.length === 0) { setReceipts([]); return; }
    const last50 = stableMessageIds.slice(-50);
    const { data } = await supabase
      .from("chat_read_receipts")
      .select("message_id, user_id, read_at")
      .in("message_id", last50);
    if (data) setReceipts(data as ReadReceipt[]);
  }, [conversationId, stableMessageIds]);

  useEffect(() => { loadReceipts(); }, [loadReceipts]);

  // Refs para que la subscripción realtime NO dependa de la lista de mensajes.
  // Antes el canal dependía de stableMessageIds → con cada mensaje nuevo se tiraba
  // y re-suscribía el WebSocket (+ re-fetch). Ahora se suscribe UNA vez por
  // conversación y filtra contra un Set en ref siempre actualizado.
  const trackedIdsRef = useRef<Set<string>>(new Set());
  trackedIdsRef.current = new Set(stableMessageIds);
  const loadReceiptsRef = useRef(loadReceipts);
  loadReceiptsRef.current = loadReceipts;

  // Realtime sync for read receipts in active conversation
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`read-receipts-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_read_receipts" },
        (payload) => {
          const receipt = payload.new as ReadReceipt;
          if (!trackedIdsRef.current.has(receipt.message_id)) return;

          setReceipts((prev) =>
            prev.some(
              (r) =>
                r.message_id === receipt.message_id &&
                r.user_id === receipt.user_id
            )
              ? prev
              : [...prev, receipt]
          );
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void loadReceiptsRef.current();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Batch mark messages as read — single upsert instead of N inserts
  const markAsRead = useCallback(async (msgIds: string[]) => {
    if (!user || msgIds.length === 0) return;
    const rows = msgIds.map(id => ({ message_id: id, user_id: user.id, read_at: new Date().toISOString() }));
    // Batch upsert: single round-trip, ignores duplicates via onConflict
    await supabase
      .from("chat_read_receipts")
      .upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
  }, [user]);

  // Auto-mark visible messages as read only when window is focused
  const receiptsRef = useRef(receipts);
  receiptsRef.current = receipts;

  useEffect(() => {
    if (!user || !conversationId || stableMessageIds.length === 0) return;

    const markUnread = () => {
      if (!document.hasFocus()) return;
      const unread = stableMessageIds.filter(id =>
        !receiptsRef.current.find(r => r.message_id === id && r.user_id === user.id)
      );
      if (unread.length > 0) markAsRead(unread);
    };

    markUnread();

    window.addEventListener("focus", markUnread);
    return () => window.removeEventListener("focus", markUnread);
  }, [stableMessageIds, user, conversationId, markAsRead]);

  const getReadBy = useCallback((messageId: string): string[] => {
    return receipts.filter(r => r.message_id === messageId && r.user_id !== user?.id).map(r => r.user_id);
  }, [receipts, user]);

  const getReadCount = useCallback((messageId: string): number => {
    return receipts.filter(r => r.message_id === messageId && r.user_id !== user?.id).length;
  }, [receipts, user]);

  return { getReadBy, getReadCount, markAsRead };
}
