// Helpers centrales de avatar — ÚNICA fuente para iniciales y muñequitos.
// Antes había al menos 6 variantes de `initials()` copiadas por el codebase;
// esta es la versión más completa (portada de WaContactAvatar) y es la que
// debe usarse en adelante. El muñequito es un SVG determinista de DiceBear
// generado en el cliente: mismo seed → mismo dibujo, sin llamadas externas.
import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";

export function initials(name: string | null | undefined): string {
  const s = (name || "").replace(/^@/, "").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? s[0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Cache en memoria: el data-URI de un seed no cambia nunca dentro de la sesión
// y generarlo tiene costo (serializa un SVG completo).
const diceCache = new Map<string, string>();

export function dicebearUri(seed: string): string {
  const hit = diceCache.get(seed);
  if (hit) return hit;
  const uri = createAvatar(adventurer, {
    seed,
    // Sin fondo propio: el círculo del avatar pone el suyo y así el muñequito
    // se ve igual sobre cualquier superficie (sidebar, cards, chat).
    backgroundColor: [],
  }).toDataUri();
  diceCache.set(seed, uri);
  return uri;
}
