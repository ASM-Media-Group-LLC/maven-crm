// EL MEDIDOR DE LA APP: INTERNET, COMPUTADOR Y MEMORIA (Alvaro, 18/11/2026).
// Lo puro: de una muestra a un semáforo por cosa y el consejo para la persona.
// Ver hooks/useMedidorEquipo.ts y components/MedidorEquipo.tsx.

export type Luz = "verde" | "amarillo" | "rojo" | "sin_dato";

export interface MuestraDelEquipo {
  en_linea: boolean;
  /** Ida y vuelta a Maven, en ms (medido con un pedido chiquito). */
  ping_ms: number | null;
  /** Lo que el navegador estima de bajada (navigator.connection), Mbps. */
  bajada_mbps: number | null;
  equipo_gb: number | null;
  libre_gb: number | null;
  app_mb: number | null;
  cpu_equipo_pct: number | null;
  cpu_app_pct: number | null;
  mac: boolean;
}

export interface Semaforo { internet: Luz; computador: Luz; memoria: Luz }

export function luzInternet(m: Pick<MuestraDelEquipo, "en_linea" | "ping_ms" | "bajada_mbps">): Luz {
  if (!m.en_linea) return "rojo";
  if (m.ping_ms == null && m.bajada_mbps == null) return "sin_dato";
  // Manda el tiempo de respuesta (medido de verdad). La bajada es lo que estima
  // el navegador (redondeada y muchas veces por lo bajo): solo pone amarillo
  // cuando es muy baja, nunca rojo.
  if ((m.ping_ms ?? 0) >= 600) return "rojo";
  if ((m.ping_ms ?? 0) >= 250 || (m.bajada_mbps != null && m.bajada_mbps < 1)) return "amarillo";
  return "verde";
}

export function luzComputador(m: Pick<MuestraDelEquipo, "cpu_equipo_pct">): Luz {
  if (m.cpu_equipo_pct == null) return "sin_dato";
  if (m.cpu_equipo_pct >= 90) return "rojo";
  if (m.cpu_equipo_pct >= 75) return "amarillo";
  return "verde";
}

/** En Mac el sistema usa la memoria «libre» como caché y casi siempre marca poca:
 *  allá solo se pone en rojo cuando de verdad no queda nada. */
export function luzMemoria(m: Pick<MuestraDelEquipo, "libre_gb" | "equipo_gb" | "mac">): Luz {
  if (m.libre_gb == null || !m.equipo_gb) return "sin_dato";
  const rojo = m.mac ? 0.1 : Math.max(0.5, m.equipo_gb * 0.07);
  const amarillo = m.mac ? 0.25 : Math.max(1, m.equipo_gb * 0.15);
  if (m.libre_gb < rojo) return "rojo";
  if (m.libre_gb < amarillo) return "amarillo";
  return "verde";
}

export const semaforo = (m: MuestraDelEquipo): Semaforo => ({
  internet: luzInternet(m), computador: luzComputador(m), memoria: luzMemoria(m),
});

/** El peor de los tres (para el puntito resumen). */
export function peorLuz(s: Semaforo): Luz {
  const orden: Luz[] = ["rojo", "amarillo", "verde", "sin_dato"];
  for (const l of orden) if (s.internet === l || s.computador === l || s.memoria === l) return l;
  return "sin_dato";
}

export type Cosa = keyof Semaforo;
export const AVISO_CADA_MS = 30 * 60 * 1000;

/** ¿Toca avisarle a la persona? Solo si está en rojo en DOS muestras seguidas
 *  (un pico no cuenta) y no se le avisó de eso en los últimos 30 minutos. */
export function tocaAvisar(cosa: Cosa, actual: Semaforo, anterior: Semaforo | null, ultimoAviso: number | undefined, ahora: number): boolean {
  if (actual[cosa] !== "rojo" || anterior?.[cosa] !== "rojo") return false;
  return ultimoAviso == null || ahora - ultimoAviso >= AVISO_CADA_MS;
}
