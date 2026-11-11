// COWORK QUE SE QUEDA EN LA RUEDITA (Isabel Tuiran, 11/11/2026).
//
// Isabel salió de su sala a las 10:37 y al volver, a las 10:54, Cowork se quedó
// cargando para siempre: después de las 10:55 su pestaña no volvió a pedir nada
// al servidor y ella quedó fuera de Cowork sin saber por qué. Algún paso de la
// carga (leer la sesión, las salas, unirse a la sala) quedó esperando una
// respuesta que nunca llegó.
//
// Acá: si Cowork lleva ATASCO_MS cargando, se anota EN QUÉ PASO se trabó y se
// recarga la pestaña UNA vez (una recarga limpia destraba lo que haya quedado
// colgado; no hay llamada que cortar, todavía no entró). Si vuelve a pasar en
// los 2 minutos siguientes ya no se recarga sola: queda un botón «Reintentar».
// Al volver a entrar, el paso trabado se manda a llamada_cortes
// (fase 'cowork_atascado') para saber la causa exacta.

export const ATASCO_MS = 20_000;
export const SIN_RECARGAR_OTRA_VEZ_MS = 2 * 60_000;

const CLAVE_ATASCO = "maven.cowork-atasco";
const CLAVE_RECARGA = "maven.cowork-atasco-recarga";

/** Qué hacer cuando Cowork se trabó: recargar sola una vez, o dejar el botón. */
export function queHacerConElAtasco(p: { ultimaRecarga: number | null; ahora: number }): "recargar" | "boton" {
  if (p.ultimaRecarga !== null && p.ahora - p.ultimaRecarga < SIN_RECARGAR_OTRA_VEZ_MS) return "boton";
  return "recargar";
}

export function ultimaRecargaPorAtasco(): number | null {
  try {
    const v = Number(sessionStorage.getItem(CLAVE_RECARGA));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function marcarRecargaPorAtasco(ahora = Date.now()): void {
  try { sessionStorage.setItem(CLAVE_RECARGA, String(ahora)); } catch { /* sin storage */ }
}

export interface Atasco {
  paso: string;
  segundos: number;
  t: number;
}

/** Deja anotado en qué paso se trabó (sobrevive a la recarga). */
export function anotarAtasco(paso: string, segundos: number, ahora = Date.now()): void {
  try { localStorage.setItem(CLAVE_ATASCO, JSON.stringify({ paso, segundos, t: ahora })); } catch { /* sin storage */ }
}

/** El atasco anterior, si hubo (se lee una vez y se borra). */
export function tomarAtascoPrevio(): Atasco | null {
  try {
    const crudo = localStorage.getItem(CLAVE_ATASCO);
    if (!crudo) return null;
    localStorage.removeItem(CLAVE_ATASCO);
    const a = JSON.parse(crudo) as Partial<Atasco>;
    return typeof a.paso === "string" && typeof a.t === "number" ? { paso: a.paso, segundos: Number(a.segundos) || 0, t: a.t } : null;
  } catch {
    return null;
  }
}
