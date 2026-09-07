/**
 * Saca de una lista a las cuentas que están en la papelera.
 *
 * La regla de todo el sistema de bajas: una cuenta eliminada sigue resolviendo
 * nombre y foto en el HISTORIAL —sus mensajes viejos no quedan huérfanos, como
 * en Gmail— pero no se puede ELEGIR para algo nuevo. Así que el mapa de perfiles
 * se queda completo y filtran los selectores: chat nuevo, agregar a un grupo,
 * buscar gente, vincular un número de WhatsApp.
 *
 * Vive en su propio archivo para que sea una sola regla y no cinco `.filter()`
 * que se van desincronizando.
 */
export function sinCuentasEliminadas<T extends { deleted_at?: string | null }>(gente: T[]): T[] {
  return gente.filter((p) => !p.deleted_at);
}
