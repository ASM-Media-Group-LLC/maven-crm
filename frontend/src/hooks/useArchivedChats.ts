import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

export function useArchivedChats() {
  const { user } = useAuth();
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  const loadArchived = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_archived")
      .select("conversation_id")
      .eq("user_id", user.id);
    if (data) {
      setArchivedIds(new Set(data.map((r: any) => r.conversation_id)));
    }
  }, [user]);

  useEffect(() => { loadArchived(); }, [loadArchived]);

  // Topic por usuario y versionado por el hook (ver usePinnedChats).
  useCanalQueRevive({
    topic: user ? `archived-${user.id}` : null,
    armar: (canal) => canal
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_archived" }, () => { void loadArchived(); }),
    alRevivir: () => void loadArchived(),
  });

  const toggleArchive = useCallback(async (conversationId: string) => {
    if (!user) return;
    const isArchived = archivedIds.has(conversationId);
    if (isArchived) {
      const { error } = await supabase
        .from("chat_archived")
        .delete()
        .eq("user_id", user.id)
        .eq("conversation_id", conversationId);
      if (!error) {
        setArchivedIds(prev => { const next = new Set(prev); next.delete(conversationId); return next; });
        toast.success("Chat desarchivado");
      }
    } else {
      const { error } = await supabase
        .from("chat_archived")
        .insert({ user_id: user.id, conversation_id: conversationId });
      if (!error) {
        setArchivedIds(prev => new Set(prev).add(conversationId));
        toast.success("Chat archivado");
      }
    }
  }, [user, archivedIds]);

  const isArchived = useCallback((conversationId: string) => archivedIds.has(conversationId), [archivedIds]);

  return { isArchived, toggleArchive, archivedIds };
}
