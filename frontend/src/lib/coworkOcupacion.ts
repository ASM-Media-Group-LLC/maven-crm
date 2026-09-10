// Quién está DE VERDAD en una sala de Cowork, y qué reloj mostrarle.
//
// Dos verdades que el tablero mezclaba (Jhon, 10/09/2026):
//
//  · "En PLUS 4 aparece Julián si no está conectado": la tarjeta listaba las
//    ASIGNACIONES activas, y una asignación queda activa aunque la persona
//    cierre la pestaña sin salir. El último latido de Julián era de hacía 12
//    horas. La verdad de quién está conectado la tiene LiveKit, y el monitor de
//    cada sala ya está conectado a ella: se le pregunta a él.
//
//  · "Camila aparece con puntico gris y sin contador": su video se veía y su
//    latido llegaba cada 30 s por HTTP; lo que no llegaba era la PRESENCIA de
//    Realtime, de donde salían el punto y el contador. El latido ya dejó su
//    reloj en la base, así que cuando la presencia falte se lee de ahí.

import type { RelojCowork, EstadoTiempo } from "@/lib/coworkReloj";

/** Un latido más viejo que esto ya no cuenta como "está". */
export const LATIDO_FRESCO_MS = 90_000;

/**
 * Los ids que muestra la tarjeta de una sala.
 * `conectadas === null` = el monitor todavía no sabe (no conectó, o está
 * apagado porque el supervisor entró a esa sala): se muestran las asignadas,
 * que es lo mejor que hay. Con la verdad de LiveKit, solo las que están.
 */
export function personasEnSala(asignadas: string[], conectadas: string[] | null | undefined): string[] {
  if (conectadas == null) return asignadas;
  const set = new Set(conectadas);
  return asignadas.filter((id) => set.has(id));
}

/** Lo que devuelve la RPC `cowork_reloj_de_sala` por persona. */
export interface RelojDeRespaldo {
  seg_activo_hoy: number;
  ultimo_estado: string | null;
  ultimo_latido: string | null;
}

const ESTADOS: ReadonlySet<string> = new Set(["activo", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara", "meet"]);

/**
 * Un reloj para el tablero armado desde la base, con la misma forma que el que
 * viaja por presencia, para que el resto del tablero no distinga de dónde salió.
 * Devuelve null si nunca latió, o si el último latido es viejo: ahí no hay reloj
 * que mostrar, hay una persona que no está.
 */
export function relojDeRespaldo(fila: RelojDeRespaldo | undefined, ahora: number): RelojCowork | null {
  if (!fila?.ultimo_latido || !fila.ultimo_estado || !ESTADOS.has(fila.ultimo_estado)) return null;
  const latido = new Date(fila.ultimo_latido).getTime();
  if (!Number.isFinite(latido) || ahora - latido > LATIDO_FRESCO_MS) return null;
  return {
    estado: fila.ultimo_estado as EstadoTiempo,
    // `seg_activo_hoy` ya cuenta hasta el último latido; `en` marca desde dónde
    // sigue corriendo en pantalla, igual que hace la presencia.
    segundosHoy: Math.max(0, fila.seg_activo_hoy),
    en: latido,
  };
}

/** ¿El latido de esta persona es reciente? Para el punto verde cuando la presencia no llega. */
export function latidoFresco(fila: RelojDeRespaldo | undefined, ahora: number): boolean {
  if (!fila?.ultimo_latido) return false;
  const t = new Date(fila.ultimo_latido).getTime();
  return Number.isFinite(t) && ahora - t <= LATIDO_FRESCO_MS;
}
