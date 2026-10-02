// «No leídos primero», como en Gmail (Keila, 02/10): en Recibidos, arriba una
// sección con lo que falta leer y abajo «Todo lo demás».
//
// ⚠️ La lista va por PÁGINAS de 50. Si «No leídos» saliera de la página que se
// mira, un correo sin leer de la página 3 no aparecería arriba hasta llegar a
// la página 3 —justo lo que la sección tiene que evitar—. Por eso los no leídos
// vienen de su PROPIA consulta (toda la carpeta) y la página de abajo trae solo
// los leídos. Acá se juntan las dos cosas y se reparten las conversaciones.

import type { Hilo } from "@/lib/mailHilos";

interface ConClave {
  id?: string;
  seq?: number;
  origen: "cache" | "vivo";
  unread: boolean;
}

const clave = (m: ConClave) => (m.origen === "cache" ? `id:${m.id}` : `seq:${m.seq}`);

/** Los no leídos más la página, sin repetir: un mismo correo puede venir por
 *  las dos consultas mientras una de ellas todavía no se refrescó. Gana la
 *  versión de `primero` (la de los no leídos), que es la que define la sección. */
export function juntarSinRepetir<T extends ConClave>(primero: T[], despues: T[]): T[] {
  const vistos = new Set(primero.map(clave));
  return [...primero, ...despues.filter((m) => !vistos.has(clave(m)))];
}

/** Reparte las conversaciones en «No leídos» y «Todo lo demás».
 *
 *  - Una conversación va arriba si CUALQUIERA de sus mensajes está sin leer:
 *    una charla con una respuesta nueva tiene que verse sin leer aunque los
 *    viejos ya se hayan abierto (el mismo criterio que el punto de la fila).
 *  - `retener`: lo que estaba arriba y se acaba de leer SIGUE arriba hasta que
 *    se cambie de carpeta, como en Gmail. Si no, abrir un correo lo haría
 *    saltar de sección mientras lo lees. */
export function partirNoLeidosPrimero<T extends ConClave>(
  hilos: Hilo<T>[],
  retener: (m: T) => boolean = () => false,
): { noLeidos: Hilo<T>[]; resto: Hilo<T>[] } {
  const noLeidos: Hilo<T>[] = [];
  const resto: Hilo<T>[] = [];
  for (const h of hilos) {
    if (h.mensajes.some((m) => m.unread || retener(m))) noLeidos.push(h);
    else resto.push(h);
  }
  return { noLeidos, resto };
}
