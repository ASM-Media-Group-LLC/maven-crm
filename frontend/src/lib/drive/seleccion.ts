// Elegir varios en el Drive, como Google (María Villegas, 02/10): la casilla
// de cada fila, Shift para un tramo, Ctrl/⌘ para sumar o sacar uno. Aparte de
// la página para poder probarlo sin dibujarla.
import type { TranslationKey } from "@/lib/i18n";

export interface EstadoSeleccion {
  ids: ReadonlySet<string>;
  /** Desde dónde se cuenta un tramo con Shift: la última fila que se tocó. */
  ancla: string | null;
}

export const SIN_SELECCION: EstadoSeleccion = { ids: new Set(), ancla: null };

/**
 * Un clic que elige (en la casilla, o en la fila con Shift o Ctrl/⌘).
 *  - Shift: suma el tramo entre el ancla y esta fila (el ancla no se mueve,
 *    como en Gmail y Drive: otro Shift-clic cuenta desde el mismo lugar).
 *  - Si no: prende o apaga esta fila, y el ancla pasa a ser ella.
 * `orden`: los ids en el orden en que se ven.
 */
export function clicDeSeleccion(estado: EstadoSeleccion, orden: readonly string[], id: string, shift: boolean): EstadoSeleccion {
  const ids = new Set(estado.ids);
  if (shift && estado.ancla && estado.ancla !== id) {
    const a = orden.indexOf(estado.ancla);
    const b = orden.indexOf(id);
    if (a >= 0 && b >= 0) {
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ids.add(orden[i]);
      return { ids, ancla: estado.ancla };
    }
  }
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, ancla: id };
}

/** La casilla de arriba: si están todas, ninguna; si no, todas. */
export function alternarTodas(estado: EstadoSeleccion, orden: readonly string[]): EstadoSeleccion {
  const todas = orden.length > 0 && orden.every((id) => estado.ids.has(id));
  return todas ? SIN_SELECCION : { ids: new Set(orden), ancla: estado.ancla };
}

// ── Mover: qué salió mal, para decirlo claro ────────────────────────────────
// Los mensajes del trigger drive_items_cuidar vienen en español y sin traducir;
// la pantalla los dice con t() en el idioma de la persona.

export type MotivoDeMover =
  | "sin_permiso" // la RLS no dejó tocar la ficha (no es dueño ni editor)
  | "destino_sin_permiso" // no puede guardar en la carpeta de destino
  | "dentro_de_si_misma" // una carpeta adentro de una de sus subcarpetas
  | "destino_no_existe"
  | "muy_grande" // ⚠️ statement timeout: el subárbol es enorme (ver abajo)
  | "otro";

/**
 * ⚠️ Mover una carpeta adentro o afuera de una unidad compartida reescribe la
 * unidad de TODO lo de adentro (trigger drive_unidad_al_subarbol). Con una
 * carpeta importada de Google con decenas de miles de archivos, eso puede
 * pasar el tiempo máximo de la base (57014) y la base deshace el movimiento.
 */
export function motivoDelError(e: unknown): MotivoDeMover {
  const err = (e ?? {}) as { code?: string; message?: string };
  const msg = String(err.message ?? "");
  if (err.code === "57014" || /statement timeout|canceling statement/i.test(msg)) return "muy_grande";
  if (/guardar en esa carpeta/i.test(msg)) return "destino_sin_permiso";
  if (/dentro de s[ií] misma/i.test(msg)) return "dentro_de_si_misma";
  if (/carpeta de destino no existe/i.test(msg)) return "destino_no_existe";
  if (err.code === "42501" || /row-level security/i.test(msg)) return "sin_permiso";
  return "otro";
}

/** Qué decir de cada motivo, con t() (los mensajes del trigger no pasan por t()). */
export const MOTIVOS_MOVER: Record<MotivoDeMover, TranslationKey> = {
  sin_permiso: "drive.mover.motivo.sin_permiso",
  destino_sin_permiso: "drive.mover.motivo.destino_sin_permiso",
  dentro_de_si_misma: "drive.mover.motivo.dentro_de_si_misma",
  destino_no_existe: "drive.mover.motivo.destino_no_existe",
  muy_grande: "drive.mover.motivo.muy_grande",
  otro: "drive.mover.motivo.otro",
};

/** Los errores que son del DESTINO y no de cada ficha: si uno falla así,
 *  fallan todos igual y no tiene sentido probar de a una. */
export const esDelDestino = (m: MotivoDeMover) => m === "destino_sin_permiso" || m === "destino_no_existe";

/** Para «Deshacer»: lo movido, agrupado por la carpeta donde estaba. */
export function agruparPorCarpetaAnterior(movidos: readonly { id: string; antes: string | null }[]): Map<string | null, string[]> {
  const grupos = new Map<string | null, string[]>();
  for (const m of movidos) grupos.set(m.antes, [...(grupos.get(m.antes) ?? []), m.id]);
  return grupos;
}
