// EL AVISO DE VERSIÓN NUEVA, CON LLAMADA (17/11/2026).
//
// Con una llamada andando Maven no se recarga solo (registroDelSw.ts): la
// pestaña sigue con la versión que tiene y el arreglo no le llega hasta que
// recargue. Pero el aviso era el mismo de siempre, «Nueva versión · Recargar»:
// quien lo tocaba en medio de Cowork cortaba su propia llamada, y quien no lo
// tocaba seguía días con el código viejo (los arreglos de caídas no le llegaban).
//
// Ahora, con llamada, el aviso dice «recarga cuando termines» y NO trae botón.
// En cuanto la llamada termina, pasa al aviso de siempre, con su botón.

export interface OpcionesDelAviso {
  /** ¿Hay una llamada conectada (o entrando) en esta pestaña? */
  enLlamada: () => boolean;
  /** El aviso sin botón: «recarga cuando termines». */
  mostrarEnLlamada: () => void;
  /** El aviso de siempre, con «Recargar». */
  mostrarNormal: () => void;
  /** Cada cuánto se mira si la llamada terminó. */
  cadaMs?: number;
  programar?: (fn: () => void, ms: number) => number;
  cancelar?: (id: number) => void;
}

export const MIRAR_LLAMADA_CADA_MS = 5_000;

/** Devuelve `avisar()`: muestra el aviso que corresponde y, si hay llamada,
 *  espera a que termine para cambiarlo por el de siempre. Idempotente. */
export function crearAvisoDeVersion(o: OpcionesDelAviso): () => void {
  const cada = o.cadaMs ?? MIRAR_LLAMADA_CADA_MS;
  const programar = o.programar ?? ((fn, ms) => window.setInterval(fn, ms));
  const cancelar = o.cancelar ?? ((id) => window.clearInterval(id));
  let mirando: number | null = null;
  return () => {
    if (!o.enLlamada()) {
      if (mirando !== null) { cancelar(mirando); mirando = null; }
      o.mostrarNormal();
      return;
    }
    o.mostrarEnLlamada();
    if (mirando !== null) return;
    mirando = programar(() => {
      if (o.enLlamada()) return;
      if (mirando !== null) { cancelar(mirando); mirando = null; }
      o.mostrarNormal();
    }, cada);
  };
}
