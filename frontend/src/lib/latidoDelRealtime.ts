/**
 * EL LATIDO DEL SOCKET DE REALTIME.
 *
 * Simulacro v2 (19/11/2026, 100 personas en 4 países): el 99,7 % de los
 * mensajes llegó en vivo (mediana 0,45 s), pero 1 de cada 20 llegaba ~40 s
 * tarde. Era el socket muerto en silencio: el servidor deja de contestar, pero
 * el navegador no se entera (no hay CLOSED). realtime-js solo lo descubre con el
 * latido: manda uno cada 25 s y, si al siguiente todavía no hubo respuesta,
 * recién ahí cierra y reconecta. Entre 25 y 50 s ciegos, más la reconexión y la
 * recarga: los ~40 s. Mientras tanto la salud del chat seguía en "en-vivo" y el
 * repaso rápido de la conversación no se encendía.
 *
 * Ahora:
 *  - el latido sale cada 10 s (un mensajito por pestaña; el socket muerto se
 *    descubre en 10–20 s en vez de 25–50 s);
 *  - si un latido no tiene respuesta en 3 s, el socket ya se da por dudoso y la
 *    salud del chat pasa a "reconectando": el repaso de la conversación abierta
 *    arranca al toque, sin esperar a que realtime-js lo declare muerto;
 *  - con la primera respuesta "ok" se vuelve a confiar.
 *
 * Vive aparte (sin importar el cliente) porque lo usan los dos lados: el cliente
 * de Supabase le pasa los latidos y canalDelChat lo lee para la salud.
 */

/** Cada cuánto late el socket de realtime (realtime-js trae 25 s). */
export const LATIDO_REALTIME_MS = 10_000;

/** Sin respuesta a un latido en este tiempo, el socket se trata como caído. */
export const LATIDO_SIN_RESPUESTA_MS = 3_000;

let sinLatido = false;
let espera: ReturnType<typeof setTimeout> | null = null;
const oyentes = new Set<() => void>();

function marcar(valor: boolean): void {
  if (sinLatido === valor) return;
  sinLatido = valor;
  for (const avisar of Array.from(oyentes)) {
    try {
      avisar();
    } catch (err) {
      console.error("[latidoDelRealtime] un oyente falló:", err);
    }
  }
}

/** Lo llama realtime-js con cada latido: "sent", "ok", "error", "timeout", "disconnected". */
export function alLatidoDelSocket(estado: string): void {
  if (estado === "sent") {
    if (!espera) {
      espera = setTimeout(() => {
        espera = null;
        marcar(true);
      }, LATIDO_SIN_RESPUESTA_MS);
    }
    return;
  }
  if (espera) {
    clearTimeout(espera);
    espera = null;
  }
  marcar(estado !== "ok");
}

/** true mientras el socket no contesta los latidos. */
export function socketSinLatido(): boolean {
  return sinLatido;
}

export function escucharLatido(avisar: () => void): () => void {
  oyentes.add(avisar);
  return () => void oyentes.delete(avisar);
}
