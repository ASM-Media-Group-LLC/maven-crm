/**
 * Normalizes a social media handle or profile URL to a lowercase username.
 * Supports Instagram, TikTok, Twitter/X, and OnlyFans.
 * Examples:
 *   "@KashCreator"                        → "kashcreator"
 *   "https://instagram.com/KashCreator/"  → "kashcreator"
 *   "https://tiktok.com/@user123"         → "user123"
 *   "https://x.com/someuser"             → "someuser"
 *   "https://onlyfans.com/creator"       → "creator"
 *   "KashCreator"                         → "kashcreator"
 */
export function normalizeHandle(input: string): string {
  if (!input) return "";
  let value = input.trim();

  // Strip common URL prefixes (order: longest first per domain)
  const urlPrefixes = [
    // Instagram
    "https://www.instagram.com/",
    "http://www.instagram.com/",
    "https://instagram.com/",
    "http://instagram.com/",
    "www.instagram.com/",
    "instagram.com/",
    // TikTok
    "https://www.tiktok.com/",
    "http://www.tiktok.com/",
    "https://tiktok.com/",
    "http://tiktok.com/",
    "www.tiktok.com/",
    "tiktok.com/",
    // Twitter / X
    "https://www.twitter.com/",
    "http://www.twitter.com/",
    "https://twitter.com/",
    "http://twitter.com/",
    "www.twitter.com/",
    "twitter.com/",
    "https://www.x.com/",
    "http://www.x.com/",
    "https://x.com/",
    "http://x.com/",
    "www.x.com/",
    "x.com/",
    // OnlyFans
    "https://www.onlyfans.com/",
    "http://www.onlyfans.com/",
    "https://onlyfans.com/",
    "http://onlyfans.com/",
    "www.onlyfans.com/",
    "onlyfans.com/",
  ];
  for (const prefix of urlPrefixes) {
    if (value.toLowerCase().startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }

  // Remove query string, hash, and trailing slash
  value = value.split("?")[0].split("#")[0].replace(/\/+$/, "");

  // Remove leading @
  value = value.replace(/^@+/, "");

  return value.toLowerCase().trim();
}

/**
 * Detects the platform from a URL string.
 * Returns the platform key or null if not detected.
 */
export function detectPlatformFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "twitter";
  if (lower.includes("onlyfans.com")) return "onlyfans";
  return null;
}
