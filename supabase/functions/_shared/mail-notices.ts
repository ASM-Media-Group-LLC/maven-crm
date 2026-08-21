// Avisos del proveedor de correo que no se le muestran a la persona.
//
// El principio del módulo de correo es que el empleado conozca Maven y nada
// más. El proveedor que hay detrás le manda mensajes suyos —empezando por
// dos de bienvenida el día que se crea la casilla— y esa persona no tiene
// idea de qué es esa empresa ni por qué le escribe.
//
// SE OCULTAN, NO SE BORRAN. Filtrar es reversible (se saca una línea de
// acá y vuelven a aparecer), atrapa también los avisos que lleguen en el
// futuro, y no destruye nada que después resulte que hacía falta.

/** ⚠️ DIRECCIONES EXACTAS, NO EL DOMINIO ENTERO.
 *
 *  Tentaba filtrar todo `@zoho.com` de una, pero por ese dominio llegan
 *  también los REBOTES: si alguien manda un correo a una dirección mal
 *  escrita, el aviso de que no se entregó viene de ahí. Ocultarlo sería
 *  peor que el problema que estamos resolviendo — la persona creería que
 *  su correo llegó cuando no llegó a ninguna parte. */
export const AVISOS_OCULTOS: ReadonlySet<string> = new Set([
  "welcome@zoho.com",
  "noreply@zoho.com",
  "no-reply@zoho.com",
  "notifications@zoho.com",
  "mail-noreply@zoho.com",
  "welcome@zohomail.com",
  "noreply@zohoaccounts.com",
]);

/** Saca la dirección de un `From:` tipo `Nombre <x@y.com>`. */
export function direccionDe(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

export function esAvisoDelProveedor(from: string): boolean {
  return AVISOS_OCULTOS.has(direccionDe(from ?? ""));
}

export function ocultarAvisosDelProveedor<T extends { from: string }>(
  mensajes: T[],
): T[] {
  return mensajes.filter((m) => !esAvisoDelProveedor(m.from ?? ""));
}
