/**
 * Borrador local del compositor — para NO perder lo escrito si el compositor
 * se cierra sin querer, se refresca la página o se cierra la pestaña.
 *
 * Es autoguardado en `localStorage`, no "borradores en el servidor": no
 * aparecen en la carpeta Borradores ni se ven desde otro dispositivo. Resuelve
 * el dolor concreto ("me salí y se borró"); los borradores server-side (IMAP)
 * son otra vuelta.
 *
 * Funciones PURAS (sin React), testeadas en `mailDraft.test.ts`. Todo va
 * envuelto en try/catch: en modo incógnito o con la cuota llena `localStorage`
 * tira, y perder el autoguardado no puede tumbar el compositor.
 */

export interface BorradorGuardado {
  /** Contexto al que pertenece: "nuevo" o "reply:<message-id>". Un borrador de
   *  una conversación no se recupera en otra. */
  firma: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** HTML del editor tal cual (TipTap), para restaurar el cuerpo. */
  html: string;
  inReplyTo?: string;
  references?: string;
  /** Cuándo se guardó (epoch ms). */
  ts: number;
}

/** Distingue "correo nuevo" de "responder a tal hilo" y de "reenviar tal
 *  correo". Sin esto, abrir una respuesta recuperaría el borrador de un correo
 *  nuevo (o al revés).
 *
 *  ⚠️ EL REENVÍO NECESITA SU PROPIO SLOT. Un reenvío no tiene `inReplyTo` —no
 *  cuelga del hilo original—, así que caía en "nuevo", el mismo cajón que un
 *  correo en blanco. Con un borrador nuevo a medio escribir guardado, tocar
 *  Reenviar pegaba ESE texto encima y se llevaba puesta la cita y el
 *  encabezado del mensaje reenviado. */
export function firmaContexto(inReplyTo?: string, reenvioDe?: string): string {
  if (reenvioDe) return `fwd:${reenvioDe}`;
  return inReplyTo ? `reply:${inReplyTo}` : "nuevo";
}

/** Clave por buzón Y por contexto: dos personas que comparten navegador no se
 *  pisan, y un borrador nuevo no pisa la respuesta a un hilo (cada hilo tiene
 *  su propio slot; los "nuevos" comparten uno, que es lo normal). */
function clave(email: string, firma: string): string {
  return `maven:correo:borrador:${email.toLowerCase()}:${firma}`;
}

export function guardarBorrador(email: string, b: BorradorGuardado): void {
  try {
    localStorage.setItem(clave(email, b.firma), JSON.stringify(b));
  } catch {
    /* incógnito / cuota llena: sin autoguardado, pero el compositor sigue. */
  }
}

/** Devuelve el borrador de ese buzón+contexto, o null si no hay o está roto. */
export function leerBorrador(email: string, firma: string): BorradorGuardado | null {
  try {
    const crudo = localStorage.getItem(clave(email, firma));
    if (!crudo) return null;
    const b = JSON.parse(crudo) as BorradorGuardado;
    // Validación defensiva: un JSON de otra versión no debe romper el montaje.
    if (b && typeof b.html === "string" && b.firma === firma) return b;
    return null;
  } catch {
    return null;
  }
}

export function borrarBorrador(email: string, firma: string): void {
  try {
    localStorage.removeItem(clave(email, firma));
  } catch {
    /* nada que hacer */
  }
}
