// Los chatters entre sí (Alvaro, 18/11/2026): cuando un chatter llama a su grupo
// o suma gente a una llamada, a los otros chatters no les suena. El 1 a 1 de
// siempre (quien llama y quien recibe) sí suena. La base ya frena la fila
// (call_participants_contacto); esto es la segunda red para el push.

/** Quita de `destinos` a los restringidos, salvo a los de `siempre` (el 1 a 1).
 *  Si la consulta falló (`null`), no quita a nadie: la base es la pared. */
export function sinRestringidos(destinos: string[], restringidos: string[] | null, siempre: string[] = []): string[] {
  if (!restringidos || !restringidos.length) return destinos;
  const fuera = new Set(restringidos);
  for (const s of siempre) fuera.delete(s);
  return destinos.filter((d) => !fuera.has(d));
}
