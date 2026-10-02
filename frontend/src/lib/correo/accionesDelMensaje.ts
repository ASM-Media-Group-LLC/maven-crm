// Las acciones sobre UN mensaje de la conversación: el ⋮ de cada mensaje, como
// el de Gmail (Keila, 02/10).
//
// Vive suelto —sin React ni Supabase— porque acá está lo delicado: responder
// a OTRO mensaje del hilo tiene que encadenar con ESE mensaje (su Message-ID y
// su cadena de References), no con el que está abierto. Equivocarse no rompe
// nada a la vista: la respuesta sale igual, pero le cuelga al otro de un punto
// equivocado de la conversación, o a otra persona.

import type { MailMessage, MailSummary } from "@/hooks/useMailbox";
import type { BorradorInicial } from "@/components/correo/MailComposer";
import { asuntoDeReenvio, destinatariosRespuesta, nombreDe } from "@/lib/mailAddr";

/** Cuánto del cuerpo original se cita al responder o reenviar. */
const TOPE_CITA = 4000;

/** El borrador para RESPONDER a `resumen` (el que se eligió en el ⋮, no
 *  necesariamente el abierto). `mensaje` es su cuerpo completo.
 *
 *  `References` es la CADENA entera: la del mensaje más su propio id. Mandando
 *  solo el padre, quien recibe puede encadenar esta respuesta pero pierde el
 *  resto del hilo si le falta algún eslabón (RFC 5322 §3.6.4). */
export function borradorDeRespuesta(args: {
  resumen: MailSummary;
  mensaje: MailMessage;
  /** Mi dirección: no me respondo a mí mismo. */
  yo: string;
  aTodos: boolean;
  /** La fecha del original ya escrita para la cita. */
  fecha: string;
}): BorradorInicial {
  const { resumen, mensaje, yo, aTodos, fecha } = args;
  const messageId = resumen.messageId;
  const { to, cc } = destinatariosRespuesta(
    { from: mensaje.from, to: mensaje.to, cc: mensaje.cc, yo },
    aTodos,
  );
  return {
    to,
    cc: cc || undefined,
    subject: /^re:/i.test(mensaje.subject) ? mensaje.subject : `Re: ${mensaje.subject}`,
    inReplyTo: messageId || undefined,
    references: [...(resumen.refs ?? []), messageId].filter(Boolean).join(" ") || undefined,
    citar: {
      de: nombreDe(mensaje.from),
      fecha,
      texto: (mensaje.text ?? "").slice(0, TOPE_CITA),
    },
  };
}

/** El borrador para REENVIAR `resumen`. Sin `inReplyTo`: un reenvío no cuelga
 *  del hilo original (metería el correo en una conversación que su
 *  destinatario no tuvo). */
export function borradorDeReenvio(args: {
  resumen: MailSummary;
  mensaje: MailMessage;
  fecha: string;
  /** La carpeta donde vive, para el cajón del borrador cuando no hay id. */
  carpeta: string;
  adjuntosIniciales?: BorradorInicial["adjuntosIniciales"];
}): BorradorInicial {
  const { resumen, mensaje, fecha, carpeta, adjuntosIniciales } = args;
  return {
    to: "",
    subject: asuntoDeReenvio(mensaje.subject),
    reenvioDe: resumen.messageId || `uid:${carpeta}:${resumen.uid ?? "?"}`,
    citar: {
      reenvio: true,
      de: mensaje.from,
      para: mensaje.to,
      asunto: mensaje.subject,
      fecha,
      texto: (mensaje.text ?? "").slice(0, TOPE_CITA),
    },
    adjuntosIniciales,
  };
}

/** Fecha en milisegundos; lo que no se entiende va al principio. */
const cuando = (m: MailSummary) => Date.parse(m.date) || 0;

/** Clave de una FILA: un mismo correo puede estar en dos carpetas, y cada
 *  copia es su propio uid. */
const claveDeFila = (m: MailSummary) => `${m.folder ?? ""}:${m.id ?? m.seq ?? m.uid ?? ""}`;

/** «Marcar como no leído a partir de aquí»: ESTE mensaje y los que vinieron
 *  después en la conversación, como en Gmail. Los anteriores no se tocan.
 *
 *  ⚠️ El hilo cruza carpetas (lo que contestaste vive en Enviados), así que lo
 *  que devuelve trae mensajes de varias: quien lo use tiene que agruparlos por
 *  carpeta antes de mandarlos (ver `agruparPorCarpeta`). */
export function desdeAqui(hilo: MailSummary[], desde: MailSummary): MailSummary[] {
  const limite = cuando(desde);
  const vistos = new Set<string>();
  const salida: MailSummary[] = [];
  for (const m of [desde, ...hilo]) {
    const k = claveDeFila(m);
    if (vistos.has(k)) continue;
    // El mismo mensaje en el hilo y como `desde`: no se cuenta dos veces.
    if (m !== desde && desde.messageId && m.messageId === desde.messageId) continue;
    if (m !== desde && cuando(m) < limite) continue;
    vistos.add(k);
    salida.push(m);
  }
  return salida.sort((a, b) => cuando(a) - cuando(b));
}

/** Agrupa por CARPETA.
 *
 *  ⚠️ Los UID son POR CARPETA: el uid 5 de Recibidos y el uid 5 de Archivados
 *  son correos DISTINTOS. Mandar juntos correos de dos carpetas como si fueran
 *  de una no fallaría: tocaría OTROS mensajes, los que tengan esos uid en la
 *  carpeta que se mandó. Un correo sin `folder` es de la carpeta que se mira. */
export function agruparPorCarpeta(
  correos: MailSummary[],
  carpetaPorDefecto: string,
): Map<string, MailSummary[]> {
  const porCarpeta = new Map<string, MailSummary[]>();
  for (const m of correos) {
    const f = m.folder ?? carpetaPorDefecto;
    const ya = porCarpeta.get(f);
    if (ya) ya.push(m);
    else porCarpeta.set(f, [m]);
  }
  return porCarpeta;
}

/** Carpetas donde NO se suelta un correo arrastrado.
 *
 *  - Pospuestos: posponer necesita un CUÁNDO; soltarlo ahí lo escondería sin
 *    despertador.
 *  - Borradores y Plantillas: no son correos recibidos.
 *  - Enviados: Gmail tampoco deja; lo enviado no se fabrica moviendo. */
export const NO_SE_SUELTA = new Set(["Snoozed", "Borrador", "Enviado", "Plantillas"]);

/** Qué se mueve al soltar lo arrastrado sobre una carpeta: lo que no está ya
 *  en ella. Es lo mismo que «Mover a» esa carpeta. */
export function paraSoltarEnCarpeta(
  correos: MailSummary[],
  destino: string,
  carpetaPorDefecto: string,
): { mover: MailSummary[]; yaEstaban: number } {
  const mover = correos.filter((m) => (m.folder ?? carpetaPorDefecto) !== destino);
  return { mover, yaEstaban: correos.length - mover.length };
}
