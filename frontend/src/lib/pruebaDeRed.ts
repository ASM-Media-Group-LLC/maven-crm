// PRUEBA DE VELOCIDAD REAL DURANTE LA LLAMADA (Alvaro, 13/11/2026).
//
// Lo que había no medía el internet:
//  · `subida_kbps` de saludDeLlamada es el availableOutgoingBitrate de WebRTC, la
//    estimación del control de congestión. Refleja lo que la llamada está usando
//    (si mandas poco video, estima poco; sin video, inventa números enormes: en
//    producción hay muestras de 1.000.000 kbps), no lo que el internet aguanta.
//  · Las barritas del mosaico son la calidad de la llamada según LiveKit, no la
//    velocidad.
//
// Esto mide de verdad, como un test de velocidad chiquito:
//  1. Calienta la conexión (preflight, TLS, arranque de la función) y mide la
//     latencia con un pedido vacío.
//  2. Baja ~1,5 MB al azar y cronometra lo que llega.
//  3. Sube ~1 MB al azar y cronometra.
// El otro extremo es la edge function `prueba-de-red` (solo con sesión).
//
// Cuándo: al entrar a una sala de Cowork y después cada 30 min mientras dure la
// llamada. Nunca con la pestaña oculta ni con la llamada reconectando (la medida
// saldría mal y estorbaría a la reconexión). El resultado viaja en la muestra de
// llamada_salud (`datos.prueba`) y lo muestra Argos › Llamadas.
//
// Se mide CON la llamada andando: la subida que sale es lo que el internet da
// compitiendo con la propia llamada, que es justo lo que importa para saber si
// la llamada cabe. Cuesta ~2,5 MB cada media hora por persona.

export interface PruebaDeRed {
  /** Mbps de subida medidos; null si esa parte falló. */
  subida_mbps: number | null;
  /** Mbps de bajada medidos; null si esa parte falló. */
  bajada_mbps: number | null;
  /** Latencia (ida y vuelta) al servidor de la prueba, en ms. */
  ms: number | null;
  /** Cuándo se midió (ISO). */
  at: string;
  /** La subida no terminó en el tiempo máximo: la velocidad real es MENOR que subida_mbps. */
  subida_tope?: boolean;
}

export const PRUEBA_CADA_MS = 30 * 60_000;
/** Si la prueba falla (sin red, función caída), se reintenta antes de la media hora. */
export const REINTENTO_TRAS_FALLO_MS = 5 * 60_000;
export const BYTES_BAJADA = 1_500_000;
export const BYTES_SUBIDA = 1_000_000;
export const TIEMPO_MAX_MS = 20_000;

/** En qué salas se prueba: las de Cowork (`cowork_…`, también las reuniones de Cowork). */
export function salaConPrueba(sala: string | null | undefined): boolean {
  return !!sala && sala.startsWith("cowork_");
}

/** ¿Toca probar ahora? Nunca con la pestaña oculta, reconectando o con otra prueba andando. */
export function tocaProbar(p: {
  proximaMs: number | null;
  ahora: number;
  visible: boolean;
  conectada: boolean;
  enCurso: boolean;
}): boolean {
  if (p.enCurso || !p.visible || !p.conectada) return false;
  return p.proximaMs === null || p.ahora >= p.proximaMs;
}

/**
 * Mbps de una transferencia. A lo cronometrado se le descuenta la latencia (el
 * viaje de ida y vuelta que no es transferencia), pero nunca más de la mitad: con
 * un ping ruidoso, descontar de más inflaría la velocidad.
 */
export function mbpsDe(bytes: number, ms: number, latenciaMs: number | null): number | null {
  if (!(bytes > 0) || !(ms > 0)) return null;
  const efectivo = Math.max(ms - Math.max(0, latenciaMs ?? 0), ms / 2);
  return Math.round(((bytes * 8) / (efectivo / 1000) / 1e6) * 100) / 100;
}

function bytesAlAzar(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i += 65_536) crypto.getRandomValues(b.subarray(i, Math.min(i + 65_536, n)));
  return b;
}

interface Opciones {
  /** URL de la función (…/functions/v1/prueba-de-red). */
  url: string;
  /** Authorization y apikey. */
  headers: Record<string, string>;
  fetchFn?: typeof fetch;
  reloj?: () => number;
  tiempoMaxMs?: number;
}

/** Corre la prueba completa. Devuelve null si ni siquiera el ping contestó. */
export async function medirRed(o: Opciones): Promise<PruebaDeRed | null> {
  const f = o.fetchFn ?? fetch;
  const reloj = o.reloj ?? (() => performance.now());
  const tope = o.tiempoMaxMs ?? TIEMPO_MAX_MS;
  const marca = () => `t=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const pedir = async (consulta: string, init: RequestInit = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), tope);
    try {
      return await f(`${o.url}?${consulta}&${marca()}`, { ...init, headers: { ...o.headers, ...(init.headers ?? {}) }, cache: "no-store", signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  // 1) Calentar y medir la latencia. Si esto no contesta, no hay prueba.
  let latencia: number | null = null;
  try {
    const calentar = await pedir("bytes=0");
    if (!calentar.ok) return null;
    const t0 = reloj();
    const ping = await pedir("bytes=0");
    if (ping.ok) latencia = Math.round(reloj() - t0);
  } catch {
    return null;
  }

  // 2) Bajada: se cuentan los bytes que llegan; si se acaba el tiempo, vale lo
  //    que alcanzó a llegar (es una medida real, no un tope).
  let bajada: number | null = null;
  try {
    const ctrl = new AbortController();
    const t0 = reloj();
    const corte = setTimeout(() => ctrl.abort(), tope);
    let recibidos = 0;
    try {
      const r = await f(`${o.url}?bytes=${BYTES_BAJADA}&${marca()}`, { headers: o.headers, cache: "no-store", signal: ctrl.signal });
      if (r.ok && r.body) {
        const lector = r.body.getReader();
        try {
          for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            recibidos += value.byteLength;
          }
        } catch { /* se acabó el tiempo: vale lo recibido */ }
      } else if (r.ok) {
        recibidos = (await r.arrayBuffer()).byteLength;
      }
    } catch { /* abortado antes de empezar a llegar */ }
    clearTimeout(corte);
    bajada = mbpsDe(recibidos, reloj() - t0, latencia);
  } catch { /* sin bajada */ }

  // 3) Subida: fetch no avisa cuánto lleva subido, así que si se acaba el tiempo
  //    lo único cierto es que la velocidad es MENOR que lo que da el tope.
  let subida: number | null = null;
  let subidaTope = false;
  try {
    const cuerpo = bytesAlAzar(BYTES_SUBIDA);
    const t0 = reloj();
    try {
      const r = await pedir("subir=1", { method: "POST", body: cuerpo, headers: { "Content-Type": "application/octet-stream" } });
      if (r.ok) subida = mbpsDe(BYTES_SUBIDA, reloj() - t0, latencia);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        subida = mbpsDe(BYTES_SUBIDA, tope, null);
        subidaTope = true;
      }
    }
  } catch { /* sin subida */ }

  return {
    subida_mbps: subida,
    bajada_mbps: bajada,
    ms: latencia,
    at: new Date().toISOString(),
    ...(subidaTope ? { subida_tope: true } : {}),
  };
}
