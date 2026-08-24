import { useEffect, useRef, useCallback } from "react";
import { playMessageNotification } from "@/lib/notificationSound";

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
 *  archivo (antes: /sounds/message.wav). */
export function playNotificationSound() {
  playMessageNotification();
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
