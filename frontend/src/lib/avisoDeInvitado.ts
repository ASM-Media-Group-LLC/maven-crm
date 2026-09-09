// Quién de los que están golpeando la puerta es NUEVO desde la última mirada.
//
// El panel de invitados de Meet no recibe "llegó uno": recarga la lista entera,
// por realtime y además cada 5 s de respaldo. Sin esta cuenta, sonar en cada
// recarga sería un timbre cada 5 segundos mientras alguien espera.
//
// La primera mirada NO cuenta como novedad (devuelve la lista vacía): entrar a
// la reunión y que suene de golpe por gente que ya estaba golpeando —y que se
// ve en el panel apenas entrás— es ruido, no aviso. Mismo criterio que el aviso
// de manos levantadas de Cowork.

/**
 * @param vistas  Lo que ya se conocía.
 * @param actuales Los ids que están esperando ahora.
 * @param esPrimeraMirada Si esta consulta es la primera. ⚠️ Lo decide quien
 *   EMPIEZA primero, no quien termina primero: el panel dispara una consulta al
 *   montarse y enseguida se suscribe al realtime, y si una respuesta se
 *   adelantaba se declaraba "la primera", no sonaba, y ese invitado no hacía
 *   sonar nada NUNCA. Por eso el que llama reclama el turno antes del await.
 * @returns `{ nuevos, vistas }` — `nuevos` es lo que debe sonar.
 */
export function invitadosNuevos(
  vistas: Set<string>,
  actuales: string[],
  esPrimeraMirada: boolean,
): { nuevos: string[]; vistas: Set<string> } {
  const ahora = new Set(actuales);
  // Primera foto: se guarda y no suena nada.
  if (esPrimeraMirada) return { nuevos: [], vistas: ahora };
  return { nuevos: actuales.filter((id) => !vistas.has(id)), vistas: ahora };
}
