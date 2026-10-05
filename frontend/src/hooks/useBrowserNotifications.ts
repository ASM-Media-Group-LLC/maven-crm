import { useEffect, useRef, useCallback } from "react";
import { playMessageNotification } from "@/lib/notificationSound";
import { sonarUnaVezEntrePestanas } from "@/lib/sonarUnaVezEntrePestanas";
import { esMovil } from "@/lib/plataformaPwa";

/** Pide el permiso de notificaciones al montar — SOLO en escritorio.
 *  En el teléfono no: en iPhone el permiso solo vale pedido tras un toque y con
 *  la app instalada (y un prompt automático quema la única oportunidad); en
 *  Android sin gesto Chrome lo degrada a un aviso silencioso. Ahí lo pide el
 *  botón "Activar en este dispositivo" (Ajustes → Notificaciones → Canales).
 *  Lo llaman cuatro hooks/páginas; el gate va acá para cubrirlos todos. */
export function useNotificationPermission() {
  useEffect(() => {
    if (esMovil()) return;
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

/** El tag de las tarjetas que arma la PÁGINA (no el push del servidor). */
export const TAG_AVISO_DE_PAGINA = "chat-message";

/** El `kind` con que viajan esas tarjetas: el `notificationclick` de
 *  sw-push.js trata igual a cualquier aviso que traiga `kind` y `url`. */
export const KIND_AVISO_DE_PAGINA = "aviso_de_pagina";

/** Lo mínimo del registro del service worker que se usa acá. */
type RegistroConAvisos = Pick<ServiceWorkerRegistration, "showNotification" | "getNotifications">;

/** El service worker de Maven, si hay uno (en `npm run dev` no hay). */
async function registroDelServiceWorker(): Promise<RegistroConAvisos | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const r = await navigator.serviceWorker.getRegistration();
    return r && typeof r.showNotification === "function" ? r : null;
  } catch {
    return null;
  }
}

/** Show a browser notification when the tab is hidden
 *
 *  ── POR QUÉ LA TARJETA LA MUESTRA EL SERVICE WORKER ─────────────────────
 *
 *  Las pestañas de Maven se movían juntas (Keila, 02/10: el Messenger en una,
 *  el Correo en otra). La tarjeta del navegador la arma la pestaña OCULTA —la
 *  que miras no, porque está visible—, y su clic navegaba ESA pestaña. Con el
 *  Messenger a la vista y el Correo detrás, el aviso de un mensaje lo armaba
 *  el Correo: al tocarlo, el Correo saltaba al Messenger y quedaban las dos
 *  pestañas en lo mismo.
 *
 *  Si se le pasa la `ruta`, la tarjeta la muestra el service worker y su clic
 *  lo resuelve `notificationclick` (sw-push.js), igual que un push: enfoca la
 *  ventana que YA está en esa sección y solo si no hay ninguna usa otra. Sin
 *  service worker (desarrollo) queda la tarjeta de la página, como antes. */
export function useBrowserNotifications() {
  const enabled = useRef(typeof document !== "undefined" ? document.hidden : false);

  // Track tab visibility
  useEffect(() => {
    const handler = () => { enabled.current = document.hidden; };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const notify = useCallback((
    title: string,
    body: string,
    onClick?: () => void,
    soundEnabled = true,
    /** Adónde lleva el clic ("/messenger?c=…"). Con esto la tarjeta la muestra
     *  el service worker y el clic abre la pestaña que ya está ahí. */
    ruta?: string,
  ) => {
    // Play sound only if enabled
    if (soundEnabled) {
      playNotificationSound();
    }

    if (
      !enabled.current ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) return;

    const enLaPagina = () => {
      const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: TAG_AVISO_DE_PAGINA,
      });

      if (onClick) {
        n.onclick = () => {
          window.focus();
          onClick();
          n.close();
        };
      }

      setTimeout(() => n.close(), 5000);
    };

    if (!ruta) {
      enLaPagina();
      return;
    }

    void registroDelServiceWorker().then(async (registro) => {
      if (!registro) {
        enLaPagina();
        return;
      }
      // La marca distingue ESTA tarjeta de las que lleguen después con el mismo
      // tag: a los 5 s se cierra solo ella, como la de la página.
      const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await registro.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/favicon.ico",
          tag: TAG_AVISO_DE_PAGINA,
          data: { url: ruta, kind: KIND_AVISO_DE_PAGINA, marca },
        });
      } catch {
        enLaPagina();
        return;
      }
      setTimeout(() => {
        registro.getNotifications({ tag: TAG_AVISO_DE_PAGINA })
          .then((tarjetas) => {
            for (const t of tarjetas) if ((t.data as { marca?: string } | null)?.marca === marca) t.close();
          })
          .catch(() => { /* ya no está */ });
      }, 5000);
    });
  }, []);

  return { notify };
}
