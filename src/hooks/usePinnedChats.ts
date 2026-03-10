import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePinnedChats() {
  const { user } = useAuth();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const loadPinned = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_pinned")
      .select("conversation_id")
      .eq("user_id", user.id);
    if (data) {
      setPinnedIds(new Set(data.map((r: any) => r.conversation_id)));
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
        toast.success("Chat desanclado");
      }
    } else {
      const { error } = await supabase
        .from("chat_pinned")
        .insert({ user_id: user.id, conversation_id: conversationId });
      if (!error) {
        setPinnedIds(prev => new Set(prev).add(conversationId));
        toast.success("Chat anclado");
      }
    }
  }, [user, pinnedIds]);

  const isPinned = useCallback((conversationId: string) => pinnedIds.has(conversationId), [pinnedIds]);

  return { isPinned, togglePin, pinnedIds };
}
