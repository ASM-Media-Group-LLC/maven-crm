// Handlers de Web Push del service worker de Maven. Este archivo se importa
// DENTRO del service worker que genera Workbox (ver vite.config.ts ->
// workbox.importScripts: ["sw-push.js"]), así que corre en el scope del SW y
// solo agrega dos listeners: `push` y `notificationclick`.
//
// Payloads (los arma la edge `web-push`):
//   Llamada entrante (action "notify_call"):
//     { type: "incoming_call", callId, room, callType: "video"|"audio", caller }
//   Aviso (action "notify", lo dispara un trigger de Postgres):
//     { type: "chat_message"|"cowork_llamado"|"inbox_asignacion"|"correo_nuevo",
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

// AUTO-UNREGISTER para /aportar/ (Alvaro, 06/11). La página pública de aportes
// la usan creadoras externas que subieron antes del fix del motor de subida y
// les quedó un SW cacheando bundles viejos (con el bug del x-upsert → 403).
// Cuando una navegación entra a /aportar/, el SW se desinstala a sí mismo,
// borra todos los caches y hace passthrough a la red para que el navegador
// baje el HTML + bundle frescos sin SW de por medio. En la próxima recarga
// (que ya es la primera página sin SW) la subida TUS funciona.
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.mode !== "navigate") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.pathname.indexOf("/aportar/") !== 0 && url.pathname.indexOf("/subir/") !== 0) return;
  event.respondWith((async function () {
    try {
      await self.registration.unregister();
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) { /* no bloquear la página por esto */ }
    return fetch(req);
  })());
});

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
    // El acuse va en PARALELO al aviso, no después: si hay una ventana de Maven
    // abierta, `mostrarAviso` sale temprano sin dibujar nada, y aun así el
    // mensaje LLEGÓ a este dispositivo y hay que decirlo.
    event.waitUntil(Promise.all([mostrarAviso(data), avisarEntregado(data)]));
  }
});

// "Le llegó al teléfono" — el ✓ que faltaba.
//
// Hasta ahora, a alguien le sonaba el celular y el que mandó seguía viendo
// "aún no le llegó" hasta que la persona abriera Maven. Le había llegado de
// verdad y la base no se enteraba.
//
// Este service worker NO sabe de quién es el aviso: `web-push` manda el mismo
// mensaje cifrado a todos los destinatarios. Y tampoco tiene la sesión del
// usuario, porque un service worker no ve el localStorage donde vive el token.
//
// Lo único que sí sabe es su PROPIA suscripción, y esa dirección ya está en la
// base junto a su dueño. Así que se la manda al servidor y él resuelve quién es.
// La comprobación de que esa persona pertenece a la conversación la hace la
// edge `push-entregado`; acá no se decide nada.
//
// Si algo falla no se reintenta ni se avisa: es un ✓, no un mensaje. El acuse
// se vuelve a intentar solo cuando la persona abra Maven.
function avisarEntregado(data) {
  if (data.type !== "chat_message" || !data.messageId || !data.ackUrl) {
    return Promise.resolve();
  }
  return self.registration.pushManager
    .getSubscription()
    .then(function (sub) {
      if (!sub || !sub.endpoint) return;
      return fetch(data.ackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: data.messageId, endpoint: sub.endpoint }),
      });
    })
    .catch(function () {
      /* sin red o puerta caída: el ✓ se pondrá al abrir Maven */
    });
}

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
        // Ráfaga en el mismo chat (o varios correos seguidos en el mismo buzón):
        // una sola tarjeta que va contando.
        if ((data.type === "chat_message" || data.type === "correo_nuevo") && previas.length) {
          var prev = (previas[0] && previas[0].data) || {};
          count = (prev.count || 1) + 1;
          body = count + (data.type === "correo_nuevo" ? " correos nuevos" : " mensajes nuevos");
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

// La ruta INTERNA de un aviso: "/hr/en-vivo/<persona>?alerta=<id>" tal cual,
// con su ?query y su #hash. Algunos avisos llegan con la url ABSOLUTA de Maven
// ("https://app.maven-ai.me/hr/…", el vigilante del equipo): antes esa url no
// casaba con ninguna ventana y la app la descartaba (solo acepta rutas que
// empiezan con "/"), así que tocar el aviso en el iPhone con Maven abierto
// detrás no llevaba a ningún lado. Ahora se recorta a la ruta. Una url de OTRO
// sitio devuelve null y se abre aparte, sin pasar por la app.
function rutaInterna(url) {
  try {
    var u = new URL(url || "/", self.location.origin);
    if (u.origin !== self.location.origin) return null;
    return u.pathname + u.search + u.hash;
  } catch (e) {
    return null;
  }
}

// EL AVISO PENDIENTE (iPhone, app instalada). El postMessage a una ventana que
// iOS tenía congelada a veces no llega (iOS la recarga al volver y el mensaje se
// pierde), y abrir la app en frío a veces cae en el inicio y no en la url. Por
// eso, además, se deja la ruta anotada un momento: la app, al despertar, la lee
// (useNavegarDesdeNotificacion), la borra y navega ahí si todavía no está.
var CACHE_AVISO = "maven-aviso-pendiente";
var CLAVE_AVISO = "/__aviso-pendiente";
function anotarPendiente(ruta) {
  if (!ruta || !self.caches) return Promise.resolve();
  return self.caches
    .open(CACHE_AVISO)
    .then(function (c) {
      return c.put(
        CLAVE_AVISO,
        new Response(JSON.stringify({ url: ruta, at: Date.now() }), {
          headers: { "Content-Type": "application/json" },
        })
      );
    })
    .catch(function () {
      /* sin caché: queda el postMessage y el openWindow */
    });
}

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var d = event.notification.data || {};

  // --- Aviso (mensaje, llamado, asignación) ---
  if (d.kind) {
    var url = d.url || "/";
    var ruta = rutaInterna(url);
    var pathname = (ruta || "/").split("?")[0].split("#")[0];
    if (self.navigator && self.navigator.clearAppBadge) {
      self.navigator.clearAppBadge().catch(function () {});
    }
    // La nota va PRIMERO: así, cuando la ventana recibe el mensaje y la borra,
    // ya está escrita (si se escribiera después, quedaría colgada y la app
    // volvería a saltar a esa vista la próxima vez que se abra).
    event.waitUntil(
      anotarPendiente(ruta)
        .then(function () {
          return self.clients.matchAll({ type: "window", includeUncontrolled: true });
        })
        .then(function (list) {
        list = list || [];
        // Fuera de Maven: se abre tal cual, sin tocar las ventanas de la app.
        if (!ruta) {
          if (self.clients.openWindow) return self.clients.openWindow(url);
          return;
        }
        // Primero una ventana que ya esté en esa sección; si no, cualquier
        // ventana de Maven (navega por dentro, sin recargar); si no hay, abrir
        // EXACTAMENTE esa ruta (absoluta, con su ?query).
        for (var i = 0; i < list.length; i++) {
          var p = "";
          try {
            p = new URL(list[i].url).pathname;
          } catch (e) {
            p = "";
          }
          if (p === pathname || p.indexOf(pathname + "/") === 0) {
            return enfocarYNavegar(list[i], ruta);
          }
        }
        if (list.length) return enfocarYNavegar(list[0], ruta);
        if (self.clients.openWindow) return self.clients.openWindow(self.location.origin + ruta);
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
