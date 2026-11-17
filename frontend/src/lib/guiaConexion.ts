// GUÍA DE CONEXIÓN (Alvaro, 17/11/2026).
//
// La gente se cae de las llamadas por internet inestable (Wi-Fi) y no por
// internet lento: 12 de 42 personas tuvieron la llamada frenada por su internet
// más del 20 % del tiempo, con una subida mediana de 13 Mbps. La página
// /conexion (pages/conexion/GuiaConexionPage.tsx) deja que cada uno pruebe su
// internet con la MISMA prueba que corre Cowork (lib/pruebaDeRed.ts → la edge
// `prueba-de-red`) y le dice, con un semáforo, si le alcanza para la llamada.
//
// El aviso de «internet débil» de la llamada enlaza aquí: importa
// RUTA_GUIA_CONEXION en vez de escribir la ruta a mano.

import type { PruebaDeRed } from "@/lib/pruebaDeRed";
import { SUBIDA_PARA_CAMARA_NORMAL_MBPS } from "@/lib/perfilDeCamara";

/** La ruta de la guía. Úsala para enlazar desde avisos y carteles. */
export const RUTA_GUIA_CONEXION = "/conexion";

export type Semaforo = "bien" | "justo" | "malo";

// Los cortes salen de lo que la llamada pide y de lo medido en producción
// (946 pruebas de llamada_salud al 17/11/2026):
//
// SUBIDA (lo que mandas: cámara y pantalla). Debajo de 1,5 Mbps la llamada ya
// baja tu cámara a liviano y prende el modo ahorro (perfilDeCamara, modoAhorro).
// Cámara + pantalla en calidad normal piden hasta ~2,3 Mbps: con 3 hay aire.
/** Debajo de esto la subida es mala: la llamada recorta tu cámara y tu pantalla. */
export const SUBIDA_MALA_MBPS = SUBIDA_PARA_CAMARA_NORMAL_MBPS;
/** Desde esto la subida está bien: cámara y pantalla caben con aire. */
export const SUBIDA_BIEN_MBPS = 3;

// BAJADA (lo que recibes: las voces y las cámaras del equipo). Debajo de 5 Mbps
// ver varias pantallas a la vez se traba (el mismo corte de Argos › Llamadas).
export const BAJADA_MALA_MBPS = 5;
export const BAJADA_BIEN_MBPS = 10;

// RESPUESTA (ida y vuelta al servidor de la prueba, que es una edge function:
// incluye su propio trabajo, no es el ping de un juego). En producción la
// mediana es 323 ms y el 90 % queda por debajo de 605 ms; más de 800 ms solo le
// pasa al 6 % y ahí la llamada se siente con retraso.
export const RESPUESTA_BIEN_MS = 500;
export const RESPUESTA_MALA_MS = 800;

/** Semáforo de la subida. `tope`: la subida no terminó a tiempo (la real es menor). */
export function semaforoSubida(mbps: number | null, tope = false): Semaforo | null {
  if (mbps === null || !Number.isFinite(mbps)) return null;
  if (tope || mbps < SUBIDA_MALA_MBPS) return "malo";
  return mbps < SUBIDA_BIEN_MBPS ? "justo" : "bien";
}

export function semaforoBajada(mbps: number | null): Semaforo | null {
  if (mbps === null || !Number.isFinite(mbps)) return null;
  if (mbps < BAJADA_MALA_MBPS) return "malo";
  return mbps < BAJADA_BIEN_MBPS ? "justo" : "bien";
}

export function semaforoRespuesta(ms: number | null): Semaforo | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  if (ms >= RESPUESTA_MALA_MS) return "malo";
  return ms >= RESPUESTA_BIEN_MS ? "justo" : "bien";
}

/**
 * El veredicto de toda la prueba: manda la peor de las tres. Sin subida medida
 * no se puede decir que la llamada cabe (es la que más pesa), así que, salvo
 * que otra ya salga mala, el veredicto queda en `null` = prueba incompleta.
 */
export function veredictoDePrueba(p: PruebaDeRed): Semaforo | null {
  const subida = semaforoSubida(p.subida_mbps, p.subida_tope === true);
  const tonos = [subida, semaforoBajada(p.bajada_mbps), semaforoRespuesta(p.ms)];
  if (tonos.includes("malo")) return "malo";
  if (subida === null) return null;
  return tonos.includes("justo") ? "justo" : "bien";
}

/** Cuántos de los tres tramos de la barrita se encienden. */
export const TRAMOS_DEL_SEMAFORO: Record<Semaforo, number> = { malo: 1, justo: 2, bien: 3 };
