// Compartir una grabación = elegir con quién queda en su lista de Grabaciones.
// El diálogo manda la lista COMPLETA deseada; acá se calcula qué se agrega y
// qué se quita respecto de lo que ya estaba. Quien grabó nunca se quita.
export function diffDestinatarios(
  actuales: readonly string[],
  deseados: readonly string[],
  protegidos: readonly string[] = [],
): { agregar: string[]; quitar: string[] } {
  const prot = new Set(protegidos);
  const antes = new Set(actuales);
  const despues = new Set(deseados.filter((u) => !prot.has(u)));
  return {
    agregar: [...despues].filter((u) => !antes.has(u)),
    quitar: [...antes].filter((u) => !despues.has(u) && !prot.has(u)),
  };
}
