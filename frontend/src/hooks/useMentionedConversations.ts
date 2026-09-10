import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

/**
 * Returns a Set of conversation IDs where the current user
 * has been mentioned (@fullName or @firstName) in any message.
 */
export function useMentionedConversations(
  currentUserName: string | null | undefined,
  conversationIds: string[],
) {
  const { user } = useAuth();
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());

  // Stabilize conversationIds by joining into a string key
  const convIdsKey = useMemo(() => conversationIds.join(","), [conversationIds]);
  const stableConvIds = useMemo(() => conversationIds, [convIdsKey]);

  const refresh = useCallback(async () => {
    if (!user || !currentUserName || stableConvIds.length === 0) {
      setMentionedIds(new Set());
      return;
    }

    const name = currentUserName.trim();
    if (!name) {
      setMentionedIds(new Set());
      return;
    }
    const firstName = name.split(" ")[0];

    // UNA consulta para todas las conversaciones.
    //
    // Antes esto era un bucle SECUENCIAL con 1-2 consultas por chat, y se
    // re-disparaba con cada INSERT que llevara "@" en toda la organización y
    // con cada cambio de last_read_at (o sea, cada vez que abrís un chat).
    // Medido en prod: 60 peticiones en 25 segundos en una sola pestaña.
    //
    // La RPC hace el mismo filtro (no borrados, de otra persona, posteriores a
    // last_read_at, y que nombren a @nombre o @pila) del lado del servidor.
    // Usa position() en vez de ilike a propósito: un nombre con % o _ no puede
    // convertirse en comodín.
    const { data, error } = await supabase.rpc("get_mentioned_conversations", {
      _user_id: user.id,
      _nombre: name,
      _nombre_pila: firstName,
    });

    if (error) {
      // Un fallo no vacía el badge: se conserva lo que había y el próximo
      // refresco lo vuelve a pedir. Antes se apagaban todas las menciones.
      console.error("[useMentionedConversations] mentions query error:", error);
      return;
    }

    setMentionedIds(new Set((data ?? []).map((r) => r.conversation_id as string)));
  }, [user, currentUserName, stableConvIds]);

  // Refresh when dependencies change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: menciones nuevas y cambios en mi last_read_at. El canal revive
  // solo si se muere (antes se moría en silencio y el badge se congelaba).
  useCanalQueRevive({
    topic: user && currentUserName && stableConvIds.length > 0 ? `mentions-rt-${user.id.slice(0, 8)}` : null,
    armar: (canal) => canal
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id !== user.id && msg.content?.includes("@")) {
            refresh();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_participants",
        },
        (payload) => {
          const row = payload.new as any;
          // When current user's last_read_at changes, re-check mentions
          if (row.user_id === user.id) {
            refresh();
          }
        },
      ),
    alRevivir: () => { void refresh(); },
  });

  return { mentionedIds, refreshMentions: refresh };
}
