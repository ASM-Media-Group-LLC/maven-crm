/**
 * Normalizes an Instagram handle or profile URL to a lowercase username.
 * Examples:
 *   "@KashCreator"                        → "kashcreator"
 *   "https://instagram.com/KashCreator/"  → "kashcreator"
 *   "KashCreator"                         → "kashcreator"
 */
export function normalizeHandle(input: string): string {
  if (!input) return "";
  let value = input.trim();

  // Strip common URL prefixes
  const urlPrefixes = [
    "https://www.instagram.com/",
    "http://www.instagram.com/",
    "https://instagram.com/",
    "http://instagram.com/",
    "instagram.com/",
    "www.instagram.com/",
  ];
  for (const prefix of urlPrefixes) {
    if (value.toLowerCase().startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }

  // Remove query string and trailing slash
  value = value.split("?")[0].split("#")[0].replace(/\/+$/, "");

  // Remove leading @
  value = value.replace(/^@+/, "");

  return value.toLowerCase().trim();
}
