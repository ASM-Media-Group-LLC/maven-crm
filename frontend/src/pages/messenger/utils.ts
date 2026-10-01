import type { Language } from "@/lib/i18n";
import type { Traductor } from "./preview";

// En español se queda el locale "es" de siempre; solo en inglés pasa a en-US.
const localeDe = (lang: Language) => (lang === "en" ? "en-US" : "es");

// Nombre a mostrar de un perfil, con degradado útil cuando falta full_name:
// full_name → nombre de WhatsApp → "Usuario" (último recurso). Un perfil ausente
// (undefined) = usuario sin cuenta/borrado → también cae en "Usuario".
//
// `sinNombre` es el último recurso en el idioma de quien mira: lo pasa el
// componente que dibuja (t("messenger.usuario")). Sin él queda "Usuario", que es
// lo que usa useChat al armar la lista.
export function profileName(
  profile?: { full_name?: string | null; whatsapp_push_name?: string | null } | null,
  sinNombre = "Usuario",
): string {
  return profile?.full_name?.trim() || profile?.whatsapp_push_name?.trim() || sinNombre;
}

/** Quién aparece como autor de un mensaje en pantalla. */
export interface RemitenteVisible {
  /** Lo que se dibuja como autor: el nombre visible de la key («BLU») si vino
   *  por API; si no, el de la persona. */
  nombre: string;
  /** true = lo mandó una integración (lo decide `api_key_id`, no el nombre). */
  esApi: boolean;
  /** La persona detrás (dueña de la key, o quien lo escribió): va en el tooltip. */
  personaReal: string;
}

/**
 * El autor de un mensaje tal como lo tiene que ver quien mira. Un mensaje por API
 * se muestra con el nombre visible de la key («BLU») y nunca con el de la persona
 * dueña de la key: si no, «BLU» se vería como Jhon. El nombre visible viene de la
 * fila (lo copió la base de api_keys al estampar el mensaje): es dato y no se
 * traduce, ni se busca en profiles.
 *
 * Una sola función para la burbuja, la cita, el hilo, la búsqueda, los enlaces y
 * la vista previa: si cada pantalla lo resolviera por su cuenta, una diría «BLU»
 * y otra el nombre de la persona.
 */
export function remitenteVisible(
  msg: { sender_id: string; api_key_id?: string | null; api_display_name?: string | null },
  profiles: Record<string, { full_name?: string | null; whatsapp_push_name?: string | null } | undefined>,
  t: Traductor,
): RemitenteVisible {
  const personaReal = profileName(profiles[msg.sender_id], t("messenger.usuario"));
  const esApi = msg.api_key_id != null;
  if (!esApi) return { nombre: personaReal, esApi, personaReal };
  // La base exige el nombre junto con la key (chat_messages_api_coherente); el
  // respaldo es por si llega una fila a medias, que igual se marca como API.
  const nombre = msg.api_display_name?.trim() || t("messenger.api.etiqueta");
  return { nombre, esApi, personaReal };
}

/**
 * ¿Dos mensajes seguidos van en el mismo tramo de burbujas (sin repetir nombre ni
 * cara)? Mismo autor, menos de 2 minutos entre uno y otro, y la misma marca de API:
 * un «BLU» pegado a un mensaje que la persona escribió a mano tiene que cortar el
 * tramo, o el segundo se vería como del primero.
 */
export function isSameGroup(
  a: { sender_id: string; created_at: string; api_key_id?: string | null },
  b: { sender_id: string; created_at: string; api_key_id?: string | null },
): boolean {
  if (a.sender_id !== b.sender_id) return false;
  if ((a.api_key_id ?? null) !== (b.api_key_id ?? null)) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 120000;
}

// href seguro para archivos: solo http(s). Bloquea javascript:/data:/blob: inyectados por la
// API (un mensaje type='file' con file_url malicioso ejecutaría al clickear = XSS almacenado).
export function safeFileUrl(url?: string | null): string {
  if (!url) return "#";
  return /^https?:\/\//i.test(url.trim()) ? url : "#";
}

export function getInitials(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function formatTime(d: string, lang: Language) {
  return new Date(d).toLocaleTimeString(localeDe(lang), { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(d: string, t: Traductor, lang: Language) {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return t("common.today");
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t("messenger.preview.ayer");
  return date.toLocaleDateString(localeDe(lang), { day: "numeric", month: "short" });
}

// "Ver miembros solo admins": quién puede ver la lista completa de un grupo.
// Vive acá y no en cada pantalla porque el candado ya se coló una vez (#1373):
// cada vía nueva que muestre miembros tiene que preguntarle a ESTA función.
export function puedeVerLaListaDeMiembros(
  conversation: {
    type: "direct" | "group";
    members_visibility?: "all" | "admins" | null;
    participants: { user_id: string; role?: string }[];
  },
  userId?: string,
): boolean {
  if (conversation.type !== "group") return true;
  if (conversation.members_visibility !== "admins") return true;
  return conversation.participants.some(p => p.user_id === userId && p.role === "admin");
}
