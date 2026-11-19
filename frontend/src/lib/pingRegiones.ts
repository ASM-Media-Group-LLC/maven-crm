// ¿QUÉ SERVIDOR DE LLAMADAS QUEDA MÁS CERCA DEL EQUIPO? (Alvaro, 19/11/2026)
//
// Se prueban servidores nuevos (Miami en Vultr, Bogotá en FlowVDS) contra el de
// hoy (St. Louis). Desde la llamada, cada 10 minutos, cada computador mide
// cuánto tarda en ir y volver a cada uno (un GET chiquito a /ping) y lo anota en
// llamada_salud.datos.regiones. Se queda el que gane con números reales.
// Medir jamás rompe la llamada: cualquier falla deja ese servidor en null.

export const REGIONES: Record<string, string> = {
  stl: "https://lk.asmtech.ai/ping",
  mia: "https://45-32-172-118.sslip.io/ping",
};

/** Cada cuántas muestras (una por minuto) se mide. */
export const MEDIR_REGIONES_CADA = 10;

async function unaVez(url: string, ms: number): Promise<number | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const t0 = performance.now();
    const r = await fetch(url, { cache: "no-store", mode: "cors", signal: ctl.signal });
    if (!r.ok) return null;
    await r.text();
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** El mejor de 3 intentos (el primero abre la conexión y no cuenta). */
export async function medirRegion(url: string): Promise<number | null> {
  await unaVez(url, 4000);
  const tiempos: number[] = [];
  for (let i = 0; i < 3; i++) {
    const v = await unaVez(url, 4000);
    if (v !== null) tiempos.push(v);
  }
  return tiempos.length ? Math.min(...tiempos) : null;
}

export async function medirRegiones(regiones: Record<string, string> = REGIONES): Promise<Record<string, number | null>> {
  const salida: Record<string, number | null> = {};
  for (const [k, url] of Object.entries(regiones)) salida[k] = await medirRegion(url);
  return salida;
}
