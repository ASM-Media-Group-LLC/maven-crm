import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markMessagesDelivered } from "@/hooks/useReadReceipts";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { getChannelSoundMuted } from "@/hooks/useChannelSoundMuted";
import {
  useBrowserNotifications,
  useNotificationPermission,
} from "@/hooks/useBrowserNotifications";

// Etiqueta legible cuando el mensaje no trae texto.
const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Foto",
  file: "📎 Archivo",
  system: "Mensaje",
};

function previewOf(content: string | null, type: string, fileName: string | null): string {
  const t = (content ?? "").trim();
  if (t) return t.length > 120 ? t.slice(0, 120) + "…" : t;
  if (type === "file" && fileName) return `📎 ${fileName}`;
  return MEDIA_LABEL[type] ?? "Nuevo mensaje";
}

/**
 * Hook GLOBAL del Messenger interno (chat del staff). Montado en AppShell → activo en toda
 * Maven, no solo en /messenger. Reacciona a cada mensaje interno entrante
 * (chat_messages INSERT de otro usuario) con DOS cosas:
 *
 *  1) ACK "ENTREGADO" (delivered_at) — SIEMPRE. Para que el remitente vea ✓✓ gris apenas el
 *     navegador del destinatario recibe el mensaje, aunque no esté en /messenger. Además,
 *     backfill al montar para los mensajes que llegaron mientras Maven estaba cerrado.
 *     (Silenciar una conversación NO afecta los recibos.)
 *
 *  2) SONIDO + notificación del navegador — CONDICIONAL. Se omite si:
 *       - la conversación está SILENCIADA para mí (chat_participants.is_muted), o
 *       - los ajustes del usuario lo impiden (maestro de notificaciones, No-molestar; el
 *         sonido además respeta sound_enabled).
 *
 * La RLS de chat_messages (SELECT: is_chat_participant) limita el realtime a mis
 * conversaciones, así que todo INSERT que llega es de un chat propio.
 *
 * Canal con nombre ÚNICO + dependencia en user.id (no el objeto `user`): un nombre fijo se
 * dedupea por topic en supabase-js y la 2ª suscripción muere tras un refresh de token
 * (mismo criterio que useWaInboxNotifications).
 */
export function useMessengerNotifications() {
  const { user } = useAuth();
  const { settings } = useNotificationSettings();
  const { notify } = useBrowserNotifications();
  const navigate = useNavigate();
  useNotificationPermission();

  // La suscripción se arma una sola vez por user.id; el callback lee siempre el valor actual
  // vía refs (sin re-suscribir en cada cambio de settings/notify).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Anti-spam del sonido: en ráfagas no disparamos un beep por cada mensaje.
  const lastSoundRef = useRef(0);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    // Backfill "entregado" al montar (ignoreDuplicates → no-op para los ya entregados/leídos).
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
      .channel("chat-incoming-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          const m = payload.new as {
            id?: string;
            conversation_id?: string;
            sender_id?: string;
            content?: string | null;
            type?: string;
            file_name?: string | null;
            is_deleted?: boolean;
          } | null;
          if (!m?.id || !m.conversation_id || !m.sender_id) return;
          if (m.sender_id === userId || m.is_deleted) return;

          // (1) Entregado — SIEMPRE (independiente de silenciar/ajustes).
          void markMessagesDelivered(userId, [m.id]);

          // (2) Notificación — condicional. Maestro apagado o No-molestar → nada.
          const s = settingsRef.current;
          if (s.notifications_enabled === false || s.dnd_enabled) return;

          // Mute de la conversación (mi fila) + tipo/nombre de la conversación en 1 query.
          const { data: part } = await supabase
            .from("chat_participants")
            .select("is_muted, conversation:chat_conversations(type, name)")
            .eq("conversation_id", m.conversation_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (!part || (part as { is_muted?: boolean }).is_muted) return;

          const conv = (part as { conversation?: { type?: string; name?: string | null } | null })
            .conversation ?? null;
          const isGroup = conv?.type === "group";

          let senderName = "Alguien";
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", m.sender_id)
              .maybeSingle();
            if (prof?.full_name) senderName = prof.full_name;
          } catch {
            /* nombre genérico */
          }

          const preview = previewOf(m.content ?? null, m.type ?? "text", m.file_name ?? null);
          const title = isGroup ? conv?.name || "Grupo" : senderName;
          const body = isGroup ? `${senderName}: ${preview}` : preview;

          // Sonido: respeta el ajuste global, el mute PROPIO de bandejas/chats
          // (WhatsApp+Telegram+Messenger, botón del sidebar) y se limita a 1 cada
          // 1.5s en ráfagas.
          const now = Date.now();
          const soundOk =
            s.sound_enabled !== false &&
            !getChannelSoundMuted("messenger", userId) &&
            now - lastSoundRef.current > 1500;
          if (soundOk) lastSoundRef.current = now;

          notifyRef.current(
            title,
            body,
            () => navigateRef.current(`/messenger?c=${m.conversation_id}`),
            soundOk,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
