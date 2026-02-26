import { useEffect, useRef, useCallback } from "react";

/** Request notification permission on mount */
export function useNotificationPermission() {
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

/** Show a browser notification when the tab is hidden */
export function useBrowserNotifications() {
  const enabled = useRef(true);

  // Track tab visibility
  useEffect(() => {
    const handler = () => { enabled.current = document.hidden; };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const notify = useCallback((title: string, body: string, onClick?: () => void) => {
    if (
      !enabled.current ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) return;

    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "chat-message", // collapses repeated notifications
    });

    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }

    // Auto-close after 5s
    setTimeout(() => n.close(), 5000);
  }, []);

  return { notify };
}
