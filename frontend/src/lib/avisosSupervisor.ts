// Las marcas de "a esta persona ya le avisé".
//
// Los avisos del hub —cámara y compartir pantalla— suenan UNA vez por persona y
// por episodio. Sin esa marca, un chatter que lleva media hora fuera de cuadro
// haría sonar la alerta cada segundo y el supervisor la silenciaría a los dos
// minutos, que es la peor forma de perder una alerta: sigue existiendo y ya no
// la escucha nadie.
//
// EL BUG QUE ESTO ARREGLA: la marca se borraba solo cuando la persona VOLVÍA a
// estar bien. Irse de la sesión no cuenta como volver a estar bien, así que
// quien se desconectaba dejaba su marca pegada para siempre: al volver con la
// cámara apagada, el hub creía que ya le había avisado y se quedaba callado.
//
// Se veía como "el aviso dejó de andar", y era peor que eso: andaba una sola
// vez por persona y por turno.

/** Olvida las marcas de quienes ya no están en la sesión.
 *
 *  Se llama en cada tic, antes de decidir a quién avisarle. Es barato —son
 *  unas pocas entradas— y es lo único que rearma el aviso para alguien que se
 *  fue y volvió. */
export function olvidarAusentes(marcas: Set<string>, presentes: Record<string, unknown>): void {
  for (const uid of [...marcas]) {
    if (!(uid in presentes)) marcas.delete(uid);
  }
}
