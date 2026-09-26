// Los mensajes que manage-api-keys le devuelve a la página de Ajustes → API keys,
// en el idioma de la interfaz (la página manda `lang` en cada pedido). Sin `lang`
// (una página vieja en caché) todo sigue en español, como antes.

export type Idioma = "es" | "en";

export function idiomaDe(body: unknown): Idioma {
  return (body as { lang?: unknown } | null)?.lang === "en" ? "en" : "es";
}

const MENSAJES = {
  sinSesion: { es: "Unauthorized", en: "Unauthorized" },
  soloAdmins: { es: "Forbidden: solo administradores pueden gestionar API keys", en: "Forbidden: only administrators can manage API keys" },
  sinAgencia: { es: "Forbidden: no pertenecés a ninguna agencia", en: "Forbidden: you don't belong to any agency" },
  variasAgencias: {
    es: "Pertenecés a varias agencias; todavía no se puede elegir en cuál gestionar llaves",
    en: "You belong to several agencies; choosing which one to manage keys for isn't supported yet",
  },
  diasInvalidos: { es: "expires_in_days tiene que ser un número de días entre 0 y 3650", en: "expires_in_days must be a number of days between 0 and 3650" },
  nombreRequerido: { es: "El nombre de la key es requerido", en: "The key name is required" },
  nombreVacio: { es: "El nombre no puede quedar vacío", en: "The name can't be empty" },
  alMenosUnScope: { es: "Elige al menos un permiso (scope)", en: "Choose at least one permission (scope)" },
  scopesInvalidos: { es: "Scope(s) inválido(s): {lista}", en: "Invalid scope(s): {lista}" },
  fechaInvalida: { es: "Fecha de expiración inválida", en: "Invalid expiration date" },
  ipsInvalidas: { es: "IP(s) inválida(s): {lista}", en: "Invalid IP(s): {lista}" },
  confirmarMessenger: {
    es: "Confirmá que la key va a leer TUS conversaciones del Messenger",
    en: "Confirm that the key will read YOUR Messenger conversations",
  },
  maximoDeKeys: {
    es: "Llegaste al máximo de {max} API keys activas. Revoca una antes de crear otra.",
    en: "You've reached the maximum of {max} active API keys. Revoke one before creating another.",
  },
  idRequerido: { es: "id de la key es requerido", en: "The key id is required" },
  nadaQueActualizar: { es: "Nada para actualizar", en: "Nothing to update" },
  noExisteORevocada: { es: "La key no existe o está revocada", en: "The key doesn't exist or has been revoked" },
  noExisteOYaRevocada: { es: "La key no existe o ya estaba revocada", en: "The key doesn't exist or was already revoked" },
  messengerSoloNuevas: {
    es: "El permiso de Messenger solo se puede poner al crear una key nueva",
    en: "The Messenger permission can only be added when creating a new key",
  },
  messengerSoloDueno: {
    es: "Solo la persona dueña de esta key de Messenger puede editarla; cualquier admin puede revocarla",
    en: "Only the owner of this Messenger key can edit it; any admin can revoke it",
  },
  messengerNoExtender: {
    es: "A una key con Messenger no se le puede extender el vencimiento: creá otra",
    en: "A Messenger key's expiration can't be extended: create a new one",
  },
  messengerSinIps: { es: "Las keys con Messenger necesitan IPs fijas (whitelist)", en: "Messenger keys need fixed IPs (whitelist)" },
  messengerSinRangos: { es: "Con Messenger van IPs exactas, sin rangos (/)", en: "Messenger keys take exact IPs, no ranges (/)" },
  messengerSinVencimiento: { es: "Las keys con Messenger necesitan fecha de vencimiento", en: "Messenger keys need an expiration date" },
  vencimientoPasado: { es: "La fecha de vencimiento ya pasó", en: "The expiration date has already passed" },
  messengerMaxDias: {
    es: "Las keys con Messenger vencen como máximo en {dias} días",
    en: "Messenger keys can expire in {dias} days at most",
  },
  accionDesconocida: { es: "Acción desconocida: {accion}", en: "Unknown action: {accion}" },

  // ── webhooks del Messenger (webhooks.ts) ──
  webhookUrlRequerida: { es: "Falta la URL del webhook", en: "The webhook URL is missing" },
  webhookExcludeOwnInvalido: { es: "exclude_own tiene que ser verdadero o falso", en: "exclude_own must be true or false" },
  webhookSoloMessenger: {
    es: "Solo una key con el permiso de Messenger puede tener webhook",
    en: "Only a key with the Messenger permission can have a webhook",
  },
  webhookSoloDueno: {
    es: "Solo la persona dueña de la key puede registrar, probar o reanudar su webhook; cualquier admin puede pausarlo o borrarlo",
    en: "Only the owner of the key can register, test or resume its webhook; any admin can pause or delete it",
  },
  webhookLlaveNoActiva: { es: "La key está revocada o vencida", en: "The key is revoked or expired" },
  webhookPersonaNoVigente: {
    es: "La persona de la key ya no está activa en la agencia",
    en: "The person this key acts as is no longer active in the agency",
  },
  webhookYaExiste: {
    es: "Esta key ya tiene un webhook. Borralo para registrar otro.",
    en: "This key already has a webhook. Delete it to register a new one.",
  },
  webhookSinConfigurar: {
    es: "Los webhooks todavía no están configurados en el servidor",
    en: "Webhooks aren't configured on the server yet",
  },
  webhookUrlInvalida: { es: "La URL no es válida", en: "The URL isn't valid" },
  webhookUrlNoHttps: { es: "La URL tiene que empezar con https://", en: "The URL must start with https://" },
  webhookUrlPuerto: { es: "La URL solo puede usar el puerto 443", en: "The URL can only use port 443" },
  webhookUrlUsuario: { es: "La URL no puede llevar usuario ni contraseña", en: "The URL can't include a username or password" },
  webhookUrlFragmento: { es: "La URL no puede tener # (fragmento)", en: "The URL can't include # (a fragment)" },
  webhookUrlMuyLarga: { es: "La URL tiene más de 2048 caracteres", en: "The URL is longer than 2048 characters" },
  webhookUrlIp: { es: "La URL tiene que usar un nombre de dominio, no una IP", en: "The URL must use a domain name, not an IP address" },
  webhookUrlHostInvalido: { es: "El nombre de dominio de la URL no es válido", en: "The URL's domain name isn't valid" },
  webhookUrlHostProhibido: {
    es: "Esa URL no se acepta: es de Maven, de Supabase o de una red interna",
    en: "That URL isn't allowed: it belongs to Maven, to Supabase or to an internal network",
  },
  webhookErrorBase: { es: "No se pudo guardar el cambio del webhook", en: "Couldn't save the webhook change" },
  webhookErrorLectura: {
    es: "No se pudo consultar el webhook. Probá de nuevo en un momento.",
    en: "Couldn't load the webhook. Try again in a moment.",
  },
  webhookErrorInesperado: {
    es: "No se pudo completar la acción del webhook. Probá de nuevo en un momento.",
    en: "The webhook action couldn't be completed. Try again in a moment.",
  },
  webhookIdRequerido: { es: "Falta el id del webhook", en: "The webhook id is missing" },
  webhookLlaveSinMessenger: {
    es: "La key ya no tiene el permiso de Messenger. Creá una key nueva y registrá el webhook ahí.",
    en: "The key no longer has the Messenger permission. Create a new key and register the webhook there.",
  },
  webhookSecretoIlegible: {
    es: "No se puede usar el secreto de este webhook: borralo y registralo de nuevo",
    en: "This webhook's secret can't be used: delete it and register it again",
  },
  webhookVariasAgencias: {
    es: "Hay más de una agencia en Maven: los webhooks quedan apagados hasta resolverlo",
    en: "There's more than one agency in Maven: webhooks stay off until that's resolved",
  },
  webhookReglaBase: {
    es: "La key, su persona o la agencia cambiaron mientras se registraba el webhook. Actualizá la página y probá de nuevo.",
    en: "The key, its person or the agency changed while the webhook was being registered. Refresh the page and try again.",
  },
  webhookNoExiste: { es: "El webhook no existe", en: "The webhook doesn't exist" },
  webhookNoEstaActivo: { es: "Solo se puede pausar un webhook activo", en: "Only an active webhook can be paused" },
  webhookNoEstaParado: { es: "El webhook no está pausado ni detenido", en: "The webhook isn't paused or stopped" },
  webhookPruebaMuySeguida: {
    es: "Esperá {segundos} segundos entre una prueba y la siguiente",
    en: "Wait {segundos} seconds between one test and the next",
  },
  webhookNoSePudoActivar: {
    es: "La prueba llegó, pero el webhook no se pudo activar: la key o su persona pueden haber cambiado recién. Actualizá la página.",
    en: "The test was delivered, but the webhook couldn't be activated: the key or its person may have just changed. Refresh the page.",
  },
  webhookYaEstabaActivo: { es: "El webhook ya estaba activo", en: "The webhook was already active" },
  webhookPruebaEntregada: { es: "La prueba llegó: el servidor contestó {codigo}", en: "The test was delivered: the server answered {codigo}" },
  webhookPrueba410: {
    es: "El servidor contestó 410: dice que esa URL ya no existe",
    en: "The server answered 410: it says that URL no longer exists",
  },
  webhookPruebaHttp: { es: "El servidor del integrador contestó {codigo}", en: "The integrator's server answered {codigo}" },
  webhookPruebaPlazo: { es: "El servidor no contestó en 10 segundos", en: "The server didn't answer within 10 seconds" },
  webhookPruebaIncierto: {
    es: "La prueba salió, pero la respuesta del servidor no se pudo leer",
    en: "The test was sent, but the server's answer couldn't be read",
  },
  webhookPruebaConexion: { es: "No se pudo conectar con el servidor", en: "Couldn't connect to the server" },
  webhookPruebaTls: {
    es: "No se pudo verificar el certificado HTTPS del servidor (vencido, autofirmado, de una autoridad no reconocida o emitido para otro nombre). El integrador tiene que usar un certificado público válido para ese dominio.",
    en: "The server's HTTPS certificate couldn't be verified (expired, self-signed, from an untrusted authority or issued for another name). The integrator needs a valid public certificate for that domain.",
  },
  webhookPruebaDns: { es: "No se pudo encontrar el servidor (DNS)", en: "Couldn't find the server (DNS)" },
  webhookPruebaDireccion: {
    es: "El nombre apunta a una dirección privada o reservada",
    en: "The name points to a private or reserved address",
  },
} as const satisfies Record<string, { es: string; en: string }>;

export type ClaveDeMensaje = keyof typeof MENSAJES;

export function msg(idioma: Idioma, clave: ClaveDeMensaje, vars: Record<string, string | number> = {}): string {
  return MENSAJES[clave][idioma].replace(/\{(\w+)\}/g, (_, v) => (v in vars ? String(vars[v]) : `{${v}}`));
}

export const TODOS_LOS_MENSAJES = MENSAJES;
