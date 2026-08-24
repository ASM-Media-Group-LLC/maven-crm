import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePinnedChats() {
  const { user } = useAuth();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  // Orden manual de los fijados (conversation_ids ordenados por chat_pinned.position).
  const [pinnedOrder, setPinnedOrder] = useState<string[]>([]);

  const loadPinned = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_pinned")
      .select("conversation_id, position")
      .eq("user_id", user.id)
      .order("position", { ascending: true });
    if (data) {
      setPinnedIds(new Set(data.map((r: any) => r.conversation_id)));
      setPinnedOrder(data.map((r: any) => r.conversation_id));
    }
  }, [user]);

  useEffect(() => { loadPinned(); }, [loadPinned]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("pinned-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_pinned" }, () => { void loadPinned(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadPinned]);

  const togglePin = useCallback(async (conversationId: string) => {
    if (!user) return;
    const isPinned = pinnedIds.has(conversationId);
    if (isPinned) {
      const { error } = await supabase
        .from("chat_pinned")
        .delete()
        .eq("user_id", user.id)
        .eq("conversation_id", conversationId);
      if (!error) {
        setPinnedIds(prev => { const next = new Set(prev); next.delete(conversationId); return next; });
        setPinnedOrder(prev => prev.filter(id => id !== conversationId));
        toast.success("Chat desanclado");
      }
    } else {
      // Nuevo fijado va al final del grupo de fijados (position = cantidad actual).
      const { error } = await supabase
        .from("chat_pinned")
        .insert({ user_id: user.id, conversation_id: conversationId, position: pinnedOrder.length });
      if (!error) {
        setPinnedIds(prev => new Set(prev).add(conversationId));
        setPinnedOrder(prev => [...prev, conversationId]);
        toast.success("Chat anclado");
      }
    }
  }, [user, pinnedIds, pinnedOrder]);

  // Reordenar los fijados: recibe el nuevo orden completo de conversation_ids y persiste la
  // posición de cada uno (índice en el array). Optimista + update por fila.
  const reorderPinned = useCallback(async (orderedIds: string[]) => {
    if (!user) return;
    setPinnedOrder(orderedIds);
    await Promise.all(
      orderedIds.map((cid, i) =>
        supabase.from("chat_pinned").update({ position: i }).eq("user_id", user.id).eq("conversation_id", cid)
      )
    );
  }, [user]);

  const isPinned = useCallback((conversationId: string) => pinnedIds.has(conversationId), [pinnedIds]);

  return { isPinned, togglePin, pinnedIds, pinnedOrder, reorderPinned };
}
