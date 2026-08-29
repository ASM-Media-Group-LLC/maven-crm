// Helpers centrales de avatar — ÚNICA fuente para iniciales y muñequitos.
// Antes había al menos 6 variantes de `initials()` copiadas por el codebase;
// esta es la versión más completa (portada de WaContactAvatar) y es la que
// debe usarse en adelante. El muñequito es un SVG determinista de DiceBear
// generado en el cliente: mismo seed → mismo dibujo, sin llamadas externas.
import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";

/** La primera LETRA (o dígito) de un texto, salteando emojis y símbolos.
 *
 *  Dos motivos, y los dos se veían en pantalla:
 *
 *  1. Indexar con `[0]` no devuelve el primer carácter: devuelve la primera
 *     unidad de 16 bits. Un nombre que empieza con emoji quedaba cortado por la
 *     mitad y se dibujaba el cuadradito de carácter inválido. Recorrer el string
 *     con `for..of` sí itera por código de punto.
 *
 *  2. Aunque el emoji llegara entero, una banderita no es una inicial. Si
 *     alguien se llama "🏳 Jhon Lopez", lo útil es "JL". */
function primeraLetra(texto: string): string {
  for (const ch of texto) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch;
  }
  return "";
}

export function initials(name: string | null | undefined): string {
  const s = (name || "").replace(/^@/, "").trim();
  if (!s) return "?";
  // Se descartan las partes SIN letras. Si no, un nombre como "🏳 Jhon Lopez"
  // trata al emoji como si fuera el nombre de pila, se queda sin inicial y
  // devuelve solo "L". La banderita no es una palabra.
  const parts = s.split(/[\s._-]+/).filter((t) => primeraLetra(t) !== "");
  const first = primeraLetra(parts[0] ?? s);
  const last = parts.length > 1 ? primeraLetra(parts[parts.length - 1]) : "";
  const iniciales = (first + last).toUpperCase();
  // Un nombre hecho solo de emojis o signos no tiene inicial que mostrar.
  return iniciales || "?";
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
