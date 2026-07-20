import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

// Silenciar SOLO el sonido de las notificaciones de los chats/bandejas: WhatsApp,
// Telegram y Messenger (no toca el popup del navegador ni el `sound_enabled`
// global de notification_settings, que sigue siendo el maestro). Preferencia
// PER-DISPOSITIVO (localStorage), por usuario, como un "mute" de pestaña. La
// controla el botón del footer del sidebar y la respetan useWaInboxNotifications,
// useTgInboxNotifications y useMessengerNotifications al decidir si suena.
const keyFor = (userId: string | null | undefined) => `maven.inbox.soundMuted.${userId ?? "anon"}`;
// Evento propio para que el botón del sidebar y cualquier otro consumidor se
// re-sincronicen al instante en la MISMA pestaña (el evento nativo `storage`
// solo dispara entre pestañas distintas).
const CHANGE_EVENT = "maven:inbox-sound-muted-changed";

// Lectura directa (sin React) para el momento en que llega un mensaje.
export function getInboxSoundMuted(userId: string | null | undefined): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return false;
  }
}

// Hook reactivo para la UI: devuelve el estado actual + un toggle. Se re-sincroniza
// cuando cambia el usuario, cuando se togglea en esta pestaña (evento propio) o en
// otra (evento `storage`).
export function useInboxSoundMuted() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [muted, setMuted] = useState<boolean>(() => getInboxSoundMuted(userId));

  useEffect(() => {
    const sync = () => setMuted(getInboxSoundMuted(userId));
    sync(); // al montar y cuando cambia el usuario
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  const toggle = useCallback(() => {
    const next = !getInboxSoundMuted(userId);
    try {
      localStorage.setItem(keyFor(userId), next ? "1" : "0");
    } catch {
      /* storage bloqueado → el toggle no persiste, pero no rompe nada */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [userId]);

  return { muted, toggle };
}
