// Juntar en UNA conversación lo que está repartido entre carpetas.
//
// Lo que te llegó vive en Recibidos, lo que contestaste en Enviados y lo viejo
// en Archivados. Esto toma los mensajes que ya se tenían más los que trajo la
// consulta y arma la charla completa.
//
// Vive suelto —sin React ni Supabase— porque acá están las dos trampas que se
// ven como correo perdido o como correo duplicado, y las dos merecen prueba.

import { agruparEnHilos } from "@/lib/mailHilos";
import type { MailSummary } from "@/hooks/useMailbox";

/** Con qué se identifica una FILA (no un mensaje): carpeta + id. */
function claveDeFila(m: MailSummary): string {
  return `${m.folder ?? ""}:${m.id ?? m.seq ?? ""}`;
}

/**
 * Arma la conversación completa a partir de lo conocido y lo traído.
 *
 * Dos reglas, cada una por un motivo distinto:
 *
 * 1. **Se deduplica por FILA, no por mensaje, para juntarlos.** El mismo
 *    correo puede estar de verdad en dos carpetas y cada copia es una fila con
 *    su propio uid; quedarse con una sola haría que abrir la otra fuera a
 *    buscarla donde no está.
 *
 * 2. **Pero se MUESTRA uno solo por `message_id`.** ⚠️ Escribirle a alguien con
 *    copia a uno mismo deja el mismo mensaje en Recibidos y en Enviados: sin
 *    esto, el hilo lo muestra dos veces y se lee como si lo hubieras mandado
 *    dos veces. Se prefiere la copia de Recibidos, que es la que uno espera
 *    abrir.
 *
 * Quién termina adentro del hilo NO se decide acá: se le pasa todo a
 * `agruparEnHilos`, que es el único que sabe las reglas (cabeceras,
 * participantes en común, ventana de tiempo). Acá solo se junta.
 */
export function armarHiloCruzado(
  conocidos: MailSummary[],
  traidos: MailSummary[],
): MailSummary[] {
  const porFila = new Map<string, MailSummary>();
  for (const m of conocidos) porFila.set(claveDeFila(m), m);
  for (const m of traidos) porFila.set(claveDeFila(m), m);

  const porMensaje = new Map<string, MailSummary>();
  const sinId: MailSummary[] = [];
  for (const m of porFila.values()) {
    if (!m.messageId) { sinId.push(m); continue; }
    const ya = porMensaje.get(m.messageId);
    if (!ya || (ya.folder !== "INBOX" && m.folder === "INBOX")) porMensaje.set(m.messageId, m);
  }

  const hilos = agruparEnHilos([...porMensaje.values(), ...sinId]);

  // De todo lo que se trajo, el hilo es el que contiene a los conocidos: el
  // resto son conversaciones que pasaron el filtro grueso de la consulta y que
  // el motor separó, con razón. ⚠️ Si no se encuentra, se devuelve lo conocido
  // y NO lo traído: mostrar de más adentro de un hilo esconde un correo
  // adentro de otro, que se parece demasiado a perderlo.
  const ancla = conocidos[0];
  if (!ancla) return [];
  const elHilo = hilos.find((h) =>
    h.mensajes.some((m) =>
      ancla.messageId ? m.messageId === ancla.messageId : m.id === ancla.id
    ));
  return elHilo?.mensajes ?? conocidos;
}
