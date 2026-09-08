// Órdenes de la PAUSA hacia la llamada de Cowork.
//
// Pedido del jefe (08/09): "cuando le presionen almuerzo, la cámara y todo se
// cancela para que nos diga que sí está en almuerzo". La pausa se marca en la
// página de Cowork, pero la cámara, el micro y la pantalla viven en la llamada,
// que sobrevive a la página (ventanita flotante). Este bus a nivel de módulo
// une las dos cosas sin que se conozcan: la página avisa, la llamada obedece.
//
//   · "apagar"   → la llamada recuerda qué tenía encendido y lo apaga todo.
//   · "reanudar" → vuelve a encender cámara y micro si estaban; la pantalla
//                  compartida NO se puede reabrir sola (el navegador exige un
//                  clic), así que la llamada muestra un botón para retomarla.

export type OrdenDePausa = "apagar" | "reanudar";

const oyentes = new Set<(o: OrdenDePausa) => void>();
let ultima: OrdenDePausa | null = null;

export function suscribirOrdenesDePausa(cb: (o: OrdenDePausa) => void): () => void {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}

function emitir(o: OrdenDePausa): void {
  ultima = o;
  for (const cb of oyentes) {
    try { cb(o); } catch { /* un oyente roto no frena a los demás */ }
  }
}

/** La persona marcó pausa: apagar cámara, micro y pantalla. */
export function pedirApagarPorPausa(): void { emitir("apagar"); }

/** La persona volvió: reencender lo que estaba encendido. */
export function pedirReanudarTrasPausa(): void { emitir("reanudar"); }

/** Para tests y para que la llamada, al montarse, sepa si ya está en pausa. */
export function ultimaOrdenDePausa(): OrdenDePausa | null { return ultima; }
export function olvidarOrdenesDePausa(): void { ultima = null; }
