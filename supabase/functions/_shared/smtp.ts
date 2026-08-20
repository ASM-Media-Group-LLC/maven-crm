// Cliente SMTP mínimo para Deno / edge functions.
//
// Más simple que IMAP: SMTP es una conversación de ida y vuelta donde cada
// comando recibe un código de tres dígitos (2xx bien, 4xx error temporal,
// 5xx error definitivo). No hay estado que mantener más allá de la sesión.
//
// Puerto 465 con TLS implícito (la conexión ya arranca cifrada), no 587 con
// STARTTLS. Un puerto que arranca en claro y "sube" a TLS es una superficie
// extra que no necesitamos: Zoho soporta 465 y es lo más simple de hacer bien.

const enc = new TextEncoder();
const dec = new TextDecoder();

const CMD_TIMEOUT_MS = 20_000;

export interface SmtpResult {
  ok: boolean;
  code: number;
  message: string;
}

export class SmtpClient {
  private conn: Deno.TlsConn;
  private buffer = "";

  private constructor(conn: Deno.TlsConn) {
    this.conn = conn;
  }

  static async connect(host: string, port: number): Promise<SmtpClient> {
    const conn = await Deno.connectTls({ hostname: host, port });
    const client = new SmtpClient(conn);
    // El servidor saluda con un 220 antes de aceptar comandos.
    await client.readReply();
    return client;
  }

  /** Lee una respuesta completa.
   *
   *  SMTP permite respuestas de varias líneas: las intermedias llevan un
   *  guion después del código (`250-STARTTLS`) y la última un espacio
   *  (`250 OK`). Cortar en la primera línea deja el resto en el buffer y
   *  desincroniza todo el diálogo. */
  private async readReply(): Promise<SmtpResult> {
    const deadline = Date.now() + CMD_TIMEOUT_MS;
    const chunk = new Uint8Array(4096);
    // Última línea = código seguido de ESPACIO, al principio de línea.
    const done = (b: string) => /^\d{3} [^\r\n]*\r\n/m.test(b) &&
      /\r\n$/.test(b);

    while (!done(this.buffer)) {
      if (Date.now() > deadline) {
        return { ok: false, code: 0, message: "timeout esperando al servidor SMTP" };
      }
      const n = await this.conn.read(chunk);
      if (n === null) {
        return { ok: false, code: 0, message: "el servidor SMTP cerró la conexión" };
      }
      this.buffer += dec.decode(chunk.subarray(0, n));
    }

    const raw = this.buffer;
    this.buffer = "";
    const lines = raw.split(/\r\n/).filter(Boolean);
    const last = lines[lines.length - 1] ?? "";
    const code = Number(last.slice(0, 3));
    return {
      ok: code >= 200 && code < 400,
      code,
      message: lines.map((l) => l.slice(4)).join(" ").trim(),
    };
  }

  private async send(line: string): Promise<SmtpResult> {
    await this.conn.write(enc.encode(line + "\r\n"));
    return await this.readReply();
  }

  async login(user: string, password: string): Promise<SmtpResult> {
    const ehlo = await this.send(`EHLO maven.asmtech.ai`);
    if (!ehlo.ok) return ehlo;
    // AUTH PLAIN con el payload en la misma línea: un viaje menos.
    // El \u0000 va como ESCAPE y no como byte literal: escrito literal es
    // invisible en el editor y cualquiera lo borra al reformatear, rompiendo
    // la autenticación de una forma imposible de ver leyendo el código.
    const payload = btoa(`\u0000${user}\u0000${password}`);
    return await this.send(`AUTH PLAIN ${payload}`);
  }

  /** Envía un mensaje ya armado en formato RFC 822. */
  async sendMessage(
    from: string,
    recipients: string[],
    rfc822: string,
  ): Promise<SmtpResult> {
    const mail = await this.send(`MAIL FROM:<${from}>`);
    if (!mail.ok) return mail;

    for (const rcpt of recipients) {
      const r = await this.send(`RCPT TO:<${rcpt}>`);
      // Un destinatario rechazado corta el envío: es preferible fallar
      // entero y avisar, a mandar a medias sin que nadie se entere.
      if (!r.ok) return { ...r, message: `destinatario ${rcpt}: ${r.message}` };
    }

    const data = await this.send("DATA");
    if (!data.ok) return data;

    // DOT-STUFFING: una línea que empieza con "." marca el fin de los datos.
    // Si el cuerpo tiene una línea así (pasa con texto plano y con base64),
    // hay que duplicar el punto o el mensaje se corta ahí.
    const stuffed = rfc822.replace(/\r\n\./g, "\r\n..");
    await this.conn.write(enc.encode(stuffed + "\r\n.\r\n"));
    return await this.readReply();
  }

  async quit(): Promise<void> {
    try {
      await this.send("QUIT");
    } catch {
      // El servidor pudo cortar primero; da igual.
    }
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      // Ya estaba cerrado.
    }
  }
}

// ---------------------------------------------------------------------------
// Armado del mensaje
// ---------------------------------------------------------------------------

/** Codifica un encabezado si tiene caracteres fuera de ASCII.
 *  Sin esto, un asunto con tildes llega roto o hace que el servidor rechace. */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(value)));
  return `=?UTF-8?B?${b64}?=`;
}

/** Quita saltos de línea de un encabezado.
 *  INYECCIÓN DE ENCABEZADOS: si alguien pone "\r\nBcc: otro@x" en el asunto,
 *  sin limpiar eso se convierte en un encabezado real y el correo se manda a
 *  destinatarios que el usuario no puso. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export interface OutgoingMessage {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  /** Para responder dentro del hilo. */
  inReplyTo?: string;
  references?: string;
}

function boundary(): string {
  return `=_maven_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Arma el RFC 822 listo para mandar. */
export function buildMessage(msg: OutgoingMessage): string {
  const b = boundary();
  const fromHeader = msg.fromName
    ? `${encodeHeader(sanitizeHeaderValue(msg.fromName))} <${msg.from}>`
    : msg.from;

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${msg.to.map(sanitizeHeaderValue).join(", ")}`,
  ];
  if (msg.cc?.length) headers.push(`Cc: ${msg.cc.map(sanitizeHeaderValue).join(", ")}`);
  headers.push(`Subject: ${encodeHeader(sanitizeHeaderValue(msg.subject))}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push(`Message-ID: <${crypto.randomUUID()}@maven-ai.me>`);
  if (msg.inReplyTo) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(msg.inReplyTo)}`);
    // References encadena el hilo entero: sin esto, la respuesta aparece
    // suelta en el cliente del otro en vez de dentro de la conversación.
    headers.push(`References: ${sanitizeHeaderValue(msg.references ?? msg.inReplyTo)}`);
  }
  headers.push("MIME-Version: 1.0");

  const text = msg.text ?? (msg.html ? htmlToText(msg.html) : "");

  // Si hay HTML mandamos las dos versiones: quien no pueda mostrar HTML
  // (o lo tenga desactivado) igual lee el mensaje.
  if (msg.html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${b}"`);
    return [
      headers.join("\r\n"),
      "",
      `--${b}`,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      "",
      `--${b}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      msg.html,
      "",
      `--${b}--`,
      "",
    ].join("\r\n");
  }

  headers.push('Content-Type: text/plain; charset="utf-8"');
  headers.push("Content-Transfer-Encoding: 8bit");
  return [headers.join("\r\n"), "", text, ""].join("\r\n");
}

/** Versión en texto de un HTML, para la parte alternativa. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
