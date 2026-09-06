import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { esMovil } from "@/lib/plataformaPwa";
import {
  marcarPushEnEsteDispositivo,
  obtenerVapidPublicKey,
  suscribirEsteDispositivo,
} from "@/lib/pushDispositivo";

// Suscribe el navegador a Web Push en silencio al entrar, para las llamadas
// entrantes con Maven CERRADO o en otra pestaña (y, con el opt-in del usuario,
// para los mensajes). La suscripción se guarda en `push_subscriptions` (vía la
// edge web-push) y el service worker (sw-push.js) muestra la notificación.
//
// Best-effort: si el navegador no soporta push, el usuario niega el permiso, o
// las claves VAPID no están configuradas, no pasa nada — el modal in-app sigue
// cubriendo el caso "Maven abierto".
//
// En el teléfono NO pide el permiso al entrar (ver esMovil abajo); si ya está
// concedido —porque la persona tocó "Activar en este dispositivo"— sí se
// suscribe, y así una suscripción caída se repara sola en la próxima entrada.
//
// Al suscribir con éxito deja la bandera `maven:push:<userId>` (lib/pushDispositivo):
// con ella, useMessengerNotifications no duplica el aviso que ya da el service
// worker cuando el usuario activó push_enabled.

/** `navigator.serviceWorker.ready` no resuelve NUNCA si no hay service worker
 *  (dev en localhost, navegador sin soporte): con tope para no dejar la promesa
 *  colgada. En prod el SW se registra en los primeros segundos. */
function esperarServiceWorker(ms: number): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

export function usePushSubscription() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 1. ¿El push está configurado (VAPID)? Se pregunta ANTES de pedir el
        //    permiso: si no hay claves, no molestamos con el prompt.
        const publicKey = await obtenerVapidPublicKey();
        if (!publicKey || cancelled) return;

        // 2. Permiso. Solo si nunca se decidió (si está "denied", no insistimos),
        //    y solo en escritorio: en iPhone el prompt sin gesto no aparece o se
        //    pierde para siempre, y en Android sin gesto Chrome lo silencia. En
        //    el teléfono lo pide el botón de Ajustes (usePushDispositivo).
        if (Notification.permission === "default") {
          if (esMovil()) return;
          await Notification.requestPermission();
        }
        if (cancelled) return;
        if (Notification.permission !== "granted") {
          marcarPushEnEsteDispositivo(user.id, false);
          return;
        }

        const reg = await esperarServiceWorker(15000);
        if (!reg || cancelled) return;

        // 3. Reusar la suscripción si ya existe; si no, crearla con la VAPID key.
        await suscribirEsteDispositivo({ reg, publicKey });
        if (!cancelled) marcarPushEnEsteDispositivo(user.id, true);
      } catch {
        /* push no disponible: el modal in-app sigue funcionando */
        marcarPushEnEsteDispositivo(user.id, false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
