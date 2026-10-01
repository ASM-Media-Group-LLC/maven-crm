import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface GlobalSearchResult {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  /** Quién aparece como autor: el nombre visible de la key («BLU») si vino por API. */
  senderName: string;
  /** true = lo mandó una integración (lo decide api_key_id, no el nombre). */
  esApi: boolean;
  /** La persona detrás del mensaje (dueña de la key, o quien lo escribió). */
  personaReal: string;
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

      // Fetch conversations for titles + participants for DM name resolution
      const [convsRes, participantsRes] = await Promise.all([
        supabase.from("chat_conversations").select("id, name, type").in("id", convIds),
        supabase.from("chat_participants").select("conversation_id, user_id").in("conversation_id", convIds),
      ]);

      // Get all profiles for participant name resolution
      const allUserIds = [...new Set((participantsRes.data ?? []).map((p: any) => p.user_id))];
      const { data: allProfiles } = await supabase.from("profiles").select("id, full_name").in("id", allUserIds);
      const profileNameMap = new Map<string, string>();
      for (const p of allProfiles ?? []) {
        profileNameMap.set(p.id, p.full_name ?? "Usuario");
      }

      const titleMap = new Map<string, string>();
      for (const c of convsRes.data ?? []) {
        if (c.name) {
          titleMap.set(c.id, c.name);
        } else if (c.type === "direct") {
          // Find the other participant's name
          const otherP = (participantsRes.data ?? []).find(
            (p: any) => p.conversation_id === c.id && p.user_id !== user.id
          );
          titleMap.set(c.id, otherP ? (profileNameMap.get(otherP.user_id) ?? "Chat") : "Chat");
        } else {
          titleMap.set(c.id, "Grupo");
        }
      }

      // Search messages by content (using ilike for server-side filtering)
      const { data: messageRows } = await supabase
        .from("chat_messages")
        .select("id, conversation_id, sender_id, content, created_at, api_key_id, api_display_name")
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

      const matches: GlobalSearchResult[] = messageRows.map((msg) => {
        const personaReal = nameMap.get(msg.sender_id) ?? "Usuario";
        // El nombre de la key viene en la fila (dato, no se traduce ni se busca en profiles).
        const esApi = msg.api_key_id != null;
        return {
        messageId: msg.id,
        conversationId: msg.conversation_id,
        conversationTitle: titleMap.get(msg.conversation_id) ?? "Chat",
        senderName: esApi ? (msg.api_display_name || "API") : personaReal,
        esApi,
        personaReal,
        content: (msg.content?.length ?? 0) > 80 ? msg.content!.slice(0, 80) + "…" : msg.content ?? "",
        createdAt: msg.created_at,
        };
      });

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
