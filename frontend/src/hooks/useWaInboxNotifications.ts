import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import {
  useBrowserNotifications,
  useNotificationPermission,
} from "@/hooks/useBrowserNotifications";

// Etiqueta legible cuando el mensaje no trae texto (mismo criterio que la bandeja).
const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Video",
  audio: "🎵 Audio",
  document: "📄 Documento",
  sticker: "Sticker",
  system: "Mensaje",
};

function previewOf(body: string | null, msgType: string): string {
  const t = (body ?? "").trim();
  if (t) return t.length > 120 ? t.slice(0, 120) + "…" : t;
  return MEDIA_LABEL[msgType] ?? "Nuevo mensaje";
}

/**
 * Aviso GLOBAL de WhatsApp entrante: suena + (cuando la pestaña está en segundo
 * plano) salta la notificación del navegador, desde cualquier parte de Maven.
 *
 * Antes esto solo existía para el Messenger interno; la bandeja de WhatsApp solo
 * actualizaba el badge silencioso del sidebar, así que había que estar mirando el
 * ícono. Este hook (montado en AppShell) cierra esa brecha.
 *
 * - Solo entrantes (direction='in'): los salientes/bot no avisan.
 * - La RLS de wa_conversation_messages limita el realtime a las conversaciones que
 *   el usuario puede ver (el closer solo oye lo suyo; el admin oye todo lo visible).
 * - Respeta los ajustes del usuario: maestro de notificaciones, No-molestar y sonido.
 * - La notificación del navegador solo aparece con la pestaña oculta (lo maneja
 *   `notify`); el sonido suena igual aunque la pestaña esté visible en otra pantalla.
 */
export function useWaInboxNotifications() {
  const { user } = useAuth();
  const { settings } = useNotificationSettings();
  const { notify } = useBrowserNotifications();
  const navigate = useNavigate();
  useNotificationPermission();

  // Los ajustes cambian, pero la suscripción de realtime se arma una sola vez.
  // Guardamos la última versión en un ref para que el callback lea el valor
  // actual sin re-suscribirse en cada cambio de settings.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Anti-spam del sonido: en ráfagas no disparamos un beep por cada mensaje.
  const lastSoundRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("wa-inbox-notify")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wa_conversation_messages",
          filter: "direction=eq.in",
        },
        async (payload) => {
          const m = payload.new as {
            conversation_id?: string;
            body?: string | null;
            msg_type?: string;
            direction?: string;
          };
          if (!m?.conversation_id || m.direction !== "in") return;

          const s = settingsRef.current;
          // Maestro apagado o No-molestar → no avisar (ni sonido ni popup).
          if (s.notifications_enabled === false || s.dnd_enabled) return;

          // Nombre del contacto (best-effort). La RLS garantiza que solo resuelve
          // conversaciones visibles para el usuario; si falla, título genérico.
          let title = "Nuevo mensaje de WhatsApp";
          try {
            const { data } = await (supabase as any)
              .from("wa_conversations")
              .select("contact:wa_contacts(display_name, instagram_handle)")
              .eq("id", m.conversation_id)
              .maybeSingle();
            const c = data?.contact;
            const name =
              c?.display_name ||
              (c?.instagram_handle
                ? "@" + String(c.instagram_handle).replace(/^@/, "")
                : "");
            if (name) title = name;
          } catch {
            /* título genérico */
          }

          const body = previewOf(m.body ?? null, m.msg_type ?? "text");

          // Sonido: respeta el ajuste y se limita a 1 cada 1.5s en ráfagas.
          const now = Date.now();
          const soundOk =
            s.sound_enabled !== false && now - lastSoundRef.current > 1500;
          if (soundOk) lastSoundRef.current = now;

          notify(
            title,
            body,
            () => navigate(`/inbox?c=${m.conversation_id}`),
            soundOk,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notify, navigate]);
}
