// Borradores por conversación (estilo WhatsApp): lo que estabas escribiendo en
// un chat sobrevive a cambiar de chat y a recargar la página. Se guarda en
// localStorage por usuario+conversación; el envío lo limpia.
//
// Todo va en try/catch: en modo privado / cuota llena, escribir a localStorage
// tira — y perder el borrador es aceptable, romper el composer no.
//
// ⚠️ Se guarda el DOCUMENTO del editor, no solo el texto. Antes se guardaba el
// texto plano (renglones separados por "\n") y al volver se le pasaba a TipTap
// como contenido inicial. TipTap lee un string como HTML, y en HTML un "\n" es
// un espacio: una lista de diez renglones volvía como UN párrafo corrido, y se
// perdían también negritas, viñetas y colores (reporte del 28/09).
// El texto plano se sigue guardando al lado porque la lista de chats lo usa
// para el "✏️ Borrador:".
//
// Los ADJUNTOS del borrador no van acá (localStorage solo guarda texto y no
// aguanta ni una captura): ver adjuntosDelBorrador.ts.

import type { JSONContent } from "@tiptap/react";

const key = (userId: string, conversationId: string) =>
  `mvn_chat_draft_${userId}_${conversationId}`;

interface BorradorGuardado {
  v: 2;
  plain: string;
  doc: JSONContent;
}

/** Lee lo guardado. Un valor viejo (texto plano, de antes del formato v2) se
 *  devuelve como `plain` sin documento: nadie pierde su borrador por el cambio. */
function leer(userId: string | undefined, conversationId: string): { plain: string; doc: JSONContent | null } {
  if (!userId) return { plain: "", doc: null };
  let crudo: string | null = null;
  try {
    crudo = localStorage.getItem(key(userId, conversationId));
  } catch {
    return { plain: "", doc: null };
  }
  if (!crudo) return { plain: "", doc: null };
  if (crudo.startsWith("{")) {
    try {
      const b = JSON.parse(crudo) as Partial<BorradorGuardado>;
      if (b && b.v === 2 && typeof b.plain === "string" && b.doc && typeof b.doc === "object") {
        return { plain: b.plain, doc: b.doc };
      }
    } catch {
      /* no era un borrador v2: era texto que empezaba con "{" */
    }
  }
  return { plain: crudo, doc: null };
}

/** Texto plano del borrador (para la vista previa de la lista de chats). */
export function getDraft(userId: string | undefined, conversationId: string): string {
  return leer(userId, conversationId).plain;
}

/**
 * Texto plano → documento de TipTap, UN párrafo por renglón. Sirve para los
 * borradores viejos, que solo tienen el texto.
 */
export function docDesdeTexto(plain: string): JSONContent {
  return {
    type: "doc",
    content: plain.split("\n").map((renglon) =>
      renglon ? { type: "paragraph", content: [{ type: "text", text: renglon }] } : { type: "paragraph" },
    ),
  };
}

/** Contenido inicial para el editor: el documento guardado tal cual, o el texto
 *  viejo convertido a párrafos. NUNCA un string: TipTap lo leería como HTML. */
export function getDraftDoc(userId: string | undefined, conversationId: string): JSONContent | null {
  const { plain, doc } = leer(userId, conversationId);
  if (doc) return doc;
  return plain ? docDesdeTexto(plain) : null;
}

export function setDraft(userId: string | undefined, conversationId: string, plain: string, doc: JSONContent) {
  if (!userId) return;
  try {
    if (plain.trim()) {
      const b: BorradorGuardado = { v: 2, plain, doc };
      localStorage.setItem(key(userId, conversationId), JSON.stringify(b));
    } else {
      localStorage.removeItem(key(userId, conversationId));
    }
  } catch {
    /* sin persistencia, sin drama */
  }
}

export function clearDraft(userId: string | undefined, conversationId: string) {
  if (!userId) return;
  try {
    localStorage.removeItem(key(userId, conversationId));
  } catch {
    /* idem */
  }
}

// ── Cuántos adjuntos tiene el borrador ─────────────────────────────────────
// Los archivos viven en memoria/IndexedDB (asíncrono), pero la lista de chats
// dibuja el "✏️ Borrador" en el render, sin esperar. Por eso se anota aparte, en
// localStorage, solo la CANTIDAD: si no, un borrador que es solo una captura
// pegada no se vería en la lista y parecería perdido.

const keyAdjuntos = (userId: string, conversationId: string) =>
  `mvn_chat_draft_files_${userId}_${conversationId}`;

export function getDraftAttachmentCount(userId: string | undefined, conversationId: string): number {
  if (!userId) return 0;
  try {
    const n = Number(localStorage.getItem(keyAdjuntos(userId, conversationId)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function setDraftAttachmentCount(userId: string | undefined, conversationId: string, n: number) {
  if (!userId) return;
  try {
    if (n > 0) localStorage.setItem(keyAdjuntos(userId, conversationId), String(n));
    else localStorage.removeItem(keyAdjuntos(userId, conversationId));
  } catch {
    /* idem */
  }
}
