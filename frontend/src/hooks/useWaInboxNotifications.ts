import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { usePermissions } from "@/hooks/usePermissions";
import { getChannelSoundMuted } from "@/hooks/useChannelSoundMuted";
import {
  useBrowserNotifications,
  useNotificationPermission,
} from "@/hooks/useBrowserNotifications";
// La notificación del navegador es para quien la recibe: en su idioma, armada
// con traducir() en el momento del aviso.
import { traducir, type TranslationKey } from "@/lib/i18n";

// Etiqueta legible cuando el mensaje no trae texto (mismo criterio que la bandeja).
const MEDIA_LABEL: Record<string, TranslationKey> = {
  image: "int.inbox.photo",
  video: "int.inbox.video",
  audio: "int.inbox.audio",
  document: "int.inbox.document",
  sticker: "int.inbox.sticker",
  system: "int.inbox.message",
};

function previewOf(body: string | null, msgType: string): string {
  const t = (body ?? "").trim();
  if (t) return t.length > 120 ? t.slice(0, 120) + "…" : t;
  return traducir(MEDIA_LABEL[msgType] ?? "int.inbox.newMessage");
}

/**
 * Aviso GLOBAL de WhatsApp entrante: suena + (cuando la pestaña está en segundo
 * plano) salta la notificación del navegador, desde cualquier parte de Maven.
 * Además refresca el badge del sidebar y marca la lista de la bandeja como stale
 * en cada entrante, para que se actualicen aunque NO estés en la página /inbox.
 *
 * Montado en AppShell (siempre montado en rutas autenticadas).
 *
 * - Solo entrantes (direction='in'): los salientes/bot no avisan.
 * - La RLS de wa_conversation_messages limita el realtime a las conversaciones que
 *   el usuario puede ver (el closer solo oye lo suyo; el admin oye todo lo visible).
 * - Respeta los ajustes del usuario: maestro de notificaciones, No-molestar y sonido.
 *
 * IMPORTANTE — nombre de canal ÚNICO (igual que InboxPage). Un nombre FIJO se
 * dedupea por topic en supabase-js: si el efecto se re-ejecuta (cambio de identidad
 * del objeto `user` / refresh de token), la 2ª suscripción al mismo nombre queda
 * muerta y el callback nunca dispara — aunque el realtime SÍ entregue el evento.
 * Por eso dependemos de `user.id` (string estable, no el objeto) y el topic lleva
 * sufijo aleatorio.
 */
export function useWaInboxNotifications() {
  const { user } = useAuth();
  const { settings } = useNotificationSettings();
  const { notify } = useBrowserNotifications();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useNotificationPermission();

  // La suscripción se arma una sola vez; el callback lee siempre el valor actual
  // de settings/notify vía refs (sin re-suscribir en cada cambio).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { isCanalActivo } = useNotificationPreferences();
  const prefRef = useRef(isCanalActivo);
  prefRef.current = isCanalActivo;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // Anti-spam del sonido: en ráfagas no disparamos un beep por cada mensaje.
  const lastSoundRef = useRef(0);

  const userId = user?.id ?? null;

  // Sin acceso al MÓDULO WhatsApp no hay suscripción: la RLS ya no le entrega
  // eventos (fix del scope global), pero tampoco tiene sentido mantener un
  // canal realtime abierto para alguien que ni ve la bandeja. Fue el reporte
  // de Andrea (HHRR): notificaciones de tabs a los que no tiene acceso.
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const accesoInbox = !permsLoading && canAccess("WhatsApp");

  useEffect(() => {
    if (!userId || !accesoInbox) return;
    const channel = supabase
      .channel("wa-inbox-notify-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wa_conversation_messages",
        },
        async (payload) => {
          const m = payload.new as {
            conversation_id?: string;
            body?: string | null;
            msg_type?: string;
            direction?: string;
          };
          if (!m?.conversation_id) return;

          // Cualquier mensaje nuevo → refrescá la lista de la bandeja Y el hilo abierto.
          // Si la conversación abierta es ésta, su query se refetchea y el mensaje aparece
          // EN VIVO, sin refresh manual. Este canal global es la ÚNICA suscripción a
          // wa_conversation_messages: antes InboxPage tenía un 2º canal que competía por el
          // routing de postgres_changes de supabase-js y quedaba mudo (sonaba el aviso pero
          // el hilo no se actualizaba hasta refrescar).
          qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
          qc.invalidateQueries({ queryKey: ["wa-inbox-messages", m.conversation_id] });

          // De acá para abajo: SOLO entrantes (badge de no-leídos, sonido, popup).
          if (m.direction !== "in") return;
          qc.invalidateQueries({ queryKey: ["sidebar-badges"] });

          const s = settingsRef.current;
          // Maestro apagado o No-molestar → no avisar (ni sonido ni popup).
          if (s.notifications_enabled === false || s.dnd_enabled) return;
          // Ajustes → Notificaciones → Eventos → Bandeja.
          if (!prefRef.current("inbox_mensaje", "in_app")) return;

          // Nombre del contacto (best-effort). La RLS garantiza que solo resuelve
          // conversaciones visibles para el usuario; si falla, título genérico.
          let title = traducir("int.inbox.newWhatsapp");
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

          // Sonido: respeta el ajuste global, el mute PROPIO de bandejas (WhatsApp+
          // Telegram, botón del sidebar) y se limita a 1 cada 1.5s en ráfagas.
          const now = Date.now();
          const soundOk =
            s.sound_enabled !== false &&
            !getChannelSoundMuted("wa", userId) &&
            now - lastSoundRef.current > 1500;
          if (soundOk) lastSoundRef.current = now;

          // La ruta hace que el clic abra la pestaña que ya está en la bandeja
          // (ver useBrowserNotifications).
          const ruta = `/inbox?c=${m.conversation_id}`;
          notifyRef.current(
            title,
            body,
            () => navigate(ruta),
            soundOk,
            ruta,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, accesoInbox, qc, navigate]);
}
