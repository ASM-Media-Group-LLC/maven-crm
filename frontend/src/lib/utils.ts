import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Dominios sociales conocidos (para detectar que pegaron un link aunque venga sin
// protocolo, con www, o con basura adelante tipo ":https://...").
const SOCIAL_DOMAIN_RE = /\b(?:instagram|tiktok|twitter|onlyfans|facebook|reddit|youtube|linkedin|x|t)\.[a-z]{2,}/i;
// Prefijos de ruta que NO son el usuario (reddit /user//u, linkedin /in, youtube /c//channel).
const PATH_PREFIX_RE = /^(?:user|u|in|c|channel)$/i;

/**
 * Acepta un @handle O un link de perfil (con o sin protocolo, con www, con basura
 * inicial pegada) y devuelve el USERNAME limpio. Robusto ante casos rotos reales
 * como ":https://www.instagram.com/stephtsa/" (que antes pasaba crudo y rompía el scan).
 */
export function cleanHandle(handle: string | null | undefined): string {
  if (!handle) return "";
  // Quitar espacios y basura inicial pegada: ":", "@" (ej. ":https://...", "@https://...").
  let h = handle.trim().replace(/^[\s:@]+/, "");
  if (!h) return "";
  // ¿Trae esquema o un dominio social? → es un link: extraer el usuario del path.
  if (/^https?:\/\//i.test(h) || SOCIAL_DOMAIN_RE.test(h)) {
    const withProto = /^https?:\/\//i.test(h) ? h : `https://${h}`;
    try {
      const url = new URL(withProto);
      let segs = url.pathname.split("/").filter(Boolean);
      // Saltar prefijos de ruta que no son el usuario (reddit /user/<x>, linkedin /in/<x>...).
      if (segs.length > 1 && PATH_PREFIX_RE.test(segs[0])) segs = segs.slice(1);
      h = segs[0] ?? "";
    } catch {
      return "";
    }
  }
  // Quitar @ inicial; cortar cualquier resto de query/slash que haya quedado.
  return h.replace(/^@+/, "").split(/[/?#\s]/)[0].trim();
}

export type SocialPlatform = "instagram" | "tiktok" | "twitter" | "x" | "youtube" | "linkedin" | "facebook" | "reddit" | "telegram";

const platformBaseUrls: Record<SocialPlatform, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
  twitter: (h) => `https://x.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  youtube: (h) => `https://youtube.com/@${h}`,
  linkedin: (h) => `https://linkedin.com/in/${h}`,
  facebook: (h) => `https://facebook.com/${h}`,
  reddit: (h) => `https://reddit.com/user/${h}`,
  telegram: (h) => `https://t.me/${h}`,
};

/**
 * Builds the correct social URL for a given platform, cleaning the handle first.
 */
export function buildSocialUrl(platform: SocialPlatform, handle: string | null | undefined): string {
  const clean = cleanHandle(handle);
  if (!clean) return "";
  return platformBaseUrls[platform](clean);
}

/**
 * Returns the handle with a single "@" prefix for UI display.
 */
export function displayHandle(handle: string | null | undefined): string {
  const clean = cleanHandle(handle);
  if (!clean) return "";
  return `@${clean}`;
}
