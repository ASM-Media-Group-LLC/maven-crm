import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

// Silenciar el sonido de notificaciones POR CANAL, de forma independiente:
// WhatsApp, Telegram y Messenger tienen cada uno su propio mute (botón a la
// derecha de su tab en el sidebar). No toca el popup del navegador ni el
// `sound_enabled` global de notification_settings (que sigue siendo el maestro).
// Preferencia PER-DISPOSITIVO (localStorage), por usuario y por canal, como un
// "mute" de pestaña. La respetan useWaInboxNotifications, useTgInboxNotifications
// y useMessengerNotifications al decidir si suena.
export type MuteChannel = "wa" | "tg" | "messenger";

const keyFor = (channel: MuteChannel, userId: string | null | undefined) =>
  `maven.chat.soundMuted.${channel}.${userId ?? "anon"}`;
// Evento propio para que el botón del sidebar y cualquier consumidor se
// re-sincronicen al instante en la MISMA pestaña (el `storage` nativo solo
// dispara entre pestañas distintas).
const CHANGE_EVENT = "maven:chat-sound-muted-changed";

// Lectura directa (sin React) para el momento en que llega un mensaje.
export function getChannelSoundMuted(channel: MuteChannel, userId: string | null | undefined): boolean {
  try {
    return localStorage.getItem(keyFor(channel, userId)) === "1";
  } catch {
    return false;
  }
}

// Hook reactivo para la UI: devuelve el estado actual + un toggle para UN canal.
// Se re-sincroniza al cambiar el usuario, al togglear en esta pestaña (evento
// propio) o en otra (evento `storage`).
export function useChannelSoundMuted(channel: MuteChannel) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [muted, setMuted] = useState<boolean>(() => getChannelSoundMuted(channel, userId));

  useEffect(() => {
    const sync = () => setMuted(getChannelSoundMuted(channel, userId));
    sync(); // al montar y cuando cambia el usuario/canal
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [channel, userId]);

  const toggle = useCallback(() => {
    const next = !getChannelSoundMuted(channel, userId);
    try {
      localStorage.setItem(keyFor(channel, userId), next ? "1" : "0");
    } catch {
      /* storage bloqueado → el toggle no persiste, pero no rompe nada */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [channel, userId]);

  return { muted, toggle };
}
