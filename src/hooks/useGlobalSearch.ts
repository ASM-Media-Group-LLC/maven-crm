import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GlobalSearchResult {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  senderName: string;
  content: string;
  createdAt: string;
}

/**
 * Search across all conversations the user participates in.
 */
export function useGlobalSearch() {
  const { user } = useAuth();
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!user || !query.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      // Get all conversations for this user
      const { data: participantRows } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (!participantRows?.length) { setSearching(false); setResults([]); return; }

      const convIds = participantRows.map((r) => r.conversation_id);

      // Fetch conversations for titles
      const { data: convRows } = await supabase
        .from("chat_conversations")
        .select("id, name")
        .in("id", convIds);

      const titleMap = new Map<string, string>();
      for (const c of convRows ?? []) {
        titleMap.set(c.id, c.name ?? "Sin nombre");
      }

      // Search messages by content (using ilike for server-side filtering)
      const { data: messageRows } = await supabase
        .from("chat_messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .in("conversation_id", convIds)
        .ilike("content", `%${query}%`)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!messageRows?.length) { setSearching(false); setResults([]); return; }

      // Get sender profiles
      const senderIds = [...new Set(messageRows.map((m) => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);

      const nameMap = new Map<string, string>();
      for (const p of profiles ?? []) {
        nameMap.set(p.id, p.full_name ?? "Usuario");
      }

      const matches: GlobalSearchResult[] = messageRows.map((msg) => ({
        messageId: msg.id,
        conversationId: msg.conversation_id,
        conversationTitle: titleMap.get(msg.conversation_id) ?? "Chat",
        senderName: nameMap.get(msg.sender_id) ?? "Usuario",
        content: (msg.content?.length ?? 0) > 80 ? msg.content!.slice(0, 80) + "…" : msg.content ?? "",
        createdAt: msg.created_at,
      }));

      setResults(matches);
    } catch (e) {
      console.error("Global search failed:", e);
    } finally {
      setSearching(false);
    }
  }, [user]);

  const clearResults = useCallback(() => setResults([]), []);

  return { results, searching, search, clearResults };
}
