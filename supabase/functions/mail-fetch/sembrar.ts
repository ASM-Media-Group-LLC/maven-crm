// La fila de `mail_messages` que se siembra apenas se sube un correo propio:
// la copia en Enviados al mandar y el borrador al guardarlo.
//
// El barrido completo de esas carpetas pasa cada 30 minutos (no están en
// HOT_FOLDERS). Sin sembrar, la persona manda un correo y no lo ve en
// Enviados, o guarda un borrador y no aparece en Borradores — y si lo
// re-guardó, sigue viendo la versión VIEJA, sin lo que le agregó. Concluye que
// no se guardó nada.
//
// Va suelto —sin IMAP ni Supabase— para poder probarlo sin red.

import { tamanoDeBase64 } from "../_shared/base64.ts";
import type { AdjuntoEntrante } from "./adjuntos.ts";

export interface DatosDeLaFila {
  userId: string;
  folder: string;
  uidvalidity: number;
  uid: number;
  fromAddress: string;
  nombre: string;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  /** El HTML crudo: solo para el resumen. */
  html: string | null;
  /** El HTML ya SANEADO (`sanitizeEmailHtml`), el mismo que guardaría el sync:
   *  sembrar el crudo dejaría pasar imágenes remotas que el resto del Correo
   *  bloquea y cuenta. */
  limpio: { html: string; remoteImages: number } | null;
  adjuntos: AdjuntoEntrante[];
  /** El mensaje armado, para leer su Message-ID. */
  rfc822: string;
  inReplyTo: string | null;
  references: string | null;
  /** El emoji, si el correo es una reacción (reacciones.ts). */
  reaccion?: string | null;
}

export function filaSembrada(d: DatosDeLaFila) {
  return {
    user_id: d.userId,
    folder: d.folder,
    uidvalidity: d.uidvalidity,
    uid: d.uid,
    from_addr: d.nombre ? `"${d.nombre}" <${d.fromAddress}>` : d.fromAddress,
    to_addr: d.to.join(", "),
    cc_addr: d.cc.join(", "),
    subject: d.subject,
    date: new Date().toISOString(),
    snippet: (d.text ?? d.html?.replace(/<[^>]+>/g, " ") ?? "")
      .replace(/\s+/g, " ").trim().slice(0, 200),
    // ⚠️ EL CUERPO TAMBIÉN. Sembrar solo el `snippet` deja la fila con asunto
    // y resumen pero sin `html` ni `text_body`: en la lista se ve bien y al
    // abrirlo dice "(sin contenido)" hasta que pasa el barrido.
    html: d.limpio?.html ?? null,
    text_body: d.text ?? null,
    remote_images: d.limpio?.remoteImages ?? 0,
    // La misma forma que escribe el sync ({filename, contentType, sizeBytes,
    // contentId}), porque el visor y la descarga buscan la parte por NOMBRE y
    // usan el tamaño de desempate.
    attachments: d.adjuntos.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      sizeBytes: tamanoDeBase64(a.contentBase64),
      // ⚠️ EL Content-ID, NO `null`. Es lo que ata la imagen PEGADA en el
      // cuerpo con la parte que la lleva: el HTML dice `src="cid:ese-id"` y
      // el lector lo busca acá. Con `null` la imagen se veía rota hasta que
      // pasara el barrido.
      contentId: a.contentId ?? null,
    })),
    unread: false,
    message_id: d.rfc822.match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim() ?? null,
    // ⚠️ LAS CABECERAS DEL HILO TAMBIÉN, por lo mismo que el cuerpo: sin ellas
    // la fila queda suelta y la respuesta se ve como un correo aparte al lado
    // de su conversación hasta que pase el barrido.
    in_reply_to: d.inReplyTo ?? null,
    // La misma forma que guarda el sync: un arreglo de ids con sus picos. La
    // cabecera viaja como UNA línea separada por espacios, así que acá se parte.
    refs: d.references?.match(/<[^>]+>/g) ?? null,
    // Solo si ES una reacción: así la fila de un correo común no nombra la
    // columna y la siembra no depende de que la migración ya esté aplicada.
    ...(d.reaccion ? { reaccion: d.reaccion } : {}),
  };
}
