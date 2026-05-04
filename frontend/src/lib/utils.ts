import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Removes all leading "@" from a handle and extracts username from full URLs.
 */
export function cleanHandle(handle: string | null | undefined): string {
  if (!handle) return "";
  let h = handle.trim();
  // If it's a full URL, extract the last path segment
  if (h.startsWith("http")) {
    try {
      const url = new URL(h);
      h = url.pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      return "";
    }
  }
  // Strip all leading "@"
  return h.replace(/^@+/, "");
}

type SocialPlatform = "instagram" | "tiktok" | "twitter" | "x" | "youtube" | "linkedin";

const platformBaseUrls: Record<SocialPlatform, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
  twitter: (h) => `https://x.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  youtube: (h) => `https://youtube.com/@${h}`,
  linkedin: (h) => `https://linkedin.com/in/${h}`,
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
