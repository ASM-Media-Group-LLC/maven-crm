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
