// ¿Este navegador puede compartir pantalla?
//
// En los teléfonos NO. Ni iOS (Safari, y por lo tanto Brave y Chrome, que allá
// usan el mismo motor) ni Android Chrome exponen `getDisplayMedia`: el sistema
// no deja que una página capture la pantalla. No es algo que podamos arreglar
// del lado nuestro.
//
// Hasta ahora el botón estaba igual y el error se tragaba en un `console.error`,
// así que quien lo tocaba desde el teléfono no veía absolutamente nada pasar.
// Un botón que no responde y no explica por qué es peor que uno que dice que no
// puede: la persona lo intenta tres veces y termina pensando que Maven está
// roto. Fue así como se reportó.
export function puedeCompartirPantalla(): boolean {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.mediaDevices?.getDisplayMedia === "function";
  } catch {
    return false;
  }
}

/** Qué decirle a la persona cuando falla el compartir. Devuelve null cuando no
 *  hay nada que decir: cancelar el diálogo del navegador es una decisión, no un
 *  error, y avisarla sería regañar a alguien por cambiar de opinión. */
export function motivoDeFalloAlCompartir(err: unknown): string | null {
  if (!puedeCompartirPantalla()) {
    return "Los teléfonos no permiten compartir la pantalla. Hacelo desde la computadora.";
  }
  const nombre = (err as { name?: string } | null)?.name;
  if (nombre === "NotAllowedError" || nombre === "AbortError") return null;  // canceló
  if (nombre === "NotFoundError") return "No se encontró ninguna pantalla para compartir.";
  return (err as Error | null)?.message || "No se pudo compartir la pantalla.";
}
