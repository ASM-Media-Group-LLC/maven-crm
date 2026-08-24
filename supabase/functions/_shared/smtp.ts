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
const CONNECT_TIMEOUT_MS = 10_000;

/** Reloj REAL contra la promesa (mismo arreglo que en imap.ts): el patrón
 *  de chequear Date.now() entre lecturas no sirve cuando el servidor acepta
 *  la conexión y no manda nada — el read bloquea y el reloj no se mira más.
 *  Al vencer, cerrar la conexión hace fallar también al read pendiente. */
async function conReloj<T>(
  p: Promise<T>,
  ms: number,
  mensaje: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reloj = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // ORDEN CRÍTICO: rechazar ANTES de cerrar. Cerrar hace que la
      // promesa original rechace con "Bad resource ID", y si ese rechazo
      // se encola primero le gana la carrera al nuestro — la persona ve
      // el error críptico del socket en vez del motivo real (pasó en
      // producción: "Bad resource ID" en la pantalla de Jhon).
      reject(new Error(mensaje));
      try {
        onTimeout?.();
      } catch {
        // cerrar una conexión ya muerta no es noticia
      }
    }, ms);
  });
  try {
    return await Promise.race([p, reloj]);
  } finally {
    clearTimeout(timer);
    // La promesa perdedora va a rechazar tarde (el socket cerrado) y ya
    // nadie la escucha: sin esto queda un "unhandled rejection" que puede
    // voltear el isolate entero.
    p.catch(() => {});
  }
}

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
    const conn = await conReloj(
      Deno.connectTls({ hostname: host, port }),
      CONNECT_TIMEOUT_MS,
      "el servidor de correo no responde (timeout al conectar)",
    );
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
      const restante = deadline - Date.now();
      if (restante <= 0) {
        return { ok: false, code: 0, message: "timeout esperando al servidor SMTP" };
      }
      let n: number | null;
      try {
        n = await conReloj(
          this.conn.read(chunk),
          restante,
          "timeout esperando al servidor SMTP",
          () => this.conn.close(),
        );
      } catch {
        return { ok: false, code: 0, message: "timeout esperando al servidor SMTP" };
      }
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
    // Cortafuegos: NADA que no sea una dirección limpia llega al socket.
    // Si algo raro llegó hasta acá, el envío falla entero — es preferible a
    // ejecutar comandos SMTP metidos por el atacante.
    if (!esDireccionSmtp(from)) {
      return { ok: false, code: 0, message: "remitente inválido" };
    }
    const sucio = recipients.find((r) => !esDireccionSmtp(r));
    if (sucio !== undefined) {
      return {
        ok: false,
        code: 0,
        message: `destinatario inválido: ${String(sucio).replace(/[\r\n]/g, "\\n").slice(0, 60)}`,
      };
    }

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
 *  Sin esto, un asunto con tildes llega roto o hace que el servidor rechace.
 *
 *  RFC 2047 §2 limita cada "encoded-word" a 75 caracteres. Antes se metía el
 *  valor ENTERO en uno solo: un asunto real como "Re: Seguimiento de la
 *  reunión de ayer con el equipo 🚀" daba 120+ chars, y los decodificadores
 *  estrictos muestran la basura cruda (`=?UTF-8?B?…`) en vez del asunto.
 *  Se corta en varias palabras plegadas con CRLF + espacio, sin partir un
 *  carácter multibyte por el medio (cortar un emoji = rombo con signo). */
export function encodeHeader(value: string): string {
  // El camino ASCII también se pliega: sin esto un asunto largo (o un
  // References, que acumula los ids de todo el hilo) salía como UNA línea
  // que pasa los 998 octetos del RFC 5322 y el servidor la rechaza. La
  // versión con tilde del MISMO asunto sí se plegaba: quedaba mitad y mitad.
  if (/^[\x20-\x7E]*$/.test(value)) return plegarAscii(value);
  const bytes = new TextEncoder().encode(value);
  // "=?UTF-8?B?" + "?=" son 12 chars; 45 bytes → 60 de base64 → 72 en total.
  const MAX_BYTES = 45;
  const palabras: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    let fin = Math.min(i + MAX_BYTES, bytes.length);
    // 0b10xxxxxx = continuación UTF-8: retroceder hasta el inicio del carácter.
    while (fin > i + 1 && fin < bytes.length && (bytes[fin] & 0xc0) === 0x80) fin--;
    // Cortar preferentemente DESPUÉS de un espacio. Partir a mitad de palabra
    // es legal, pero los decodificadores que no eliden el espacio entre
    // encoded-words (el camino de `phrase` del From es uno) muestran
    // "Coordinaci ón" — un nombre que parece mal escrito. Cortando en el
    // espacio, el peor caso es un espacio doble: feo pero legible.
    if (fin < bytes.length) {
      for (let j = fin - 1; j > i + Math.floor(MAX_BYTES / 2); j--) {
        if (bytes[j] === 0x20) { fin = j + 1; break; }
      }
    }
    const trozo = bytes.slice(i, fin);
    palabras.push(`=?UTF-8?B?${btoa(String.fromCharCode(...trozo))}?=`);
    i = fin;
  }
  return palabras.join("\r\n ");
}

/** Pliega un valor ASCII largo en líneas de <= 76 (RFC 5322 §2.2.3): la
 *  continuación arranca con un espacio, que es lo que la marca como parte
 *  del mismo encabezado. Un token suelto más largo que el límite (un
 *  message-id enorme) se deja entero: partirlo lo rompería. */
function plegarAscii(valor: string): string {
  if (valor.length <= 76) return valor;
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of valor.split(" ")) {
    if (actual && actual.length + 1 + palabra.length > 76) {
      lineas.push(actual);
      actual = ` ${palabra}`;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.join("\r\n");
}

/** Encabezado de lista de direcciones, plegado (RFC 5322 §2.2.3).
 *
 *  `To: a, b, c…` en UNA línea se pasa de los 998 octetos con ~30 direcciones
 *  — y ahora que hay campos libres de Cc y Cco, pegar una lista larga es lo
 *  natural. Se pliega con CRLF + espacio, que es continuación de la misma
 *  cabecera. */
function headerDeLista(nombre: string, direcciones: string[]): string {
  const partes = direcciones.map(sanitizeHeaderValue);
  const lineas: string[] = [];
  let actual = `${nombre}:`;
  partes.forEach((dir, idx) => {
    const item = idx < partes.length - 1 ? `${dir},` : dir;
    if (actual.length + 1 + item.length > 76) {
      lineas.push(actual);
      actual = ` ${item}`;
    } else {
      actual += ` ${item}`;
    }
  });
  lineas.push(actual);
  return lineas.join("\r\n");
}

/** ¿Es una dirección de correo que se puede poner en un comando SMTP?
 *
 *  🔴 CRÍTICO — INYECCIÓN DE COMANDOS SMTP. `MAIL FROM:<x>` y `RCPT TO:<x>`
 *  se escriben como UNA LÍNEA en el socket. Si la dirección trae \r\n, lo que
 *  vaya después se convierte en un COMANDO más dentro de la sesión ya
 *  autenticada: se puede colar un destinatario invisible (RCPT TO) o, peor,
 *  un segundo mensaje entero (DATA) firmado con el DKIM de la empresa —
 *  primitiva de suplantación lista para usar.
 *
 *  Por eso la validación vive ACÁ y no solo en el frontend o en la edge: es
 *  el último punto antes del socket y no se puede saltear llamando a la API
 *  directo. Deliberadamente estricta: sin espacios, sin comillas, sin < >,
 *  un solo @, y con punto en el dominio. */
export function esDireccionSmtp(v: unknown): v is string {
  return typeof v === "string" &&
    v.length <= 254 &&
    !/[\r\n\t\s<>",;:\\]/.test(v) &&
    /^[^@]+@[^@]+\.[^@]+$/.test(v);
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

/** Quoted-printable (RFC 2045): UTF-8 → ASCII de 7 bits con líneas de máximo
 *  76 caracteres. Resuelve TRES problemas de una: los emojis y acentos viajan
 *  sin depender de que cada relay soporte 8BITMIME, ninguna línea supera el
 *  límite de 998 del RFC 5321 (el HTML de un editor sale como UNA línea
 *  kilométrica), y el mensaje sobrevive reenvíos por servidores viejos. */
export function quotedPrintable(s: string): string {
  const bytes = new TextEncoder().encode(s.replace(/\r\n/g, "\n"));
  let plano = "";
  for (const b of bytes) {
    if ((b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9) {
      plano += String.fromCharCode(b);
    } else if (b === 10) {
      plano += "\n";
    } else {
      plano += "=" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return plano
    .split("\n")
    .map((linea) => {
      // Espacio o tab al FINAL de una línea dura debe encodearse.
      linea = linea.replace(/ $/, "=20").replace(/\t$/, "=09");
      const partes: string[] = [];
      while (linea.length > 75) {
        let corte = 75;
        // No partir un =XX por la mitad.
        if (linea[corte - 1] === "=") corte -= 1;
        else if (linea[corte - 2] === "=") corte -= 2;
        partes.push(linea.slice(0, corte) + "=");
        linea = linea.slice(corte);
      }
      partes.push(linea);
      return partes.join("\r\n");
    })
    .join("\r\n");
}

function boundary(): string {
  return `=_maven_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Prepara el display-name del From.
 *
 *  `full_name` lo edita el propio usuario en su perfil. Suelto y sin comillas
 *  permite construir un From que parece otra persona: un nombre como
 *  `Contabilidad <pagos@unlok.me> (via` deja el header con dos direcciones y
 *  varios clientes muestran la primera. Se sacan `< > "` y se encierra entre
 *  comillas; si tiene acentos o emojis va como encoded-word (que ya es un
 *  átomo y no necesita comillas). */
function nombreParaFrom(nombre: string): string {
  const base = sanitizeHeaderValue(nombre).replace(/[<>]/g, "").trim();
  if (/^[\x20-\x7E]*$/.test(base)) {
    // Dentro de un quoted-string los metacaracteres son DOS: la comilla y la
    // barra invertida (RFC 5322 `quoted-pair`). Borrar solo la comilla dejaba
    // que un nombre terminado en "\" la volviera a habilitar: el string no
    // cerraba nunca y se tragaba la dirección — el From salía sin remitente.
    // Se ESCAPAN en vez de borrarse, así "C:\Users\jhon" se lee entero.
    return `"${base.replace(/(["\\])/g, "\\$1")}"`;
  }
  // Con acentos o emojis va como encoded-word, que ya es un átomo.
  return encodeHeader(base);
}

/** Arma el RFC 822 listo para mandar. */
export function buildMessage(msg: OutgoingMessage): string {
  const b = boundary();
  const fromHeader = msg.fromName ? `${nombreParaFrom(msg.fromName)} <${msg.from}>` : msg.from;

  const headers: string[] = [
    `From: ${fromHeader}`,
    headerDeLista("To", msg.to),
  ];
  if (msg.cc?.length) headers.push(headerDeLista("Cc", msg.cc));
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
      "Content-Transfer-Encoding: quoted-printable",
      "",
      quotedPrintable(text),
      "",
      `--${b}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      quotedPrintable(msg.html),
      "",
      `--${b}--`,
      "",
    ].join("\r\n");
  }

  headers.push('Content-Type: text/plain; charset="utf-8"');
  headers.push("Content-Transfer-Encoding: quoted-printable");
  return [headers.join("\r\n"), "", quotedPrintable(text), ""].join("\r\n");
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
