// Handlers de Web Push para las LLAMADAS entrantes con Maven cerrado o en otra
// pestaña del navegador. Este archivo se importa DENTRO del service worker que
// genera Workbox (ver vite.config.ts -> workbox.importScripts: ["sw-push.js"]),
// así que corre en el scope del SW y solo agrega dos listeners.
//
// El payload lo arma la edge `web-push` (action "notify_call"):
//   { type: "incoming_call", callId, room, callType: "video"|"audio", caller }
//
// IMPORTANTE: si este archivo falta, `importScripts("sw-push.js")` tira 404
// DENTRO del callback de Workbox, aborta el registro de skipWaiting y deja el
// SW "zombie" (instalado pero sin handlers) -> el banner "Nueva versión
// disponible" no se va y el botón Recargar no reacciona. No borrar.

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  if (!data || data.type !== "incoming_call") return;

  var caller = data.caller || "Alguien";
  var esVideo = (data.callType || "video") === "video";
  var body = esVideo ? "Videollamada entrante…" : "Llamada entrante…";

  event.waitUntil(
    self.registration.showNotification(caller, {
      body: body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      // Un tag por llamada para que no se apilen notificaciones repetidas.
      tag: "maven-call-" + (data.callId || data.room || "x"),
      renotify: true,
      // Se queda hasta que el usuario la toque (como un timbre real).
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400],
      data: { room: data.room || "", callId: data.callId || "" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var room = (event.notification.data && event.notification.data.room) || "";
  var url = room ? "/call/" + encodeURIComponent(room) : "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (list) {
        // Si ya hay una pestaña con ESTA llamada abierta, la enfocamos.
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (
            room &&
            c.url &&
            c.url.indexOf("/call/") !== -1 &&
            c.url.indexOf(encodeURIComponent(room)) !== -1
          ) {
            return c.focus();
          }
        }
        // Si no, abrimos la llamada en su propia pestaña (igual que al aceptar
        // desde el modal in-app).
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
