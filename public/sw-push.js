/* Handlers de Web Push para llamadas entrantes. Lo IMPORTA el service worker
 * que genera Workbox (ver vite.config.ts → workbox.importScripts). Vive aparte
 * para no tener que reescribir el SW de la PWA.
 *
 * Con Maven cerrado o en otra pestaña, el navegador entrega el push a este SW y
 * mostramos la notificación; al tocarla se abre la sala de la llamada. */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch (_e) {
    return;
  }
  if (data.type !== "incoming_call") return;

  const title = `📞 ${data.caller || "Alguien"} te está llamando`;
  const options = {
    body: "Tocá para contestar",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    // El tag junta re-envíos de la MISMA llamada en una sola notificación.
    tag: `call-${data.callId}`,
    renotify: true,
    // Se queda hasta que la persona la atienda (no se auto-cierra).
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: { room: data.room, callId: data.callId },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const room = event.notification.data && event.notification.data.room;
  const url = room ? `/call/${encodeURIComponent(room)}` : "/messenger";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay una ventana de Maven, la enfocamos y la mandamos a la
        // llamada; si no, abrimos una nueva. La sala arranca en el lobby de
        // dispositivos (micrófono/altavoces/cámara).
        for (const client of clientList) {
          if ("focus" in client && "navigate" in client) {
            client.focus();
            return client.navigate(url).catch(() => self.clients.openWindow(url));
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
