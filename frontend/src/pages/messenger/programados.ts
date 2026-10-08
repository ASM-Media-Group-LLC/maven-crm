// Mensajes programados del Messenger («Programar envío», como Google Chat. Jhon,
// 08/10). Lo que se guarda y lo que se recupera, suelto y sin React.
//
// Un programado es UNO O VARIOS mensajes, en orden: exactamente los que el
// cajón habría mandado en ese momento (el texto, o los archivos con el texto de
// pie). Los arma el mismo código que manda (MessageInput.handleSend), con los
// mismos argumentos que `onSendMessage`, así no hay dos formas de armarlos.

import type { JSONContent } from "@tiptap/react";
import type { ChatMessage } from "./types";

export interface MensajeAProgramar {
  content: string;
  type: ChatMessage["type"];
  file_url?: string | null;
  file_name?: string | null;
  reply_to_id?: string | null;
  album_id?: string | null;
  is_thread_reply?: boolean;
  content_rich?: unknown;
}

/** Los argumentos de `onSendMessage`, como fila de un programado. */
export function mensajeDeArgs(
  content: string,
  type: ChatMessage["type"] = "text",
  fileUrl?: string,
  fileName?: string,
  replyToId?: string,
  albumId?: string,
  isThreadReply?: boolean,
  contentRich?: unknown,
): MensajeAProgramar {
  return {
    content,
    type,
    file_url: fileUrl ?? null,
    file_name: fileName ?? null,
    reply_to_id: replyToId ?? null,
    album_id: albumId ?? null,
    is_thread_reply: !!isThreadReply,
    content_rich: contentRich ?? null,
  };
}

/** Los argumentos para `onSendMessage` («Enviar ahora» un programado). */
export function argsDeMensaje(m: MensajeAProgramar): Parameters<
  (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string,
    albumId?: string, isThreadReply?: boolean, contentRich?: unknown) => void
> {
  return [
    m.content, m.type, m.file_url ?? undefined, m.file_name ?? undefined, m.reply_to_id ?? undefined,
    m.album_id ?? undefined, m.is_thread_reply || undefined, m.content_rich ?? undefined,
  ];
}

/** Se puede volver al cajón para editar si es UN mensaje de texto. Con archivos
 *  no: ya están subidos y el cajón trabaja con archivos del equipo. */
export function sePuedeEditar(mensajes: MensajeAProgramar[]): boolean {
  return mensajes.length === 1 && mensajes[0].type === "text";
}

/** El documento que vuelve al cajón: con su formato si lo tenía, si no el texto
 *  con sus renglones (TipTap lee un string como HTML y los saltos se perderían). */
export function docDelMensaje(m: MensajeAProgramar): JSONContent {
  const rich = m.content_rich as JSONContent | null | undefined;
  if (rich && typeof rich === "object" && rich.type === "doc") return rich;
  return {
    type: "doc",
    content: m.content.split("\n").map((linea) => (
      linea ? { type: "paragraph", content: [{ type: "text", text: linea }] } : { type: "paragraph" }
    )),
  };
}
