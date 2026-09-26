// ¿Este navegador puede compartir pantalla?
//
// EN LOS TELÉFONOS NO, en ninguno, y por dos caminos distintos:
//
//   · iOS (Safari, y por lo tanto también Brave y Chrome, que allá están
//     obligados a usar el mismo motor) directamente NO EXPONE
//     `getDisplayMedia`. La propiedad no existe.
//   · Chrome y Firefox de Android SÍ la exponen, pero NUNCA la implementaron:
//     siempre rechazan con `NotAllowedError`.
//
// Ese segundo caso es una trampa, y ya caí en ella: `NotAllowedError` es
// EXACTAMENTE el mismo error que cuando alguien cierra el diálogo del
// navegador a propósito. Como ese caso se trataba en silencio —cancelar no es
// un error—, en Android seguía sin pasar absolutamente nada al tocar el botón,
// que era justo el problema que esto venía a resolver.
//
// Por eso no alcanza con preguntar si la función existe: hay que preguntar
// también si el dispositivo se maneja con un dedo. En una pantalla táctil, un
// fallo al compartir NO es una cancelación: es que no se puede.
//
// Google Meet SÍ comparte pantalla desde el celular, pero desde su APLICACIÓN
// nativa, que usa una función del sistema operativo (ReplayKit en iOS,
// MediaProjection en Android) a la que una página web no tiene acceso. No es
// que Meet sepa algo que nosotros no: es que no está corriendo en un navegador.

import { traducir } from "@/lib/i18n";

function esTactil(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function puedeCompartirPantalla(): boolean {
  try {
    if (typeof navigator === "undefined") return false;
    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") return false;
    // La API existe pero es un teléfono: Android la expone y siempre falla.
    return !esTactil();
  } catch {
    return false;
  }
}

/** Qué decirle a la persona cuando falla el compartir. Devuelve null cuando no
 *  hay nada que decir: cerrar el diálogo del navegador es una decisión, no un
 *  error, y avisarla sería regañar a alguien por cambiar de opinión. */
export function motivoDeFalloAlCompartir(err: unknown): string | null {
  // traducir() y no un texto fijo: el motivo es la descripción del aviso que ve
  // quien tocó el botón, en su idioma (hooks/useLiveKit → toggleScreenShare).
  if (!puedeCompartirPantalla()) {
    return traducir("shared.screenShare.phones");
  }
  const nombre = (err as { name?: string } | null)?.name;
  if (nombre === "NotAllowedError" || nombre === "AbortError") return null;  // canceló
  if (nombre === "NotFoundError") return traducir("shared.screenShare.notFound");
  return (err as Error | null)?.message || traducir("shared.screenShare.failed");
}
