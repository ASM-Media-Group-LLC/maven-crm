// Las marcas de "a esta persona ya le avisé", y CADA CUÁNTO se le vuelve a avisar.
//
// Los avisos del hub —cámara, compartir pantalla y pausa excedida— no pueden
// sonar en cada tic: el reloj del dashboard avanza cada segundo y eso sería una
// alarma por segundo por persona. Pero tampoco pueden sonar UNA SOLA VEZ, que
// es lo que hacían hasta ahora.
//
// EL BUG QUE ESTO ARREGLA: la marca era un `Set` — un sí/no. Una vez puesta,
// ese problema no volvía a avisar NUNCA mientras durara, y solo se borraba
// cuando la persona lo corregía o se iba. Alguien tres horas fuera de cuadro se
// anunciaba en el minuto tres y después silencio, con el supervisor creyendo
// que todo estaba en orden.
//
// Y había un agujero peor: la marca se pone ANTES de que suene nada, y ni la
// voz ni la campanita avisan si de verdad sonaron. Si esa única bala salía con
// el audio bloqueado —Chromium exige un gesto del usuario después de cada
// recarga, así que refrescar el tablero a mitad de un episodio lo dispara mudo
// en los primeros segundos— el episodio quedaba marcado y ya no sonaba más en
// todo el turno. Repetir es lo que cierra ese agujero: el próximo intento ya
// encuentra el audio desbloqueado.
//
// Ahora la marca guarda CUÁNDO fue el último aviso, y se repite mientras el
// problema siga.

/** uid → epoch ms del último aviso que se le dio al supervisor por esa persona. */
export type MarcasAviso = Map<string, number>;

/** Cada cuánto se REPITE un aviso del supervisor mientras el problema persista.
 *
 *  Cinco minutos, no los 90-120 s con que se le insiste a la propia persona, y
 *  la diferencia es a propósito: el chatter se vigila a sí mismo —uno— y el
 *  supervisor mira nueve salas, así que acá el ruido se multiplica por la
 *  cantidad de gente en falta. A cinco minutos, una persona en problemas
 *  aparece doce veces por hora: suficiente para que no se olvide, poco para que
 *  el supervisor aprenda a ignorarlo. Si en la práctica queda largo o corto, es
 *  este número el que se toca. */
export const REPETIR_AVISO_SUPERVISOR_MS = 300_000;

/** ¿Toca avisar de esta persona AHORA?
 *
 *  Devuelve true la primera vez, y después solo cuando pasó `cadaMs` desde el
 *  último aviso. Cuando devuelve true DEJA LA MARCA PUESTA — quien la llama no
 *  tiene que acordarse de anotarla, que era justo donde se colaban los errores.
 *
 *  Se llama únicamente cuando el problema ya está confirmado: si se llamara
 *  siempre, movería el reloj de gente que está bien. */
export function tocaAvisar(
  marcas: MarcasAviso,
  uid: string,
  ahora: number,
  cadaMs: number = REPETIR_AVISO_SUPERVISOR_MS,
): boolean {
  const ultimo = marcas.get(uid);
  if (ultimo !== undefined && ahora - ultimo < cadaMs) return false;
  marcas.set(uid, ahora);
  return true;
}

/** Olvida las marcas de quienes ya no están en la sesión.
 *
 *  Se llama en cada tic, antes de decidir a quién avisarle. Es barato —son
 *  unas pocas entradas— y es lo único que rearma el aviso para alguien que se
 *  fue y volvió.
 *
 *  EL BUG QUE ESTO ARREGLA: la marca solo se borraba cuando la persona VOLVÍA a
 *  estar bien. Irse de la sesión no cuenta como volver a estar bien, así que
 *  quien se desconectaba dejaba su marca pegada: al volver con la cámara
 *  apagada, el hub creía que ya le había avisado y se quedaba callado.
 *
 *  Acepta `Set` y `Map` indistintamente: los dos tienen `keys()` y `delete()`,
 *  y así el cambio de Set a Map no obliga a tocar a quien ya lo usaba. */
export function olvidarAusentes(
  marcas: { keys(): Iterable<string>; delete(clave: string): unknown },
  presentes: Record<string, unknown>,
): void {
  for (const uid of [...marcas.keys()]) {
    if (!(uid in presentes)) marcas.delete(uid);
  }
}
