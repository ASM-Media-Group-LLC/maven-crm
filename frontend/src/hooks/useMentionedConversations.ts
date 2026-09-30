import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEscuchaDelChat } from "@/hooks/canalDelChat";

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

  // Realtime: menciones nuevas y cambios en mi last_read_at. Llegan por el CANAL
  // DEL CHAT (canalDelChat.ts), que ya trae esos dos eventos para la lista: este
  // hook abría un canal aparte con las mismas dos escuchas, y cada mensaje y cada
  // lectura le costaban a Realtime un chequeo de RLS más por pestaña en /messenger.
  // El canal revive solo; al revivir se vuelve a pedir.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const userId = user?.id ?? null;
  const activo = !!userId && !!currentUserName && stableConvIds.length > 0;
  useEscuchaDelChat(activo ? userId : null, {
    "chat_messages:INSERT": (payload) => {
      const msg = payload.new;
      if (msg.sender_id !== userId && msg.content?.includes("@")) {
        void refreshRef.current();
      }
    },
    "chat_participants:UPDATE": (payload) => {
      // When current user's last_read_at changes, re-check mentions
      if (payload.new.user_id === userId) {
        void refreshRef.current();
      }
    },
    alRevivir: () => { void refreshRef.current(); },
  });

  return { mentionedIds, refreshMentions: refresh };
}
