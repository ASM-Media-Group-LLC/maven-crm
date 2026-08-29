// ¿Esta persona marcó "Baño" o "Break" ahora mismo?
//
// Vive FUERA de React a propósito, igual que la llamada y que la presencia. El
// supervisor de encuadre corre dentro de la llamada (que sobrevive a navegar a
// otra sección de Maven), pero la pausa se marca desde la página de Cowork, que
// no sobrevive. Si el dato viajara por props, al navegar el supervisor perdería
// de vista la pausa y empezaría a reclamarle encuadre a alguien que avisó que
// se iba — que es exactamente lo que el botón de pausa promete evitar.
//
// No hace falta que sea reactivo: el supervisor lo consulta en cada tic.

let enPausa = false;

/** Lo llama la página de Cowork cada vez que cambia el estado de pausa. */
export function marcarPausa(valor: boolean) {
  enPausa = valor;
}

export function estaEnPausa(): boolean {
  return enPausa;
}
