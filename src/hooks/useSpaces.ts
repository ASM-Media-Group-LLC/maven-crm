import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ChatSpace {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  sort_order: number;
  conversationIds: string[];
}

export function useSpaces() {
  const { user } = useAuth();
  const [spaces, setSpaces] = useState<ChatSpace[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSpaces = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: spacesData } = await supabase
        .from("chat_spaces")
        .select("*")
        .eq("created_by", user.id)
        .order("sort_order", { ascending: true });

      if (!spacesData) { setSpaces([]); return; }

      const spaceIds = spacesData.map((s: any) => s.id);
      let convMap: Record<string, string[]> = {};

      if (spaceIds.length > 0) {
        const { data: assignments } = await supabase
          .from("chat_space_conversations")
          .select("space_id, conversation_id")
          .in("space_id", spaceIds);

        if (assignments) {
          assignments.forEach((a: any) => {
            if (!convMap[a.space_id]) convMap[a.space_id] = [];
            convMap[a.space_id].push(a.conversation_id);
          });
        }
      }

      setSpaces(spacesData.map((s: any) => ({
        ...s,
        conversationIds: convMap[s.id] || [],
      })));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadSpaces(); }, [loadSpaces]);

  // Realtime sync
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("spaces-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_spaces" }, () => { void loadSpaces(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_space_conversations" }, () => { void loadSpaces(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadSpaces]);

  const createSpace = useCallback(async (name: string, icon = "💬", color = "#6366f1") => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("chat_spaces")
      .insert({ name, icon, color, created_by: user.id, sort_order: spaces.length })
      .select()
      .single();

    if (error) { toast.error("Error al crear espacio"); return null; }
    await loadSpaces();
    toast.success(`Espacio "${name}" creado`);
    return data.id;
  }, [user, spaces.length, loadSpaces]);

  const deleteSpace = useCallback(async (spaceId: string) => {
    const { error } = await supabase.from("chat_spaces").delete().eq("id", spaceId);
    if (error) { toast.error("Error al eliminar espacio"); return false; }
    await loadSpaces();
    toast.success("Espacio eliminado");
    return true;
  }, [loadSpaces]);

  const renameSpace = useCallback(async (spaceId: string, name: string) => {
    const { error } = await supabase.from("chat_spaces").update({ name }).eq("id", spaceId);
    if (error) { toast.error("Error al renombrar"); return false; }
    await loadSpaces();
    return true;
  }, [loadSpaces]);

  const addConversationToSpace = useCallback(async (spaceId: string, conversationId: string) => {
    const { error } = await supabase
      .from("chat_space_conversations")
      .upsert({ space_id: spaceId, conversation_id: conversationId }, { onConflict: "space_id,conversation_id" });
    if (error) { toast.error("Error al agregar chat al espacio"); return false; }
    await loadSpaces();
    return true;
  }, [loadSpaces]);

  const removeConversationFromSpace = useCallback(async (spaceId: string, conversationId: string) => {
    const { error } = await supabase
      .from("chat_space_conversations")
      .delete()
      .eq("space_id", spaceId)
      .eq("conversation_id", conversationId);
    if (error) { toast.error("Error al quitar chat del espacio"); return false; }
    await loadSpaces();
    return true;
  }, [loadSpaces]);

  return {
    spaces, loading,
    createSpace, deleteSpace, renameSpace,
    addConversationToSpace, removeConversationFromSpace,
    loadSpaces,
  };
}
