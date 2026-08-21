// Cliente IMAP mínimo para Deno / edge functions.
//
// POR QUÉ ESCRIBIRLO A MANO: las librerías IMAP de npm asumen APIs de Node
// (net, tls, streams) que no existen acá. `Deno.connectTls` sí funciona
// —verificado contra imap.zoho.com:993— así que hacemos lo justo: conectar,
// autenticar, listar carpetas y seleccionar. Nada de IDLE ni extensiones.
//
// CÓMO FUNCIONA IMAP, para quien lea esto sin conocerlo: es un diálogo de
// líneas de texto. Cada comando del cliente lleva una ETIQUETA ("a001") y el
// servidor responde varias líneas que empiezan con `*` (datos) y cierra con
// una línea que repite la etiqueta y dice OK / NO / BAD. Hasta que no llega
// esa línea etiquetada, la respuesta está incompleta.

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Techo por comando. Las edge functions tienen límite de ejecución, así que
 *  un servidor que no responde no puede colgar la request entera. */
const CMD_TIMEOUT_MS = 15_000;
/** Conectar no puede esperar más que esto. Sin tope, un proveedor que
 *  estrangula (acepta el TCP y no manda nada) deja la función colgada
 *  hasta que el gateway la mate — y la persona ve esqueletos eternos. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Corre `p` contra un reloj DE VERDAD.
 *
 *  El patrón anterior chequeaba `Date.now()` ENTRE lecturas: si el servidor
 *  acepta la conexión y no manda nada (el tarpit clásico de un proveedor
 *  enojado), `conn.read()` bloquea para siempre y el reloj nunca se vuelve
 *  a mirar. Acá el timer corre en paralelo; al vencer, `onTimeout` cierra
 *  la conexión, lo que hace fallar también al read pendiente. */
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

export interface ImapResult {
  ok: boolean;
  /** Líneas de datos (las que empiezan con `*`). */
  lines: string[];
  /** Línea final etiquetada, útil para diagnosticar un NO/BAD. */
  completion: string;
  /** Respuesta cruda, literales incluidos. FETCH la necesita: el contenido
   *  de los mensajes viaja en literales y se perdería al partir por líneas. */
  raw: string;
  error?: string;
}

export class ImapClient {
  private conn: Deno.TlsConn;
  /** Lo leído del socket que todavía no se consumió. IMAP no garantiza que
   *  un read() traiga líneas completas, así que hay que acumular. */
  private buffer = "";
  private tagSeq = 0;

  private constructor(conn: Deno.TlsConn) {
    this.conn = conn;
  }

  static async connect(host: string, port: number): Promise<ImapClient> {
    const conn = await conReloj(
      Deno.connectTls({ hostname: host, port }),
      CONNECT_TIMEOUT_MS,
      "el servidor de correo no responde (timeout al conectar)",
    );
    const client = new ImapClient(conn);
    // El servidor saluda solo, antes de cualquier comando. Hay que
    // consumirlo o queda mezclado con la respuesta del primer comando.
    await client.readUntil((buf) => /^\*\s+(OK|PREAUTH|BYE)/im.test(buf));
    return client;
  }

  /** Lee del socket hasta que `done` sea true sobre lo acumulado. */
  private async readUntil(done: (buf: string) => boolean): Promise<string> {
    const deadline = Date.now() + CMD_TIMEOUT_MS;
    const chunk = new Uint8Array(8192);

    while (!done(this.buffer)) {
      const restante = deadline - Date.now();
      if (restante <= 0) {
        throw new Error("timeout esperando respuesta del servidor IMAP");
      }
      const n = await conReloj(
        this.conn.read(chunk),
        restante,
        "timeout esperando respuesta del servidor IMAP",
        () => this.conn.close(),
      );
      if (n === null) throw new Error("el servidor IMAP cerró la conexión");
      this.buffer += dec.decode(chunk.subarray(0, n));
    }
    const out = this.buffer;
    this.buffer = "";
    return out;
  }

  private nextTag(): string {
    return `a${String(++this.tagSeq).padStart(3, "0")}`;
  }

  /** Lee una respuesta completa siendo consciente de los LITERALES.
   *
   *  IMAP puede mandar bloques binarios anunciando su tamaño: una línea que
   *  termina en `{1234}` y después exactamente 1234 bytes de contenido
   *  arbitrario. Ese contenido puede incluir líneas que PARECEN el fin de la
   *  respuesta (por ejemplo un correo citando "a003 OK"), así que buscar la
   *  etiqueta sin saltear los literales corta la lectura a la mitad.
   *
   *  Por eso este lector avanza por tramos: lee línea, y si anuncia literal
   *  consume esos bytes en crudo antes de seguir buscando la etiqueta. */
  private async readResponse(tag: string): Promise<string> {
    const deadline = Date.now() + CMD_TIMEOUT_MS;
    const chunk = new Uint8Array(16384);
    const tagRe = new RegExp(`^${tag} (OK|NO|BAD)`, "i");
    let out = "";
    let pos = 0; // cuánto de `out` ya inspeccionamos

    const pull = async (): Promise<void> => {
      const restante = deadline - Date.now();
      if (restante <= 0) throw new Error("timeout esperando respuesta IMAP");
      const n = await conReloj(
        this.conn.read(chunk),
        restante,
        "timeout esperando respuesta IMAP",
        () => this.conn.close(),
      );
      if (n === null) throw new Error("el servidor IMAP cerró la conexión");
      out += dec.decode(chunk.subarray(0, n));
    };

    // Arrancamos con lo que quedó de una lectura anterior.
    out = this.buffer;
    this.buffer = "";

    for (;;) {
      const nl = out.indexOf("\r\n", pos);
      if (nl === -1) {
        await pull();
        continue;
      }
      const line = out.slice(pos, nl);
      pos = nl + 2;

      // ¿La línea anuncia un literal? Entonces los próximos N bytes son
      // datos crudos y NO se inspeccionan.
      const lit = line.match(/\{(\d+)\}$/);
      if (lit) {
        const need = Number(lit[1]);
        while (out.length - pos < need) await pull();
        pos += need;
        continue;
      }

      if (tagRe.test(line)) {
        // Guardamos lo que sobró para el próximo comando.
        this.buffer = out.slice(pos);
        return out.slice(0, pos);
      }
    }
  }

  /** Espera la línea de cierre de `tag` y arma el resultado. */
  private async awaitCompletion(tag: string): Promise<ImapResult> {
    // Buscamos la etiqueta como PREFIJO DE LÍNEA, no en cualquier parte:
    // si apareciera dentro de un dato, cortaríamos la respuesta a medias.
    const tagLine = new RegExp(`^${tag} (OK|NO|BAD)`, "im");
    let raw: string;
    try {
      raw = await this.readResponse(tag);
    } catch (e) {
      return { ok: false, lines: [], completion: "", raw: "", error: (e as Error).message };
    }
    const all = raw.split(/\r?\n/).filter((l) => l.length > 0);
    const completion = all.find((l) => tagLine.test(l)) ?? "";
    const ok = /\sOK\b/i.test(completion);
    return {
      ok,
      lines: all.filter((l) => l.startsWith("*")),
      completion,
      raw,
      error: ok ? undefined : completion.replace(/^\S+\s+(NO|BAD)\s*/i, ""),
    };
  }

  /** Manda un comando y espera su línea etiquetada de cierre. */
  private async command(raw: string): Promise<ImapResult> {
    const tag = this.nextTag();
    await this.conn.write(enc.encode(`${tag} ${raw}\r\n`));
    return await this.awaitCompletion(tag);
  }

  /** AUTHENTICATE PLAIN en vez de LOGIN: el password viaja en base64, así
   *  que no hay que escapar comillas ni barras. Con LOGIN, una contraseña con
   *  caracteres especiales rompe el comando de formas difíciles de ver. */
  async login(user: string, password: string): Promise<ImapResult> {
    const tag = this.nextTag();
    await this.conn.write(enc.encode(`${tag} AUTHENTICATE PLAIN\r\n`));

    // El servidor pide el payload con una línea que arranca con "+".
    try {
      await this.readUntil((b) => /^\+/m.test(b));
    } catch (e) {
      return { ok: false, lines: [], completion: "", raw: "", error: (e as Error).message };
    }

    // Formato SASL PLAIN: NUL + usuario + NUL + contraseña, en base64.
    // El \u0000 va como ESCAPE y no como byte literal: escrito literal es
    // invisible en el editor y cualquiera lo borra al reformatear, rompiendo
    // la autenticación de una forma imposible de ver leyendo el código.
    const payload = btoa(`\u0000${user}\u0000${password}`);
    await this.conn.write(enc.encode(`${payload}\r\n`));

    return await this.awaitCompletion(tag);
  }

  async listFolders(): Promise<{ ok: boolean; folders: string[]; error?: string }> {
    const res = await this.command('LIST "" "*"');
    if (!res.ok) return { ok: false, folders: [], error: res.error };

    // Cada línea es: * LIST (\Flags) "/" "Nombre"
    // El nombre puede venir entre comillas o suelto, y puede tener espacios.
    const folders: string[] = [];
    for (const line of res.lines) {
      const m = line.match(/^\*\s+LIST\s+\([^)]*\)\s+("[^"]*"|NIL)\s+(.+)$/i);
      if (!m) continue;
      folders.push(m[2].trim().replace(/^"(.*)"$/, "$1"));
    }
    return { ok: true, folders };
  }

  async selectFolder(
    folder: string,
  ): Promise<{ ok: boolean; exists: number; recent: number; error?: string }> {
    const res = await this.command(`SELECT "${folder.replace(/"/g, '\\"')}"`);
    if (!res.ok) return { ok: false, exists: 0, recent: 0, error: res.error };

    let exists = 0;
    let recent = 0;
    for (const line of res.lines) {
      const e = line.match(/^\*\s+(\d+)\s+EXISTS/i);
      if (e) exists = Number(e[1]);
      const r = line.match(/^\*\s+(\d+)\s+RECENT/i);
      if (r) recent = Number(r[1]);
    }
    return { ok: true, exists, recent };
  }

  /** Trae el resumen de un rango de mensajes (por número de secuencia).
   *
   *  Usamos BODY.PEEK[HEADER.FIELDS ...] en vez de ENVELOPE por dos razones:
   *  PEEK no marca el correo como leído (ENVELOPE tampoco, pero BODY[] sin
   *  PEEK sí, y es un error fácil de cometer), y los encabezados en texto se
   *  parsean con reglas conocidas de RFC 822 en vez de la sintaxis anidada y
   *  con comillas escapadas de ENVELOPE, que es una fuente clásica de bugs.
   */
  async fetchSummaries(
    from: number,
    to: number,
  ): Promise<{ ok: boolean; messages: MailSummary[]; error?: string }> {
    const fields = "FROM TO SUBJECT DATE MESSAGE-ID";
    const res = await this.command(
      `FETCH ${from}:${to} (UID FLAGS BODY.PEEK[HEADER.FIELDS (${fields})])`,
    );
    if (!res.ok) return { ok: false, messages: [], error: res.error };

    const messages: MailSummary[] = [];
    const raw = res.raw;

    // Caminamos la respuesta buscando cada bloque "* N FETCH (...".
    const blockRe = /^\* (\d+) FETCH \(/gm;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(raw)) !== null) {
      const seq = Number(m[1]);
      const head = raw.slice(m.index, raw.indexOf("\r\n", m.index));

      const uid = head.match(/UID (\d+)/)?.[1] ?? null;
      const flagsRaw = head.match(/FLAGS \(([^)]*)\)/)?.[1] ?? "";
      const flags = flagsRaw.split(/\s+/).filter(Boolean);

      // El literal arranca justo después de "{N}\r\n" de esta línea.
      const lit = head.match(/\{(\d+)\}$/);
      let headers: Record<string, string> = {};
      if (lit) {
        const start = raw.indexOf("\r\n", m.index) + 2;
        headers = parseHeaders(raw.slice(start, start + Number(lit[1])));
      }

      messages.push({
        seq,
        uid,
        flags,
        from: headers["from"] ?? "",
        to: headers["to"] ?? "",
        subject: headers["subject"] ?? "(sin asunto)",
        date: headers["date"] ?? "",
        messageId: headers["message-id"] ?? "",
        unread: !flags.some((f) => f.toLowerCase() === "\\seen"),
      });
    }

    // IMAP entrega en orden ascendente; la bandeja se lee al revés.
    messages.sort((a, b) => b.seq - a.seq);
    return { ok: true, messages };
  }

  /** Trae un mensaje completo en crudo (RFC 822), para parsear su MIME.
   *
   *  PEEK a propósito: sin el PEEK, IMAP marca el correo como leído con solo
   *  traerlo, y perderíamos el control de cuándo pasa eso.
   *
   *  `maxBytes` corta mensajes enormes: un correo con un adjunto de 25 MB
   *  haría que la edge function se muera por memoria o por timeout. Se trae
   *  el principio, que es donde viven los encabezados y el cuerpo. */
  async fetchRawMessage(
    seq: number,
    maxBytes = 512 * 1024,
  ): Promise<{ ok: boolean; raw: string; truncated: boolean; error?: string }> {
    const res = await this.command(`FETCH ${seq} (BODY.PEEK[]<0.${maxBytes}>)`);
    if (!res.ok) return { ok: false, raw: "", truncated: false, error: res.error };

    // La respuesta trae el mensaje como literal: buscamos el {N} y tomamos
    // esos N bytes exactos.
    const m = res.raw.match(/\{(\d+)\}\r\n/);
    if (!m || m.index === undefined) {
      return { ok: false, raw: "", truncated: false, error: "respuesta sin literal" };
    }
    const start = m.index + m[0].length;
    const len = Number(m[1]);
    return {
      ok: true,
      raw: res.raw.slice(start, start + len),
      truncated: len >= maxBytes,
    };
  }

  /** Marca un mensaje como leído. Explícito: lo decide la interfaz cuando el
   *  usuario abre el correo, no el hecho de traerlo. */
  async markSeen(seq: number): Promise<boolean> {
    const res = await this.command(`STORE ${seq} +FLAGS (\\Seen)`);
    return res.ok;
  }

  /** Igual, pero por UID — el identificador ESTABLE que usa la caché de
   *  Postgres (el seq se corre cuando se borra un mensaje anterior). */
  async markSeenUid(uid: number): Promise<boolean> {
    const res = await this.command(`UID STORE ${uid} +FLAGS (\\Seen)`);
    return res.ok;
  }

  async logout(): Promise<void> {
    try {
      await this.command("LOGOUT");
    } catch {
      // Si el servidor ya cortó, no importa: igual cerramos el socket.
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
// Decodificación de encabezados MIME (RFC 2047)
// ---------------------------------------------------------------------------
// Los asuntos con acentos o emoji no viajan en texto plano: vienen como
// "=?UTF-8?B?...?=" (base64) o "=?UTF-8?Q?...?=" (quoted-printable). Sin
// decodificar, la bandeja mostraría basura en cualquier correo en español.

function decodeQuotedPrintable(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "_") {
      // En encoded-words, "_" representa un espacio (no en QP de cuerpo).
      bytes.push(0x20);
    } else if (c === "=" && i + 2 < input.length) {
      bytes.push(parseInt(input.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0));
    }
  }
  return new Uint8Array(bytes);
}

function decodeBase64ToBytes(input: string): Uint8Array {
  const raw = atob(input.replace(/\s+/g, ""));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Decodifica los encoded-words de un encabezado. Deja el resto intacto. */
export function decodeMimeHeader(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_all, charset: string, kind: string, data: string) => {
      try {
        const bytes = kind.toUpperCase() === "B"
          ? decodeBase64ToBytes(data)
          : decodeQuotedPrintable(data);
        // Si el charset no lo soporta el runtime, TextDecoder tira; caemos
        // al valor original en vez de mostrar un error al usuario.
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return data;
      }
    },
  ).replace(/\?=\s+=\?/g, ""); // encoded-words partidos y pegados
}

/** Parsea encabezados RFC 822, uniendo las líneas continuadas (las que
 *  empiezan con espacio o tab pertenecen al encabezado anterior). */
export function parseHeaders(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  let current = "";

  const flush = () => {
    const idx = current.indexOf(":");
    if (idx > 0) {
      const name = current.slice(0, idx).trim().toLowerCase();
      out[name] = decodeMimeHeader(current.slice(idx + 1).trim());
    }
    current = "";
  };

  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current += " " + line.trim();
    } else {
      if (current) flush();
      current = line;
    }
  }
  if (current) flush();
  return out;
}

export interface MailSummary {
  seq: number;
  uid: string | null;
  flags: string[];
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  /** Sin la bandera \Seen = sin leer. */
  unread: boolean;
}
