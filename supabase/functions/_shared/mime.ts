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
