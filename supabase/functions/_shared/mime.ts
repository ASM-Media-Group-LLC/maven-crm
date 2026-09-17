// Parseo de mensajes MIME.
//
// Un correo moderno no es texto: es un árbol. El de los tickets TK-####, por
// ejemplo, es un multipart/alternative con una versión en texto plano y una
// en HTML con tablas; y si tiene adjuntos, todo eso va dentro de un
// multipart/mixed. Hay que recorrer ese árbol, decodificar cada hoja según su
// Content-Transfer-Encoding, y elegir qué mostrar.

import { parseHeaders } from "./imap.ts";

export interface MimePart {
  contentType: string;
  charset: string;
  encoding: string;
  disposition: string;
  filename: string | null;
  contentId: string | null;
  /** Contenido ya decodificado. Vacío para adjuntos: no los traemos acá. */
  text: string;
  /** Body crudo de la parte (aún codificado). Para materializar el binario de
   *  un adjunto puntual bajo demanda con `extraerAdjunto`, sin decodificar
   *  TODOS los adjuntos en el camino normal de lectura. */
  rawBody: string;
  sizeBytes: number;
}

export interface ParsedMessage {
  headers: Record<string, string>;
  /** Cuerpo elegido para mostrar: HTML si existe, si no texto plano. */
  html: string | null;
  text: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    sizeBytes: number;
    /** Para imágenes incrustadas referenciadas con cid: desde el HTML. */
    contentId: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Decodificación de Content-Transfer-Encoding
// ---------------------------------------------------------------------------

function decodeBase64(input: string, charset: string): string {
  try {
    const clean = input.replace(/\s+/g, "");
    const raw = atob(clean);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return input;
  }
}

function decodeQuotedPrintableBody(input: string, charset: string): string {
  // Los "soft line breaks" (= al final de línea) se eliminan: existen solo
  // para que las líneas no pasen de 76 caracteres.
  const unfolded = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    const c = unfolded[i];
    if (c === "=" && i + 2 < unfolded.length && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // Los caracteres fuera de ASCII ya vienen tal cual en este punto.
      const code = c.charCodeAt(0);
      if (code < 256) bytes.push(code);
      else {
        for (const b of new TextEncoder().encode(c)) bytes.push(b);
      }
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return unfolded;
  }
}

function decodeBody(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") return decodeBase64(body, charset);
  if (enc === "quoted-printable") return decodeQuotedPrintableBody(body, charset);
  // 7bit / 8bit / binary / vacío: ya es texto.
  return body;
}

// ---------------------------------------------------------------------------
// Parseo de la estructura
// ---------------------------------------------------------------------------

/** Saca un parámetro de un encabezado tipo `text/html; charset="utf-8"`. */
function param(headerValue: string, name: string): string | null {
  // Acepta con y sin comillas. `filename*=` (RFC 2231) no se soporta acá:
  // devolvemos null y el llamador cae al nombre por defecto.
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i");
  const m = headerValue.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function splitHeadersAndBody(raw: string): { head: string; body: string } {
  // El límite es la primera línea vacía. Aceptamos \r\n\r\n y \n\n porque
  // no todos los servidores son prolijos.
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return { head: raw, body: "" };
  const sep = raw.slice(idx).match(/^\r?\n\r?\n/)![0];
  return { head: raw.slice(0, idx), body: raw.slice(idx + sep.length) };
}

/** Parte un multipart en sus secciones usando el boundary. */
function splitMultipart(body: string, boundary: string): string[] {
  // Las secciones van entre `--boundary` y cierran con `--boundary--`.
  const marker = `--${boundary}`;
  const chunks = body.split(marker);
  // El primero es el preámbulo (texto para clientes que no entienden MIME)
  // y el último es el epílogo tras el `--`. Los dos se descartan.
  return chunks
    .slice(1)
    .filter((c) => !/^--/.test(c.trimStart()))
    .map((c) => c.replace(/^\r?\n/, ""));
}

/** Techo de recursión: un correo malicioso podría anidar multiparts hasta
 *  agotar la pila. Diez niveles es mucho más de lo que usa un correo real. */
const MAX_DEPTH = 10;

function walk(raw: string, depth: number, out: MimePart[]): void {
  if (depth > MAX_DEPTH) return;

  const { head, body } = splitHeadersAndBody(raw);
  const h = parseHeaders(head);
  const ctypeRaw = h["content-type"] ?? "text/plain";
  const contentType = ctypeRaw.split(";")[0].trim().toLowerCase();
  const charset = (param(ctypeRaw, "charset") ?? "utf-8").toLowerCase();
  const encoding = h["content-transfer-encoding"] ?? "7bit";
  const dispRaw = h["content-disposition"] ?? "";
  const disposition = dispRaw.split(";")[0].trim().toLowerCase();
  const filename = param(dispRaw, "filename") ?? param(ctypeRaw, "name");
  const contentId = (h["content-id"] ?? "").replace(/^<|>$/g, "") || null;

  if (contentType.startsWith("multipart/")) {
    const boundary = param(ctypeRaw, "boundary");
    if (!boundary) return;
    for (const section of splitMultipart(body, boundary)) {
      walk(section, depth + 1, out);
    }
    return;
  }

  // Hoja. Los adjuntos NO se decodifican: solo queremos sus metadatos, y
  // decodificar un PDF de 10 MB a string no tiene ningún sentido.
  const isAttachment = disposition === "attachment" ||
    (!!filename && !contentType.startsWith("text/"));

  out.push({
    contentType,
    charset,
    encoding,
    disposition,
    filename,
    contentId,
    text: isAttachment ? "" : decodeBody(body, encoding, charset),
    rawBody: body,
    sizeBytes: body.length,
  });
}

/** Parsea un mensaje RFC 822 completo y elige qué mostrar. */
export function parseMessage(raw: string): ParsedMessage {
  const { head } = splitHeadersAndBody(raw);
  const headers = parseHeaders(head);

  const parts: MimePart[] = [];
  walk(raw, 0, parts);

  // Preferimos HTML: es lo que el remitente diseñó. Los correos del sistema
  // de tickets, por ejemplo, pierden todo el sentido en texto plano.
  const htmlPart = parts.find(
    (p) => p.contentType === "text/html" && p.disposition !== "attachment",
  );
  const textPart = parts.find(
    (p) => p.contentType === "text/plain" && p.disposition !== "attachment",
  );

  const attachments = parts
    .filter((p) => p.disposition === "attachment" || (p.filename && !p.contentType.startsWith("text/")))
    .map((p) => ({
      filename: p.filename ?? "adjunto",
      contentType: p.contentType,
      sizeBytes: p.sizeBytes,
      contentId: p.contentId,
    }));

  return {
    headers,
    html: htmlPart?.text ?? null,
    text: textPart?.text ?? null,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// Descarga de un adjunto puntual (bytes reales, no texto)
// ---------------------------------------------------------------------------

/** base64 → bytes. A diferencia de `decodeBase64`, NO pasa por TextDecoder:
 *  un adjunto es binario y decodificarlo como texto lo corrompería. */
function base64ToBytes(input: string): Uint8Array {
  const raw = atob(input.replace(/\s+/g, ""));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** quoted-printable → bytes. Cada `=XX` es un byte; el resto va como latin1. */
function qpToBytes(input: string): Uint8Array {
  const unfolded = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    const c = unfolded[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Exportada porque el camino de descarga por parte (BODY.PEEK[n]) recibe el
 *  contenido ya aislado por el servidor y solo le falta decodificarlo: el
 *  mismo trabajo que hace `extraerAdjunto`, sin parsear MIME a mano. */
export function decodeBodyToBytes(body: string, encoding: string): Uint8Array {
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") return base64ToBytes(body);
  if (enc === "quoted-printable") return qpToBytes(body);
  // 7bit / 8bit / binary: cada carácter ES un byte (latin1). Poco común en un
  // adjunto real (viajan en base64), pero no lo rompemos.
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}

/** Materializa el binario del adjunto en la posición `index` — el mismo orden
 *  que `parseMessage(...).attachments`. Devuelve null si no hay adjunto ahí.
 *
 *  Los adjuntos casi siempre viajan en base64, que es ASCII de 7 bits: aunque
 *  el mensaje crudo se haya leído del socket como texto, esos caracteres
 *  sobreviven intactos y `base64ToBytes` recupera los bytes originales. */
export function extraerAdjunto(
  raw: string,
  index: number,
): { filename: string; contentType: string; bytes: Uint8Array } | null {
  const parts: MimePart[] = [];
  walk(raw, 0, parts);
  const adjuntos = parts.filter(
    (p) => p.disposition === "attachment" || (p.filename && !p.contentType.startsWith("text/")),
  );
  const p = adjuntos[index];
  if (!p) return null;
  // El CRLF final que precede al `--boundary` es del delimitador MIME, no del
  // contenido. En base64 da igual (el whitespace se ignora), pero en QP o sin
  // codificar sumaría 0x0D 0x0A de más al archivo.
  const cuerpo = p.rawBody.replace(/\r?\n$/, "");
  return {
    filename: p.filename ?? "adjunto",
    contentType: p.contentType,
    bytes: decodeBodyToBytes(cuerpo, p.encoding),
  };
}
