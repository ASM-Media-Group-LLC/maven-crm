// Instalar Maven en el teléfono y los avisos push de este dispositivo.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_PWA = ["pwa.", "push."] as const;

export const pwa = {
  // PWA: instalar Maven en el teléfono y avisos push en este dispositivo
  // Abrir los links de Maven en la app de computador (17/11/2026)
  "pwa.app.titulo": { es: "Abrir en la app de Maven", en: "Open in the Maven app" },
  "pwa.app.descripcion": { es: "Se abre en la app de tu computador, no en el navegador.", en: "It opens in the app on your computer, not in the browser." },
  "pwa.app.abrir": { es: "Abrir en la app", en: "Open in the app" },
  "pwa.app.quedarme": { es: "Seguir en el navegador", en: "Stay in the browser" },
  "pwa.app.siempre": { es: "Abrir siempre en la app", en: "Always open in the app" },
  "pwa.app.abriendo": { es: "Abriendo en la app de Maven…", en: "Opening in the Maven app…" },
  "pwa.app.noSeAbrio": { es: "¿No se abrió? Descarga la app", en: "Didn't open? Download the app" },
  "pwa.instalar.titulo": { es: "Instala Maven en tu teléfono", en: "Install Maven on your phone" },
  "pwa.instalar.descripcion": { es: "Abre más rápido y recibe avisos de mensajes aunque esté cerrada.", en: "Opens faster and gets message alerts even when it's closed." },
  "pwa.instalar.boton": { es: "Instalar Maven", en: "Install Maven" },
  "pwa.instalar.androidManual": { es: "Toca el menú ⋮ del navegador (arriba a la derecha) → «Instalar app» o «Añadir a pantalla de inicio»", en: "Tap the browser menu ⋮ (top right) → “Install app” or “Add to Home screen”" },
  "pwa.instalar.iosPaso1": { es: "Toca Compartir: el cuadrado con la flecha hacia arriba, en la barra de abajo", en: "Tap Share: the square with the up arrow in the bottom bar" },
  "pwa.instalar.iosPaso2": { es: "En la lista, toca «Agregar a Inicio» (en algunos iPhone dice «Añadir a pantalla de inicio»)", en: "In the list, tap “Add to Home Screen”" },
  "pwa.instalar.iosPaso3": { es: "Toca «Agregar» arriba a la derecha", en: "Tap “Add” in the top right" },
  "pwa.instalar.iosPaso4": { es: "Abre Maven desde el icono nuevo de tu pantalla de inicio", en: "Open Maven from the new icon on your Home Screen" },
  "pwa.instalar.iosSoloSafari": { es: "¿No aparece «Agregar a Inicio»? Pasa en Brave y otros navegadores: en esa misma lista toca «Abrir en Safari» y repite los pasos allí.", en: "Don't see “Add to Home Screen”? It happens in Brave and other browsers: in that same list tap “Open in Safari” and repeat the steps there." },
  "pwa.instalar.copiarEnlace": { es: "Copiar enlace", en: "Copy link" },
  "pwa.instalar.enlaceCopiado": { es: "Enlace copiado", en: "Link copied" },
  "pwa.instalar.posponer": { es: "Ahora no", en: "Not now" },
  "pwa.instalar.yaInstalada": { es: "Maven ya está instalada en este dispositivo.", en: "Maven is already installed on this device." },
  "pwa.instalar.soloTelefono": { es: "Disponible en el teléfono: abre app.maven-ai.me desde el celular.", en: "Available on the phone: open app.maven-ai.me from your mobile." },
  "pwa.app.nueva": { es: "Hay una versión nueva de la app de Maven ({v}).", en: "There's a new version of the Maven app ({v})." },
  "pwa.app.actualizar": { es: "Actualizar", en: "Update" },
  "pwa.app.actualizando": { es: "Actualizando…", en: "Updating…" },
  "pwa.app.nuevaEnLlamada": { es: "Se corta unos segundos y vuelve a entrar. Si no tocas nada, se actualiza sola al colgar.", en: "It drops for a few seconds and rejoins. If you do nothing, it updates itself when you hang up." },
  "pwa.actualizar.titulo": { es: "Nueva versión disponible", en: "New version available" },
  "pwa.actualizar.boton": { es: "Recargar", en: "Reload" },
  "pwa.actualizar.enLlamada": { es: "Hay una versión nueva de Maven: se actualiza sola cuando termines la llamada.", en: "There's a new version of Maven: it updates itself when you finish the call." },
  "push.dispositivo.titulo": { es: "Notificaciones en este dispositivo", en: "Notifications on this device" },
  "push.dispositivo.descripcion": { es: "Mensajes, correos nuevos, llamados y asignaciones aunque Maven esté cerrada. Se activa por dispositivo.", en: "Messages, new emails, call-outs and assignments even when Maven is closed. Enabled per device." },
  "push.dispositivo.activas": { es: "Activas", en: "On" },
  "push.dispositivo.inactivas": { es: "Inactivas", en: "Off" },
  "push.dispositivo.bloqueadas": { es: "Bloqueadas en el navegador", en: "Blocked in the browser" },
  "push.dispositivo.noSoportado": { es: "No disponible en este navegador", en: "Not available in this browser" },
  "push.dispositivo.necesitaInstalar": { es: "En iPhone, los avisos solo llegan con Maven instalada en la pantalla de inicio.", en: "On iPhone, alerts only arrive with Maven installed on the Home Screen." },
  "push.dispositivo.activar": { es: "Activar en este dispositivo", en: "Turn on for this device" },
  "push.dispositivo.desactivar": { es: "Desactivar", en: "Turn off" },
  "push.dispositivo.desactivadas": { es: "Avisos desactivados en este dispositivo", en: "Alerts turned off on this device" },
  "push.dispositivo.ayudaBloqueadoAndroid": { es: "Chrome → candado o ⋮ junto a la dirección → Permisos → Notificaciones → Permitir.", en: "Chrome → lock or ⋮ next to the address → Permissions → Notifications → Allow." },
  "push.dispositivo.ayudaBloqueadoIos": { es: "Ajustes del iPhone → Notificaciones → Maven → Permitir notificaciones.", en: "iPhone Settings → Notifications → Maven → Allow Notifications." },
  "push.dispositivo.ayudaBloqueadoEscritorio": { es: "Haz clic en el candado de la barra de direcciones → Notificaciones → Permitir.", en: "Click the lock in the address bar → Notifications → Allow." },
  "push.dispositivo.ayudaEmergenteAndroid": { es: "¿El aviso solo aparece al bajar la barra de notificaciones y no como ventana emergente? Es un ajuste de Android: Ajustes → Notificaciones → Maven (o Chrome → Notificaciones de sitios) → activa «Emergente» o «Mostrar en pantalla».", en: "Does the alert only show when you pull down the notification shade, not as a pop-up? It's an Android setting: Settings → Notifications → Maven (or Chrome → Site notifications) → turn on “Pop on screen”." },
  "push.dispositivo.exito": { es: "Avisos activados en este dispositivo", en: "Alerts turned on for this device" },
  "push.dispositivo.error": { es: "No se pudo activar. Intenta de nuevo.", en: "Couldn't turn it on. Try again." },
} as const satisfies Record<string, { es: string; en: string }>;
