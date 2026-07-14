import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markMessagesDelivered } from "@/hooks/useReadReceipts";

/**
 * Ack "ENTREGADO" GLOBAL del Messenger interno (modelo WhatsApp).
 *
 * Marca como entregados (chat_read_receipts.delivered_at) los mensajes que el usuario
 * RECIBE, aunque NO esté en la página del Messenger. Así el remitente ve ✓✓ gris
 * ("le llegó a la otra persona") apenas el navegador del destinatario recibe el mensaje
 * en cualquier parte de Maven, y luego ✓✓ azul cuando lo abre y lo lee.
 *
 * Por qué hace falta: antes "entregado" SÓLO se marcaba dentro de /messenger (useChat +
 * useMessages, que sólo montan ahí). Como al abrir el chat se marca "leído" casi al
 * instante, el estado intermedio ✓✓ gris nunca se veía: en prod había 0 recibos
 * "entregado-sin-leer" de 265. Resultado: el remitente saltaba de ✓ (enviado) directo a
 * ✓✓ azul (leído) cuando el otro entraba al chat, y se quedaba en ✓ si el otro estaba en
 * Maven pero no en el Messenger.
 *
 * Se monta en AppShell (siempre presente en rutas autenticadas), junto a los avisos
 * globales de WhatsApp/Telegram.
 *
 * - La RLS de chat_messages (SELECT: is_chat_participant) limita el realtime a las
 *   conversaciones del usuario, así que todo INSERT que llega es de un chat propio → si el
 *   sender no soy yo, lo marco entregado.
 * - markMessagesDelivered usa upsert ignoreDuplicates: no pisa un "leído" previo y los
 *   mensajes que ya tienen recibo mío son no-ops (no re-escriben, no disparan realtime).
 * - Sólo toca delivered_at, nunca last_read_at → NO afecta el badge de no-leídos del
 *   destinatario (ese se calcula por last_read_at, no por los recibos).
 *
 * Canal con nombre ÚNICO + dependencia en user.id (no el objeto `user`): un nombre fijo se
 * dedupea por topic en supabase-js y la 2ª suscripción muere tras un refresh de token
 * (mismo criterio que useWaInboxNotifications).
 */
export function useMessengerDelivery() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    // Backfill al montar: marcar entregados los mensajes recientes de otros que aún no
    // tienen recibo mío (los que llegaron mientras Maven estaba cerrado). La RLS de
    // chat_messages ya restringe el SELECT a mis conversaciones; ignoreDuplicates hace que
    // los ya entregados/leídos sean no-ops.
    void (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id")
        .neq("sender_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(200);
      const ids = (data as { id: string }[] | null)?.map((m) => m.id) ?? [];
      if (ids.length) await markMessagesDelivered(userId, ids);
    })();

    const channel = supabase
      .channel("chat-delivery-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as { id?: string; sender_id?: string } | null;
          if (m?.id && m.sender_id && m.sender_id !== userId) {
            void markMessagesDelivered(userId, [m.id]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);
}
