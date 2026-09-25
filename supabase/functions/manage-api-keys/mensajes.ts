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
} as const satisfies Record<string, { es: string; en: string }>;

export type ClaveDeMensaje = keyof typeof MENSAJES;

export function msg(idioma: Idioma, clave: ClaveDeMensaje, vars: Record<string, string | number> = {}): string {
  return MENSAJES[clave][idioma].replace(/\{(\w+)\}/g, (_, v) => (v in vars ? String(vars[v]) : `{${v}}`));
}

export const TODOS_LOS_MENSAJES = MENSAJES;
