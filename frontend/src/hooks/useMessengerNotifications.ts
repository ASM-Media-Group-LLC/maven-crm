import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markMessagesDelivered } from "@/hooks/useReadReceipts";
import { useTabTitleAlert } from "@/hooks/useTabTitleAlert";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { getChannelSoundMuted } from "@/hooks/useChannelSoundMuted";
import {
  playNotificationSound,
  useBrowserNotifications,
  useNotificationPermission,
} from "@/hooks/useBrowserNotifications";
import { tienePushEnEsteDispositivo } from "@/lib/pushDispositivo";
import { esMovil } from "@/lib/plataformaPwa";
import { useReanudarAlVolver } from "@/hooks/useReanudarAlVolver";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

// No-molestar RESPETANDO el horario. Antes dnd_enabled apagaba TODO 24/7. Sin franja
// definida = No-molestar permanente; con franja, maneja ventanas que cruzan medianoche.
function isDndActiveNow(s: { dnd_enabled?: boolean; dnd_start_time?: string | null; dnd_end_time?: string | null }): boolean {
  if (!s?.dnd_enabled) return false;
  if (!s.dnd_start_time || !s.dnd_end_time) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = s.dnd_start_time.split(":").map(Number);
  const [eh, em] = s.dnd_end_time.split(":").map(Number);
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

// ¿el mensaje me menciona? Mismo criterio que useMentionedConversations: @fullName o @firstName.
function mentionsMe(content: string | null, myName: string | null): boolean {
  if (!content || !myName) return false;
  const c = content.toLowerCase();
  const full = myName.toLowerCase();
  const first = full.split(" ")[0];
  return c.includes(`@${full}`) || (!!first && c.includes(`@${first}`));
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
 *     Y si este dispositivo tiene Web Push activo (push_enabled + suscripción), la
 *     tarjeta del navegador la pone el service worker: acá queda solo el sonido.
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
  const { settings, isLoading: settingsCargando } = useNotificationSettings();
  const { notify } = useBrowserNotifications();
  const navigate = useNavigate();
  useNotificationPermission();
  // Parpadeo del título de la pestaña (estilo Google Chat).
  const alertTitle = useTabTitleAlert();
  const alertTitleRef = useRef(alertTitle);
  alertTitleRef.current = alertTitle;

  // La suscripción se arma una sola vez por user.id; el callback lee siempre el valor actual
  // vía refs (sin re-suscribir en cada cambio de settings/notify).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { isCanalActivo } = useNotificationPreferences();
  const prefRef = useRef(isCanalActivo);
  prefRef.current = isCanalActivo;
  const settingsCargandoRef = useRef(settingsCargando);
  settingsCargandoRef.current = settingsCargando;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Anti-spam del sonido: en ráfagas no disparamos un beep por cada mensaje.
  const lastSoundRef = useRef(0);
  // Mi nombre, para el modo "Solo @menciones".
  const myNameRef = useRef<string | null>(null);

  const userId = user?.id ?? null;
  // Este canal no tenía reconexión de ningún tipo: al volver del segundo plano se
  // recrea (el nombre ya es aleatorio, no hay zombi del mismo topic).
  const [version, setVersion] = useState(0);
  useReanudarAlVolver(() => setVersion((v) => v + 1));

  useEffect(() => {
    if (!userId) return;

    // Mi nombre (una vez) para detectar menciones en modo 'mentions'.
    void supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => { myNameRef.current = data?.full_name ?? null; });

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

    // El canal se arma acá (cierra sobre userId y los refs) pero VIVE en
    // useCanalQueRevive, que lo levanta de nuevo si se muere.
    armarCanalRef.current = (canal) => canal
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

          // (2) Notificación — condicional. Maestro apagado o No-molestar (según horario) → nada.
          const s = settingsRef.current;
          if (s.notifications_enabled === false || isDndActiveNow(s)) return;
          // Ajustes → Notificaciones → Eventos → Messenger (el push lo decide el servidor).
          if (!prefRef.current("chat_message", "in_app")) return;

          // Mute + modo de notificación de la conversación (mi fila) + tipo/nombre en 1 query.
          const { data: part } = await supabase
            .from("chat_participants")
            .select("is_muted, notifications_mode, conversation:chat_conversations(type, name)")
            .eq("conversation_id", m.conversation_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (!part || (part as { is_muted?: boolean }).is_muted) return;

          // Respetar el modo por-conversación: 'none' nunca notifica; 'mentions' solo si me mencionan.
          const mode = (part as { notifications_mode?: string }).notifications_mode;
          if (mode === "none") return;
          if (mode === "mentions" && !mentionsMe(m.content ?? null, myNameRef.current)) return;

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

          // Título de la pestaña parpadeando mientras no estés mirando (Google Chat).
          alertTitleRef.current(
            isGroup ? `💬 ${senderName} escribió en ${title}` : `💬 ${senderName} te escribió`
          );

          // Sonido: respeta el ajuste global, el mute PROPIO de bandejas/chats
          // (WhatsApp+Telegram+Messenger, botón del sidebar) y se limita a 1 cada
          // 1.5s en ráfagas.
          const now = Date.now();
          const soundOk =
            s.sound_enabled !== false &&
            !getChannelSoundMuted("messenger", userId) &&
            now - lastSoundRef.current > 1500;
          if (soundOk) lastSoundRef.current = now;

          // La tarjeta del navegador (pestaña oculta) NO va:
          //  · en el teléfono, nunca: ahí manda el push del service worker. La app
          //    abierta de fondo seguía creando la suya y el primer mensaje llegaba
          //    doble (Jhon lo vio en iPhone y Android);
          //  · en escritorio, si este dispositivo tiene push y el usuario tiene el
          //    opt-in (o los ajustes aún cargan y no sabemos: mejor uno que dos).
          // En ambos casos quedan el sonido y el parpadeo del título.
          const pushCubre =
            tienePushEnEsteDispositivo(userId) && (s.push_enabled === true || settingsCargandoRef.current);
          if (esMovil() || pushCubre) {
            if (soundOk) playNotificationSound();
            return;
          }

          notifyRef.current(
            title,
            body,
            () => navigateRef.current(`/messenger?c=${m.conversation_id}`),
            soundOk,
          );
        },
      )
;
  }, [userId, version]);

  const armarCanalRef = useRef<((canal: RealtimeChannel) => RealtimeChannel) | null>(null);
  useCanalQueRevive({
    topic: userId ? `chat-incoming-${userId}` : null,
    armar: (canal) => armarCanalRef.current?.(canal) ?? canal,
    // Mientras estuvo muerto llegaron mensajes sin marcar "entregado": el
    // efecto de arriba hace ese backfill al bumpear `version`.
    alRevivir: () => setVersion((v) => v + 1),
  });
}
