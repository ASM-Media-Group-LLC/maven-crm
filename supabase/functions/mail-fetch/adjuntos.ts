// Los adjuntos que llegan de la pantalla, revisados ANTES de armar el mensaje.
//
// Los usan dos caminos: enviar y guardar el borrador. Hasta el 08/10 el
// borrador no los aceptaba y se guardaba sin ellos: los adjuntos de un borrador
// se perdían al retomarlo (Keila). Ahora pasan por la misma revisión, así un
// borrador no puede guardar algo que después no se podría mandar.
//
// Va suelto —sin IMAP ni Supabase— para poder probarlo sin red.

export interface AdjuntoEntrante {
  filename: string;
  contentType: string;
  contentBase64: string;
  /** Presente = imagen PEGADA en el cuerpo: viaja con Content-ID y el HTML la
   *  nombra con `src="cid:…"`. */
  contentId?: string;
}

/** Tope del ARCHIVO (no del base64, que pesa ~4/3): igual que la descarga. De
 *  más, revienta la memoria de la edge (256 MB) o el SIZE que anuncia Zoho
 *  (31 MB en el cable ≈ 23 MB de archivo). */
export const TOPE_ADJUNTOS_BYTES = 20 * 1024 * 1024;

export type RevisionDeAdjuntos =
  | { ok: true; adjuntos: AdjuntoEntrante[] }
  | { ok: false; status: 400 | 413; error: string };

export function revisarAdjuntos(crudo: unknown): RevisionDeAdjuntos {
  const adjuntos = Array.isArray(crudo) ? crudo as AdjuntoEntrante[] : [];
  for (const a of adjuntos) {
    if (
      !a || typeof a.filename !== "string" ||
      typeof a.contentType !== "string" || typeof a.contentBase64 !== "string"
    ) {
      return { ok: false, status: 400, error: "un adjunto viene con formato inválido" };
    }
    // ⚠️ El `contentId` termina en una cabecera `Content-ID: <…>`. Se acota
    // acá —y no solo se sanea al armar— para que un valor con CRLF ni
    // siquiera llegue a `buildMessage`.
    if (a.contentId !== undefined &&
        (typeof a.contentId !== "string" || !/^[\w.+-]+@[\w.-]+$/.test(a.contentId))) {
      return { ok: false, status: 400, error: "un adjunto trae un contentId inválido" };
    }
  }
  const bytes = adjuntos.reduce(
    (n, a) => n + Math.floor((a.contentBase64.replace(/\s/g, "").length * 3) / 4),
    0,
  );
  if (bytes > TOPE_ADJUNTOS_BYTES) {
    return { ok: false, status: 413, error: "los adjuntos superan el límite de 20 MB" };
  }
  return { ok: true, adjuntos };
}
