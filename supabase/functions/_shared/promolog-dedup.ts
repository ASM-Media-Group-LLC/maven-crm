// promolog-dedup.ts — la identidad de una fila de promolog, en un solo lugar.
//
// POR QUÉ EXISTE: promolog reinsertaba todo en cada corrida. La deduplicación era
// de aplicación ("buscá antes de insertar") y encima condicional:
//
//     if (p.permalink) { ...buscar duplicado... }   ← sin permalink NI SE EJECUTA
//
// Los canales privados de Telegram no tienen permalink público → clave nula → el
// chequeo se salteaba y la fila entraba de nuevo. En X era peor: comparaba
// `.eq("story_link_url", null)` y en SQL nada es igual a NULL, así que NUNCA
// encontraba el duplicado. Y aun con la clave bien, dos corridas simultáneas
// pasaban las dos por el "no existe" antes de que ninguna insertara.
//
// Ahora lo impide la BASE: índice único
//     promolog_entries_dedup_uk (tenant_id, creator_id, network, dia, dedup_key)
// Este módulo solo tiene que garantizar lo otro: que el MISMO post produzca la
// MISMA clave venga por donde venga (gateway server-side o agente local).
//
// `dia` entra en la clave a propósito: promolog responde "¿promocionó tal día?",
// así que una historia que cruza la medianoche puede existir en los dos días sin
// que eso sea un conflicto.

/** Hash corto y estable (FNV-1a). Solo desambigua dentro de una creadora+día. */
export function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Clave de un post. Preferimos el permalink porque es la identidad REAL del
 *  mensaje y las dos vías la calculan igual; si no hay, el texto; y si tampoco
 *  (posts de solo imagen), la fecha exacta del post, que también es estable.
 *  Nunca devuelve vacío: una clave nula es una fila que se puede duplicar. */
export function postKey(opts: { permalink?: string | null; text?: string | null; date?: number | string | null; index?: number }): string {
  const link = String(opts.permalink ?? "").trim();
  if (link) return link.slice(0, 400);
  const txt = String(opts.text ?? "").trim();
  if (txt) return `txt:${hash32(txt)}`;
  const d = opts.date != null && opts.date !== "" ? String(opts.date) : null;
  if (d) return `m:${hash32(d)}`;
  return `i:${opts.index ?? 0}`;   // último recurso: la posición en la tanda
}

/** Marcador "revisada · sin actividad": uno por creadora/red/día. */
export const MARKER_KEY = "sinact";

/** ¿El insert falló porque la fila YA estaba? (violación del índice único).
 *  Eso no es un error: es exactamente lo que queremos que pase al reprocesar. */
export function esDuplicado(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return !!e && (e.code === "23505" || /duplicate key value|promolog_entries_dedup_uk/i.test(e.message ?? ""));
}
