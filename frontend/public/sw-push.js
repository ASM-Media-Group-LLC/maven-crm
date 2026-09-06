// Handlers de Web Push del service worker de Maven. Este archivo se importa
// DENTRO del service worker que genera Workbox (ver vite.config.ts ->
// workbox.importScripts: ["sw-push.js"]), así que corre en el scope del SW y
// solo agrega dos listeners: `push` y `notificationclick`.
//
// Payloads (los arma la edge `web-push`):
//   Llamada entrante (action "notify_call"):
//     { type: "incoming_call", callId, room, callType: "video"|"audio", caller }
//   Aviso (action "notify", lo dispara un trigger de Postgres):
//     { type: "chat_message"|"cowork_llamado"|"inbox_asignacion",
//       title, body, tag, url, conversationId?, messageId? }
//
// Regla de los avisos: si hay una ventana de Maven VISIBLE, no se muestra nada
// (la app ya suena y parpadea el título; mostrarlo sería un aviso doble). Con
// la app cerrada o en segundo plano, se muestra y se acumula por `tag`
// ("3 mensajes nuevos" en vez de tres tarjetas). Al tocarlo se enfoca una
// ventana existente y se le pide que navegue (postMessage "abrir-url"); si no
// hay ninguna, se abre la url.
//
// IMPORTANTE: si este archivo falta, `importScripts("sw-push.js")` tira 404
// DENTRO del callback de Workbox, aborta el registro de skipWaiting y deja el
// SW "zombie" (instalado pero sin handlers) -> el banner "Nueva versión
// disponible" no se va y el botón Recargar no reacciona. No borrar. Y un error
// de sintaxis acá rompe el SW ENTERO: probar con `npm run build && npm run
// preview` antes de mergear.

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  if (!data || !data.type) return;

  if (data.type === "incoming_call") {
    event.waitUntil(mostrarLlamada(data));
    return;
  }
  if (data.title) {
    event.waitUntil(mostrarAviso(data));
  }
});

function mostrarLlamada(data) {
  var caller = data.caller || "Alguien";
  var esVideo = (data.callType || "video") === "video";
  var body = esVideo ? "Videollamada entrante…" : "Llamada entrante…";
  return self.registration.showNotification(caller, {
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
  });
}

function hayVentanaVisible() {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].visibilityState === "visible") return true;
      }
      return false;
    });
}

function mostrarAviso(data) {
  return hayVentanaVisible().then(function (visible) {
    if (visible) return;
    var tag = data.tag || "maven-" + data.type;
    return self.registration
      .getNotifications({ tag: tag })
      .then(function (previas) {
        var count = 1;
        var body = data.body || "";
        // Ráfaga en el mismo chat: una sola tarjeta que va contando.
        if (data.type === "chat_message" && previas.length) {
          var prev = (previas[0] && previas[0].data) || {};
          count = (prev.count || 1) + 1;
          body = count + " mensajes nuevos";
        }
        return self.registration.showNotification(data.title, {
          body: body,
          icon: "/icon-192.png",
          badge: "/favicon.ico",
          tag: tag,
          renotify: true,
          // Android: que suene y vibre cuando el canal del sistema lo permite. Si
          // el canal está en "silenciosa" (ajuste del teléfono), esto no lo cambia.
          silent: false,
          vibrate: [200, 100, 200],
          data: {
            url: data.url || "/",
            kind: data.type,
            conversationId: data.conversationId || "",
            count: count,
          },
        });
      })
      .then(function () {
        // Número en el icono de la app (Android/iOS instalada): tantas como
        // tarjetas haya sin abrir. Sin número, iOS lo dibujaba como un punto (o
        // nada) y pisaba el conteo que la app había dejado. Al abrirse, la app
        // vuelve a poner el conteo exacto de chats sin leer.
        if (self.navigator && self.navigator.setAppBadge) {
          return self.registration.getNotifications().then(function (todas) {
            return self.navigator.setAppBadge(Math.max(1, todas.length)).catch(function () {});
          });
        }
      });
  });
}

function enfocarYNavegar(client, url) {
  return Promise.resolve(client.focus ? client.focus() : client).then(function (c) {
    (c || client).postMessage({ type: "abrir-url", url: url });
  });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var d = event.notification.data || {};

  // --- Aviso (mensaje, llamado, asignación) ---
  if (d.kind) {
    var url = d.url || "/";
    var pathname = url.split("?")[0];
    if (self.navigator && self.navigator.clearAppBadge) {
      self.navigator.clearAppBadge().catch(function () {});
    }
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (list) {
          // Primero una ventana que ya esté en esa sección; si no, cualquier
          // ventana de Maven (navega por dentro, sin recargar); si no hay, abrir.
          for (var i = 0; i < list.length; i++) {
            var p = "";
            try {
              p = new URL(list[i].url).pathname;
            } catch (e) {
              p = "";
            }
            if (p === pathname || p.indexOf(pathname + "/") === 0) {
              return enfocarYNavegar(list[i], url);
            }
          }
          if (list.length) return enfocarYNavegar(list[0], url);
          if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
    return;
  }

  // --- Llamada entrante ---
  var room = d.room || "";
  var urlLlamada = room ? "/call/" + encodeURIComponent(room) : "/";
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
        if (self.clients.openWindow) return self.clients.openWindow(urlLlamada);
      })
  );
});
