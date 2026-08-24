import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Suscribe el navegador a Web Push para recibir llamadas entrantes con Maven
// CERRADO o en otra pestaña. La suscripción se guarda en `push_subscriptions`
// (vía edge web-push) y el service worker (sw-push.js) muestra la notificación.
//
// Best-effort: si el navegador no soporta push, el usuario niega el permiso, o
// las claves VAPID no están configuradas, no pasa nada — el modal in-app sigue
// cubriendo el caso "Maven abierto".

/** La VAPID public key viene en base64url; `applicationServerKey` la quiere
 *  como bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function callWebPush<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("web-push", {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as T;
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
        const { publicKey } = await callWebPush<{ publicKey?: string }>("public_key", {});
        if (!publicKey || cancelled) return;

        // 2. Permiso (solo si nunca se decidió; si está "denied", no insistimos).
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (cancelled || Notification.permission !== "granted") return;

        const reg = await navigator.serviceWorker.ready;

        // 3. Reusar la suscripción si ya existe; si no, crearla con la VAPID key.
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
        if (cancelled) return;

        const j = sub.toJSON();
        if (!j.endpoint || !j.keys) return;
        await callWebPush("subscribe", {
          subscription: { endpoint: j.endpoint, keys: j.keys },
        });
      } catch {
        /* push no disponible: el modal in-app sigue funcionando */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
