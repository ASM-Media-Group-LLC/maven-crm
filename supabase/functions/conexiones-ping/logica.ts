// Reglas puras de conexiones-ping (con tests en logica.test.ts).

export type EstadoConexion = "ok" | "mal" | "sin_configurar";
export interface Chequeo { id: string; estado: EstadoConexion; ms: number | null; detalle: string }

/** El veredicto de un chequeo HTTP. `vale` dice qué códigos cuentan como vivo
 *  (por defecto 2xx). Sin respuesta (timeout, DNS, conexión rechazada) = mal. */
export function veredicto(
  id: string,
  r: { status: number | null; ms: number | null; error?: string },
  detalleOk: string,
  vale: (s: number) => boolean = (s) => s >= 200 && s < 300,
): Chequeo {
  if (r.status === null) return { id, estado: "mal", ms: r.ms, detalle: `No responde: ${r.error ?? "sin respuesta"}` };
  if (!vale(r.status)) {
    const porQue = r.status === 401 || r.status === 403 ? "la llave no sirve (vencida o borrada)"
      : r.status === 402 || r.status === 429 ? "sin saldo o sin cupo"
      : r.status >= 500 ? "el servicio está caído" : "respuesta inesperada";
    return { id, estado: "mal", ms: r.ms, detalle: `Error ${r.status}: ${porQue}` };
  }
  return { id, estado: "ok", ms: r.ms, detalle: detalleOk };
}

export const sinConfigurar = (id: string, falta: string): Chequeo =>
  ({ id, estado: "sin_configurar", ms: null, detalle: `Falta ${falta} en Supabase` });

/** wss://host → https://host (LiveKit contesta HTTP en el mismo host). */
export const httpDeWs = (url: string) => url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

/** «138 de 302.761» con separador de miles a la colombiana. */
export const miles = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
