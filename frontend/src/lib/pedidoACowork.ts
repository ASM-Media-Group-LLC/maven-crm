// PEDIDOS A COWORK desde la tarjeta del turno (19/11/2026). La pausa la abre y
// la cierra Cowork (servidor + apagar cámara y pantalla). Si Cowork está abierto
// atiende el pedido al momento; si no, queda guardado y lo atiende al abrirse.

export type PedidoACowork =
  | { tipo: "pausar"; kind: "bano" | "almuerzo" | "break" }
  | { tipo: "volver" }
  | { tipo: "salida" };

type Oyente = (p: PedidoACowork) => boolean;
const oyentes = new Set<Oyente>();
let pendiente: PedidoACowork | null = null;

/** true si Cowork lo atendió ya; false si quedó guardado para cuando se abra. */
export function pedirACowork(p: PedidoACowork): boolean {
  for (const o of oyentes) if (o(p)) return true;
  pendiente = p.tipo === "salida" ? null : p;
  return false;
}

export function escucharPedidos(o: Oyente): () => void {
  oyentes.add(o);
  if (pendiente && o(pendiente)) pendiente = null;
  return () => { oyentes.delete(o); };
}
