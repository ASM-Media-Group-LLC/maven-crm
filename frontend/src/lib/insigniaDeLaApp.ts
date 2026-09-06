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
