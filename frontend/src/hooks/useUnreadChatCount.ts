import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEscuchaDelChat } from "@/hooks/canalDelChat";

/**
 * Cuántas CONVERSACIONES tienen mensajes sin leer — no cuántos mensajes.
 *
 * Es la unidad de Facebook y de Google Chat, y la que pidió el owner: un grupo
 * con cuatro mensajes seguidos cuenta 1, no 4. Antes sumaba mensajes y el
 * número no cuadraba con lo que se ve en la lista (cuatro mensajes de un mismo
 * grupo se leen como una sola conversación pendiente). El desglose por mensajes
 * vive DENTRO de cada fila de la lista, que es donde tiene sentido.
 *
 * Resuelto con una sola llamada al servidor en vez de N+1 consultas.
 */
export function useUnreadChatCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) { setCount(0); return; }

    const { data, error } = await supabase.rpc("get_unread_counts", {
      _user_id: user.id,
    });

    if (error || !data) { setCount(0); return; }

    const total = (data as any[]).filter((row) => (row.unread_count || 0) > 0).length;
    setCount(total);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: por el CANAL DEL CHAT (canalDelChat.ts), el mismo de la lista y los
  // avisos. Antes este hook abría su propio canal con otra escucha del INSERT de
  // chat_messages y otra del UPDATE de chat_participants, y Realtime chequeaba la
  // RLS una vez más por cada mensaje y por cada vez que alguien leía. Los
  // callbacks leen siempre el refresh actual vía ref: el registro va por user.id
  // (string estable), no por la identidad del objeto `user` (refresh de token).
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const userId = user?.id ?? null;

  useEscuchaDelChat(userId, {
    "chat_messages:INSERT": (payload) => {
      if (payload.new && payload.new.sender_id !== userId) {
        void refreshRef.current();
      }
    },
    "chat_participants:UPDATE": (payload) => {
      if (payload.new && payload.new.user_id === userId) {
        void refreshRef.current();
      }
    },
    // Mientras estuvo muerto se perdieron eventos: recontar.
    alRevivir: () => void refreshRef.current(),
  });

  return count;
}
