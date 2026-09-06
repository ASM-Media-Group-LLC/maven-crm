// Web Push de ESTE dispositivo: suscribirse, desuscribirse y saber en qué estado
// está. Lo usan usePushSubscription (silencioso, al entrar) y usePushDispositivo
// (el botón "Activar en este dispositivo" de Ajustes → Notificaciones → Canales).
//
// La bandera `maven:push:<userId>` (localStorage) dice "este dispositivo tiene
// suscripción": con ella y el opt-in del usuario, useMessengerNotifications no
// duplica el aviso que ya da el service worker con la pestaña oculta. Es por
// dispositivo a propósito: la misma persona puede tener push en el celular y no
// en el portátil.
import { supabase } from "@/integrations/supabase/client";
import { type Plataforma, puedeActivarPushAqui } from "@/lib/plataformaPwa";

export type EstadoPush = "no-soportado" | "necesita-instalar" | "bloqueado" | "inactivo" | "activo";

export const clavePushDispositivo = (userId: string) => `maven:push:${userId}`;

export function tienePushEnEsteDispositivo(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(clavePushDispositivo(userId)) === "1";
  } catch {
    return false;
  }
}

export function marcarPushEnEsteDispositivo(userId: string, activo: boolean): void {
  try {
    if (activo) localStorage.setItem(clavePushDispositivo(userId), "1");
    else localStorage.removeItem(clavePushDispositivo(userId));
  } catch {
    /* sin storage: la app sigue con el aviso in-app de siempre */
  }
}

export function estadoPushActual(a: {
  userId: string | null | undefined;
  plataforma: Plataforma;
  instalada: boolean;
  /** notification_settings.push_enabled del usuario. */
  optIn: boolean;
  win?: Window;
}): EstadoPush {
  const win = a.win ?? (typeof window !== "undefined" ? window : undefined);
  if (!win) return "no-soportado";
  if ((a.plataforma === "ios-safari" || a.plataforma === "ios-otro") && !a.instalada) return "necesita-instalar";
  if (!puedeActivarPushAqui(a.plataforma, a.instalada, win)) return "no-soportado";
  const permiso = (win as Window & { Notification?: { permission: NotificationPermission } }).Notification?.permission;
  if (permiso === "denied") return "bloqueado";
  if (a.optIn && permiso === "granted" && tienePushEnEsteDispositivo(a.userId)) return "activo";
  return "inactivo";
}

/** La VAPID public key viene en base64url; `applicationServerKey` la quiere
 *  como bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function callWebPush<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("web-push", {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as T;
}

/** null = push no configurado en el servidor (sin claves VAPID). */
export async function obtenerVapidPublicKey(): Promise<string | null> {
  const { publicKey } = await callWebPush<{ publicKey?: string }>("public_key", {});
  return publicKey || null;
}

/** Crea (o reutiliza) la suscripción de este navegador y la guarda en el
 *  servidor. Requiere permiso ya concedido y el service worker registrado. */
export async function suscribirEsteDispositivo(a?: {
  reg?: ServiceWorkerRegistration | null;
  publicKey?: string | null;
}): Promise<PushSubscription> {
  const publicKey = a?.publicKey ?? (await obtenerVapidPublicKey());
  if (!publicKey) throw new Error("push no configurado");
  const reg = a?.reg ?? (await navigator.serviceWorker.getRegistration());
  if (!reg) throw new Error("sin service worker");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys) throw new Error("suscripción inválida");
  await callWebPush("subscribe", { subscription: { endpoint: j.endpoint, keys: j.keys } });
  return sub;
}

/** Borra la suscripción de este navegador en el servidor y en el navegador.
 *  Ojo: también apaga el push de llamadas en este dispositivo. */
export async function desuscribirEsteDispositivo(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await callWebPush("unsubscribe", { endpoint: sub.endpoint });
  } finally {
    await sub.unsubscribe();
  }
}
