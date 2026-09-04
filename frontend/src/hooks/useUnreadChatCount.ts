import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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

  // Realtime: el callback lee siempre el refresh actual vía ref, así la suscripción se
  // arma UNA vez por user.id (string estable) y no en cada cambio de identidad del objeto
  // `user` (refresh de token). IMPORTANTE — nombre de canal ÚNICO: un nombre FIJO se dedupea
  // por topic en supabase-js; si el efecto se re-ejecutaba (cambio de `user`), la 2ª
  // suscripción al mismo nombre quedaba muerta y el badge dejaba de actualizarse hasta un
  // refresh de la página. Mismo fix que useWaInboxNotifications/useTgInboxNotifications.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("chat-unread-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          if (payload.new && (payload.new as any).sender_id !== userId) {
            void refreshRef.current();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_participants" },
        (payload) => {
          if (payload.new && (payload.new as any).user_id === userId) {
            void refreshRef.current();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return count;
}
