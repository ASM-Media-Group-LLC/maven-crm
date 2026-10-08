// ¿La hora del computador está bien?
//
// El 07/10/2026 un reloj atrasado dos horas y media dejó a una persona sin
// Maven toda la mañana (ver lib/sesionVencida.ts). Eso ya no traba la app,
// pero el reloj igual importa: la sesión, el reloj de Cowork y los horarios
// usan la hora del equipo. Así que se le avisa a la persona para que lo
// corrija.
//
// Contra qué se compara: el header `Date` de NUESTRO servidor (mismo origen).
// El de Supabase no sirve: no lo expone a la página (CORS).

/** Desde cuánto se avisa. Menos que esto no le cambia nada a nadie. */
export const UMBRAL_MS = 5 * 60_000;

/** Si la respuesta tardó más que esto, la medición no es confiable. */
const IDA_Y_VUELTA_MAXIMA_MS = 10_000;

/** Cuánto va mal el reloj del equipo, en ms. Positivo = atrasado (el
 *  servidor va adelante); negativo = adelantado. `antes` y `despues` son el
 *  Date.now() del equipo alrededor del pedido. */
export function desfaseDesdeRespuesta(fechaServidor: string | null, antes: number, despues: number): number | null {
  if (!fechaServidor) return null;
  const servidor = Date.parse(fechaServidor);
  if (Number.isNaN(servidor)) return null;
  // `Date` viene cortado al segundo: en promedio, medio segundo más.
  return servidor + 500 - (antes + despues) / 2;
}

/** Pide la hora a nuestro servidor. null si no se pudo medir bien. */
export async function medirDesfase(fetchFn: typeof fetch = (i, o) => fetch(i, o)): Promise<number | null> {
  const antes = Date.now();
  try {
    const r = await fetchFn("/", { method: "HEAD", cache: "no-store" });
    const despues = Date.now();
    if (despues - antes > IDA_Y_VUELTA_MAXIMA_MS) return null;
    return desfaseDesdeRespuesta(r.headers.get("date"), antes, despues);
  } catch {
    return null;
  }
}

export const relojMal = (desfase: number | null): desfase is number => desfase !== null && Math.abs(desfase) >= UMBRAL_MS;

/** «2 h 30 min», «45 min», «3 h». Redondeado al minuto. */
export function duracionLegible(ms: number): string {
  const minutos = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
