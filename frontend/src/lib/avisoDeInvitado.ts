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
 * @param vistas  Lo que ya se conocía. `null` = todavía no miramos nunca.
 * @param actuales Los ids que están esperando ahora.
 * @returns `{ nuevos, vistas }` — `nuevos` es lo que debe sonar.
 */
export function invitadosNuevos(
  vistas: Set<string> | null,
  actuales: string[],
): { nuevos: string[]; vistas: Set<string> } {
  const ahora = new Set(actuales);
  // Primera foto: se guarda y no suena nada.
  if (vistas === null) return { nuevos: [], vistas: ahora };
  return { nuevos: actuales.filter((id) => !vistas.has(id)), vistas: ahora };
}
