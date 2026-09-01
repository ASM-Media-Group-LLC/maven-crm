// El piso de ruido de la puerta del noise cancellation — la versión TESTEADA.
//
// ⚠️ PORT FIEL: esta misma regla vive copiada en
// `public/worklets/noise-suppression-worklet.js` (un AudioWorklet no puede
// importar módulos de la app). Si cambias algo acá, cámbialo allá — y al revés.
// Este archivo existe para poder fijar el comportamiento con tests, igual que
// se hizo con promoScore y los clasificadores.
//
// ── EL BUG QUE ESTO ARREGLA (01/09/2026) ────────────────────────────────────
//
// El piso solo se adaptaba HACIA ABAJO: se actualizaba únicamente cuando el
// ambiente estaba por debajo del umbral (rms < umbral*0.7). Si el ruido de
// fondo SUBÍA — prende un ventilador, ruido de calle — el piso nunca se
// enteraba: el umbral quedaba viejo, la puerta se quedaba abierta para siempre
// y el gate dejaba de hacer nada por el resto de la llamada.
//
// ── CÓMO SUBE SIN TAPAR LA VOZ ──────────────────────────────────────────────
//
// Con un SEGUIDOR DE MÍNIMOS (minimum statistics, el truco clásico de los
// estimadores de ruido): baja al instante, sube MUY lento (~15 s de constante).
//   · El habla es a RÁFAGAS: las pausas entre frases y palabras tiran el
//     seguidor abajo una y otra vez → la propia voz no puede inflar el piso.
//   · Un ventilador es CONSTANTE: no hay pausas que lo bajen, así que el
//     seguidor sube hasta el nivel del ruido y el piso lo sigue.

export const PISO_MINIMO = 0.00008;
export const RATIO_PUERTA = 2.0;
export const ADAPTACION_BAJADA = 0.997;
/** Constante de tiempo de SUBIDA del seguidor de mínimos, en segundos. */
export const SEGUNDOS_SUBIDA = 15;

export interface EstadoPiso {
  /** El piso de ruido vigente (lo que define el umbral de la puerta). */
  piso: number;
  /** El seguidor de mínimos: baja al instante, sube lento. */
  minimo: number;
}

/** Coeficiente de subida para un frame de `n` muestras a `sampleRate` Hz. */
export function coeficienteSubida(n: number, sampleRate: number): number {
  return 1 - Math.exp(-n / (SEGUNDOS_SUBIDA * sampleRate));
}

/**
 * Actualiza el piso con el RMS de un frame. Puro: mismo input, mismo output.
 * El orden importa y es el del worklet: seguidor → adaptación bajada → subida.
 */
export function actualizarPiso(estado: EstadoPiso, rms: number, coefSubida: number): EstadoPiso {
  let { piso, minimo } = estado;

  // Seguidor de mínimos: baja al instante, sube lento.
  minimo = rms < minimo ? rms : minimo + coefSubida * (rms - minimo);

  // Hacia abajo, como siempre: en los momentos quietos el piso persigue al
  // ambiente rápido (a la baja no hay riesgo de taparse a uno mismo).
  const umbral = piso * RATIO_PUERTA;
  if (rms < umbral * 0.7) {
    piso = Math.max(ADAPTACION_BAJADA * piso + (1 - ADAPTACION_BAJADA) * rms, PISO_MINIMO);
  }

  // Hacia ARRIBA, acotado por el seguidor: el piso nunca sube más rápido que
  // él, así que solo un ruido sostenido (sin pausas) puede levantarlo.
  if (minimo > piso) piso = minimo;

  return { piso, minimo };
}
