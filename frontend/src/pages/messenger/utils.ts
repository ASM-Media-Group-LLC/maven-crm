// Nombre a mostrar de un perfil, con degradado útil cuando falta full_name:
// full_name → nombre de WhatsApp → "Usuario" (último recurso). Un perfil ausente
// (undefined) = usuario sin cuenta/borrado → también cae en "Usuario".
export function profileName(
  profile?: { full_name?: string | null; whatsapp_push_name?: string | null } | null
): string {
  return profile?.full_name?.trim() || profile?.whatsapp_push_name?.trim() || "Usuario";
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

export function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(d: string) {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}
