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

// Etiqueta legible cuando el mensaje no trae texto (mismo criterio que WhatsApp).
const MEDIA_LABEL: Record<string, TranslationKey> = {
  photo: "int.inbox.photo",
  video: "int.inbox.video",
  voice: "int.inbox.audio",
  document: "int.inbox.document",
  media: "int.inbox.attachment",
};

function previewOf(body: string | null, msgType: string): string {
  const t = (body ?? "").trim();
  if (t) return t.length > 120 ? t.slice(0, 120) + "…" : t;
  return traducir(MEDIA_LABEL[msgType] ?? "int.inbox.newMessage");
}

/**
 * Aviso GLOBAL de Telegram entrante — espejo de useWaInboxNotifications: suena +
 * notificación del navegador desde cualquier parte de Maven, refresca el badge del
 * sidebar y marca la bandeja como stale. Montado en AppShell.
 *
 * IMPORTANTE: este canal es la ÚNICA suscripción a tg_messages (la bandeja solo
 * escucha tg_conversations). Igual que en WhatsApp: dos canales al mismo topic de
 * postgres_changes compiten por el routing de supabase-js y uno queda MUDO.
 * Nombre de canal con sufijo aleatorio + dependencia por user.id (string estable).
 */
export function useTgInboxNotifications() {
  const { user } = useAuth();
  const { settings } = useNotificationSettings();
  const { notify } = useBrowserNotifications();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useNotificationPermission();

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { isCanalActivo } = useNotificationPreferences();
  const prefRef = useRef(isCanalActivo);
  prefRef.current = isCanalActivo;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const lastSoundRef = useRef(0);

  const userId = user?.id ?? null;

  // Sin acceso al MÓDULO Telegram no hay suscripción (mismo motivo que la
  // bandeja de WhatsApp: el reporte de Andrea, HHRR).
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const accesoInbox = !permsLoading && canAccess("Telegram");

  useEffect(() => {
    if (!userId || !accesoInbox) return;
    const channel = supabase
      .channel("tg-inbox-notify-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tg_messages" },
        async (payload) => {
          const m = payload.new as {
            conversation_id?: string;
            body?: string | null;
            msg_type?: string;
            direction?: string;
          };
          if (!m?.conversation_id) return;

          // Cualquier mensaje nuevo → refrescá la lista Y el hilo abierto (en vivo).
          qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
          qc.invalidateQueries({ queryKey: ["tg-inbox-messages", m.conversation_id] });

          // De acá para abajo: SOLO entrantes (badge, sonido, popup).
          if (m.direction !== "in") return;
          qc.invalidateQueries({ queryKey: ["sidebar-badges"] });

          const s = settingsRef.current;
          if (s.notifications_enabled === false || s.dnd_enabled) return;
          // Ajustes → Notificaciones → Eventos → Bandeja.
          if (!prefRef.current("inbox_mensaje", "in_app")) return;

          // Nombre del peer (best-effort; la RLS limita a conversaciones visibles).
          let title = traducir("int.inbox.newTelegram");
          try {
            const { data } = await (supabase as any)
              .from("tg_conversations")
              .select("peer_name, peer_username")
              .eq("id", m.conversation_id)
              .maybeSingle();
            const name =
              data?.peer_name ||
              (data?.peer_username ? "@" + String(data.peer_username).replace(/^@/, "") : "");
            if (name) title = `${name} (Telegram)`;
          } catch {
            /* título genérico */
          }

          const body = previewOf(m.body ?? null, m.msg_type ?? "text");

          // Sonido: respeta el ajuste global, el mute PROPIO de bandejas (WhatsApp+
          // Telegram, botón del sidebar) y se limita a 1 cada 1.5s en ráfagas.
          const now = Date.now();
          const soundOk =
            s.sound_enabled !== false &&
            !getChannelSoundMuted("tg", userId) &&
            now - lastSoundRef.current > 1500;
          if (soundOk) lastSoundRef.current = now;

          // La ruta hace que el clic abra la pestaña que ya está en la bandeja
          // (ver useBrowserNotifications).
          const ruta = `/telegram/bandeja?c=${m.conversation_id}`;
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
