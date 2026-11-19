// LLAMADAS EN REDES QUE BLOQUEAN UDP (19/11/2026).
//
// MEDIDO con Chrome real: en un wifi corporativo o público que bloquea UDP, la
// llamada no se cae, se pasa sola a TCP (el par ICE elegido queda «tcp» contra
// el puerto 7881 del servidor) y el VIDEO se congela 71 a 110 veces en 5
// minutos (27 a 43 s quieto). El audio, bien. Con red buena: ~2 congelones.
//
// POR QUÉ: WebRTC está hecho para UDP, donde un paquete perdido se salta y el
// siguiente cuadro llega igual. Por TCP, un paquete perdido FRENA todo lo que
// viene detrás hasta que se retransmite (bloqueo de cabeza de fila): el video
// de 1 a 3 Mbps llega a ráfagas, el búfer se vacía y la imagen se queda quieta.
// Además el control de congestión casi no ve pérdidas (TCP las esconde), así que
// no baja la calidad a tiempo. El audio pesa ~30 kbps y pasa entre ráfagas.
// TURN por TLS (aunque sea en el 443) también es TCP: ayuda a CONECTAR en redes
// que solo dejan el 443, pero no quita este bloqueo. Lo que lo quita es mandar
// menos: con poco video, una retransmisión ya no tapa la fila.
//
// QUÉ HACE MAVEN AHORA: mira cada pocos segundos por dónde viaja la llamada
// (getStats: el par de candidatos elegido). Si va por TCP o por un relé TURN
// sobre TCP/TLS:
//   · la cámara propia se publica topada a 360p y ~350 kbps (los mismos topes
//     del perfil liviano, lib/perfilDeCamara.ts), también en Meet y en las
//     llamadas del chat, que normalmente van en HD;
//   · las cámaras ajenas se piden, como mucho, en la capa media (360p).
// Cuando la llamada vuelve a UDP, todo vuelve a como estaba.
//
// ⚠️ Estado de módulo a propósito (como lib/appLiviana.ts): lo escribe el hook
// de la llamada y lo lee la vista para pedir la calidad de los demás, sin
// pasar props por media aplicación. Solo hay una llamada viva por pestaña.

/** Por dónde viaja la llamada, según el par de candidatos ICE elegido. */
export type Transporte = "udp" | "tcp" | "relay-udp" | "relay-tcp" | "relay-tls";

/** Cada cuánto se mira el transporte (barato: un getStats del micrófono). */
export const MIRAR_TRANSPORTE_CADA_MS = 15_000;
/** La primera mirada, apenas conecta: no esperar el minuto de la muestra. */
export const PRIMERA_MIRADA_MS = 3_000;

type Fila = Record<string, unknown> & { type?: string; id?: string };

/**
 * Lee el transporte de un reporte de getStats (de un emisor o un receptor: los
 * dos traen las filas transport, candidate-pair y local-candidate).
 *
 * El par vigente sale de `transport.selectedCandidatePairId`; si el navegador
 * no lo da (Firefox), del par nominado y exitoso. Sin par todavía: null.
 */
export function leerTransporte(filas: Iterable<Fila>): Transporte | null {
  const porId = new Map<string, Fila>();
  let elegido: string | null = null;
  let nominado: string | null = null;
  for (const f of filas) {
    if (typeof f.id === "string") porId.set(f.id, f);
    if (f.type === "transport" && typeof f.selectedCandidatePairId === "string") elegido = f.selectedCandidatePairId;
    if (f.type === "candidate-pair" && (f.selected === true || f.nominated === true) && f.state === "succeeded" && typeof f.id === "string") {
      nominado ??= f.id;
    }
  }
  const par = porId.get(elegido ?? nominado ?? "");
  if (!par) return null;
  const local = typeof par.localCandidateId === "string" ? porId.get(par.localCandidateId) : undefined;
  if (!local) return null;
  const protocolo = typeof local.protocol === "string" ? local.protocol.toLowerCase() : null;
  if (local.candidateType === "relay") {
    const rp = typeof local.relayProtocol === "string" ? local.relayProtocol.toLowerCase() : null;
    if (rp === "tls") return "relay-tls";
    if (rp === "tcp") return "relay-tcp";
    return "relay-udp";
  }
  if (protocolo === "tcp") return "tcp";
  if (protocolo === "udp") return "udp";
  return null;
}

/** ¿Este transporte sufre el bloqueo de cabeza de fila? Todo lo que va por TCP. */
export function esRedBloqueada(t: Transporte | null): boolean {
  return t === "tcp" || t === "relay-tcp" || t === "relay-tls";
}

let transporteActual: Transporte | null = null;

/** Lo anota el hook de la llamada. Devuelve si cambió «bloqueada sí/no». */
export function anotarTransporte(t: Transporte | null): boolean {
  const antes = esRedBloqueada(transporteActual);
  transporteActual = t;
  return antes !== esRedBloqueada(t);
}

export function transporteDeLaLlamada(): Transporte | null {
  return transporteActual;
}

/** ¿La llamada vigente va por TCP? Entonces el video se pide y se manda chico. */
export function porRedBloqueada(): boolean {
  return esRedBloqueada(transporteActual);
}
