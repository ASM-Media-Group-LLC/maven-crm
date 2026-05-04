import { useEffect, useRef, useCallback } from "react";

/** Request notification permission on mount */
export function useNotificationPermission() {
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

// Preload audio once
let cachedAudio: HTMLAudioElement | null = null;
function getNotificationAudio(): HTMLAudioElement {
  if (!cachedAudio) {
    cachedAudio = new Audio("/sounds/message.wav");
    cachedAudio.volume = 0.5;
  }
  return cachedAudio;
}

/** Play notification sound */
export function playNotificationSound() {
  try {
    const audio = getNotificationAudio();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
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
