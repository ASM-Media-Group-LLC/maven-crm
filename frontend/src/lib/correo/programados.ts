// La carpeta «Programados» del Correo (Keila, 08/10: «Programar envío» como
// Gmail). No es una carpeta del servidor de correo: los programados viven en
// Maven (tabla mail_programados) hasta que salen. Por eso su llave no puede
// chocar con el nombre de ninguna carpeta IMAP.
//
// Suelto, sin React, para poder probarlo.

import type { BorradorInicial } from "@/components/correo/MailComposer";
import type { ProgramadoCancelado } from "@/hooks/useMailbox";
import { repartirBorradorRetomado } from "@/lib/correo/borradorRetomado";
import { pesoDeBase64 } from "@/lib/mailInline";

export const CARPETA_PROGRAMADOS = "__programados";

/** La lista de carpetas con «Programados» donde la pone Gmail: después de
 *  Enviados (o de Borradores, o al final). Solo si hay alguno: una carpeta
 *  vacía para siempre en todos los buzones sería ruido. */
export function conProgramados<T extends { folder: string; unread: number }>(
  carpetas: T[],
  cuantos: number,
  mirando: boolean,
): Array<T | { folder: string; unread: number }> {
  if (cuantos === 0 && !mirando) return carpetas;
  const entrada = { folder: CARPETA_PROGRAMADOS, unread: cuantos };
  const despues = ["Enviado", "Borrador"].map((f) => carpetas.findIndex((c) => c.folder === f)).find((i) => i >= 0);
  if (despues === undefined) return [...carpetas, entrada];
  return [...carpetas.slice(0, despues + 1), entrada, ...carpetas.slice(despues + 1)];
}

/** El programado cancelado, listo para abrir en el compositor: las imágenes
 *  pegadas vuelven al cuerpo y los archivos a la lista (igual que retomar un
 *  borrador). */
export function borradorDeProgramado(c: ProgramadoCancelado): BorradorInicial {
  const adjuntos = c.correo.attachments ?? [];
  const metas = adjuntos.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: pesoDeBase64(a.contentBase64),
    contentId: a.contentId ?? null,
  }));
  const bajados = adjuntos.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: pesoDeBase64(a.contentBase64),
    contentBase64: a.contentBase64,
  }));
  const { html, adjuntos: archivos } = repartirBorradorRetomado(c.correo.html ?? null, metas, bajados);
  return {
    to: c.para.join(", "),
    cc: c.cc.length ? c.cc.join(", ") : undefined,
    bcc: c.cco.length ? c.cco.join(", ") : undefined,
    subject: c.asunto === "(sin asunto)" ? "" : c.asunto,
    // Sin HTML (un correo de solo texto): el texto, con sus saltos de línea.
    cuerpoHtml: html ?? (c.correo.text ? textoComoHtml(c.correo.text) : undefined),
    inReplyTo: c.correo.in_reply_to ?? undefined,
    references: c.correo.references ?? undefined,
    adjuntosIniciales: archivos,
  };
}

function textoComoHtml(texto: string): string {
  const esc = texto.replace(/[&<>]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"));
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}
