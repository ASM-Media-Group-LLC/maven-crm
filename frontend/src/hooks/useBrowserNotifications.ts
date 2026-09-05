import { useEffect, useRef, useCallback } from "react";
import { playMessageNotification } from "@/lib/notificationSound";
import { sonarUnaVezEntrePestanas } from "@/lib/sonarUnaVezEntrePestanas";

/** Request notification permission on mount */
export function useNotificationPermission() {
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

/** Tono de mensaje nuevo (Pulso). Unificado para Messenger, bandeja de
 *  WhatsApp y bandeja de Telegram — todos pasan por acá. Sintetizado, sin
 *  archivo (antes: /sounds/message.wav).
 *
 *  Suena UNA vez aunque haya varias pestañas abiertas: estos avisos nacen de
 *  hooks montados por encima del router, así que todas las pestañas reciben el
 *  mismo evento de realtime y todas sonaban.
 *
 *  Los 1500 ms NO son una cadencia nueva: es exactamente el mismo anti-ráfaga
 *  que useMessengerNotifications ya aplicaba DENTRO de una pestaña
 *  (`lastSoundRef`). Lo único que cambia es que ahora se comparte entre ellas. */
export function playNotificationSound() {
  sonarUnaVezEntrePestanas("mensaje", 1500, () => playMessageNotification());
}

/** Show a browser notification when the tab is hidden */
export function useBrowserNotifications() {
  const enabled = useRef(typeof document !== "undefined" ? document.hidden : false);

  // Track tab visibility
  useEffect(() => {
    const handler = () => { enabled.current = document.hidden; };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const notify = useCallback((title: string, body: string, onClick?: () => void, soundEnabled = true) => {
    // Play sound only if enabled
    if (soundEnabled) {
      playNotificationSound();
    }

    if (
      !enabled.current ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) return;

    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "chat-message",
    });

    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }

    setTimeout(() => n.close(), 5000);
  }, []);

  return { notify };
}
