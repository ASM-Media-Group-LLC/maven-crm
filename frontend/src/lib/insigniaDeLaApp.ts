// El numerito sobre el icono de la app instalada (Badging API). Cuenta CHATS
// sin leer, no mensajes: el mismo criterio de la nube del topbar (un grupo con
// cuatro mensajes seguidos cuenta 1). En navegador de escritorio la API no
// existe y no pasa nada; en Android/iOS instaladas pinta el número.

export function contarChatsSinLeer(conversations: ReadonlyArray<{ unreadCount: number }>): number {
  return conversations.filter((c) => c.unreadCount > 0).length;
}

type NavConInsignia = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function actualizarInsignia(n: number, nav: Navigator = navigator): Promise<void> {
  const b = nav as NavConInsignia;
  try {
    if (n > 0) {
      if (b.setAppBadge) await b.setAppBadge(n);
    } else if (b.clearAppBadge) {
      await b.clearAppBadge();
    }
  } catch {
    /* sin permiso o sin soporte: el número de la nube sigue mandando */
  }
}

/** Cierra las notificaciones del sistema de un chat (las que puso el service
 *  worker con tag `chat-<id>`), o de todos los chats si no se pasa id. Se llama
 *  al marcar un chat como leído: como en WhatsApp, leer el chat limpia sus
 *  avisos del centro de notificaciones (Jhon lo pidió tras verlas quedarse en
 *  iPhone y Android). Sin service worker (dev, escritorio sin push) no hace nada. */
export async function cerrarNotificacionesDeChat(conversationId?: string): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    const lista = await reg.getNotifications(conversationId ? { tag: `chat-${conversationId}` } : undefined);
    for (const n of lista) {
      if (n.tag && n.tag.startsWith("chat-")) n.close();
    }
  } catch {
    /* sin permiso o sin soporte: las notificaciones se quedan, como antes */
  }
}
