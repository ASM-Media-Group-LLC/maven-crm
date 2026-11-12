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

// ── Casillas de Zoho en vivo (Alvaro, 11/11/2026: «cuántas cuentas había
// atadas para poder bajar costos») ─────────────────────────────────────────
// Cruza la lista REAL de casillas de Zoho con lo que Maven sabe de cada una.
// Devuelve correos y estados; nunca tokens ni contraseñas.

export type EstadoCasilla = "en_uso" | "sin_uso" | "de_alguien_que_salio" | "sin_cuenta_en_maven";
export interface CasillaDeZoho { email: string; nombre?: string | null }
/** Lo que Maven sabe de una dirección: si la cuenta está viva o en la papelera
 *  y cuándo entró por última vez a Maven (inicio de sesión o correo usado). */
export interface CuentaDeMaven { email: string; viva: boolean; ultimaActividad?: string | null }
export interface CasillaClasificada { email: string; nombre: string | null; estado: EstadoCasilla; ultimaActividad: string | null }

/** Clasifica cada casilla de Zoho. «Sin uso» = cuenta viva que no entra a
 *  Maven hace más de `diasSinUso` días (o nunca). Una dirección que Maven no
 *  conoce es «sin cuenta en Maven» (funcional, del administrador u olvidada). */
export function clasificarCasillas(
  zoho: readonly CasillaDeZoho[],
  maven: readonly CuentaDeMaven[],
  ahora: number,
  diasSinUso = 21,
): { casillas: CasillaClasificada[]; resumen: Record<EstadoCasilla, number> & { total: number } } {
  const porEmail = new Map<string, CuentaDeMaven>();
  for (const c of maven) {
    const k = c.email.trim().toLowerCase();
    const previa = porEmail.get(k);
    // Si la misma dirección aparece dos veces, manda la cuenta viva.
    if (!previa || (!previa.viva && c.viva)) porEmail.set(k, c);
  }
  const tope = ahora - diasSinUso * 86_400_000;
  const resumen = { en_uso: 0, sin_uso: 0, de_alguien_que_salio: 0, sin_cuenta_en_maven: 0, total: 0 };
  const vistas = new Set<string>();
  const casillas: CasillaClasificada[] = [];
  for (const z of zoho) {
    const email = (z.email ?? "").trim().toLowerCase();
    if (!email || vistas.has(email)) continue;
    vistas.add(email);
    const m = porEmail.get(email);
    const ultima = m?.ultimaActividad ?? null;
    const estado: EstadoCasilla = !m ? "sin_cuenta_en_maven"
      : !m.viva ? "de_alguien_que_salio"
      : ultima && Date.parse(ultima) >= tope ? "en_uso" : "sin_uso";
    resumen[estado]++;
    resumen.total++;
    casillas.push({ email, nombre: z.nombre ?? null, estado, ultimaActividad: ultima });
  }
  const rango: Record<EstadoCasilla, number> = { de_alguien_que_salio: 0, sin_uso: 1, sin_cuenta_en_maven: 2, en_uso: 3 };
  casillas.sort((a, b) => rango[a.estado] - rango[b.estado] || a.email.localeCompare(b.email));
  return { casillas, resumen };
}
