// La regla de "¿la copia del micro que ya publiqué en esta sala todavía sirve?".
//
// Vive acá y no dentro del componente por el mismo motivo que
// `debeAvisarSinPantalla`: es UNA regla, la usan varias salas a la vez, y hay
// que poder probarla. Repartida dentro de un `if` era justamente donde estaba
// el agujero.
//
// EL BUG QUE ESTO CIERRA: la condición era "si no hay copia publicada, publica
// una". Eso deja fuera los dos casos que de verdad ocurren:
//
//   1. La copia publicada está MUERTA. Murió con el micrófono del que salió —
//      el supervisor se quitó los auriculares, cambió de dispositivo, u otro
//      programa se quedó con el micro.
//   2. El supervisor volvió a tomar el micrófono, así que la copia vieja ya no
//      corresponde al micro de ahora.
//
// En los dos casos la sala se quedaba muda y el botón seguía en verde. Y no se
// recuperaba: nada volvía a evaluar la condición.

/** Lo mínimo que necesitamos de un MediaStreamTrack. Así la regla se puede
 *  probar sin inventar un navegador entero. */
export interface PistaMinima {
  readyState: string;
}

/**
 * ¿Sirve la copia que ya está publicada en esta sala?
 *
 * Solo si se cumplen las dos cosas: que siga VIVA, y que venga del micrófono
 * que el supervisor está usando AHORA.
 *
 * @param copia          la copia publicada en esta sala (null si no hay)
 * @param baseDeLaCopia  el micro del que salió esa copia
 * @param micActual      el micro que el supervisor tiene capturado ahora
 */
export function copiaSirve(
  copia: PistaMinima | null | undefined,
  baseDeLaCopia: unknown,
  micActual: unknown,
): boolean {
  if (!copia) return false;
  if (copia.readyState !== "live") return false;
  return baseDeLaCopia === micActual;
}
