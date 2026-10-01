// Piezas PURAS del pedido: de qué IP viene, qué cabeceras de límite lleva, cómo se
// lee el cuerpo de una escritura y el fetch sin reintentos de los clientes.
// Separadas de index.ts para poder probarlas por COMPORTAMIENTO (con un Request de
// verdad y cabeceras falsificadas), no leyendo el texto del código.

// La IP de verdad la ponen Cloudflare (cf-connecting-ip) y el proxy de Supabase
// (x-real-ip), y el cliente no las puede cambiar. X-Forwarded-For NO: su primer
// valor lo escribe el que llama, así que con él cualquiera se ponía una IP de la
// whitelist y la whitelist no servía de nada. Tampoco X-Client-IP, True-Client-IP
// ni ninguna otra que venga del cliente.
export function clientIp(req: Request): string | null {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  return ip?.trim() || null;
}

function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) { const x = Number(o); if (!Number.isInteger(x) || x < 0 || x > 255) return null; n = (n << 8) + x; }
  return n >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const a = ipv4ToInt(ip), b = ipv4ToInt(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (a & mask) === (b & mask);
}

export function ipAllowed(ip: string | null, whitelist: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return true; // sin restricción
  if (!ip) return false;
  for (const entry of whitelist) {
    if (entry === ip) return true;
    if (entry.includes("/") && ipv4InCidr(ip, entry)) return true;
  }
  return false;
}

export type Cupo = {
  permitido: boolean; limite: number; restantes: number; reinicio: string;
  limite_minuto?: number | null; motivo?: "hora" | "minuto" | null;
};

/** Las cabeceras de límite y, si se rechaza, cuánto esperar. X-RateLimit-* son
 *  SIEMPRE los de la hora; si lo agotado es el minuto, `reinicio` es el próximo
 *  minuto y solo va en Retry-After. */
export function cabecerasDeCupo(c: Cupo, ahoraMs: number) {
  const porMinuto = c.motivo === "minuto";
  const reinicioSeg = Math.ceil(new Date(c.reinicio).getTime() / 1000);
  const reinicioHoraSeg = porMinuto ? Math.ceil(ahoraMs / 3_600_000) * 3_600 : reinicioSeg;
  return {
    porMinuto,
    cabeceras: {
      "X-RateLimit-Limit": String(c.limite),
      "X-RateLimit-Remaining": String(c.restantes),
      "X-RateLimit-Reset": String(reinicioHoraSeg),
    },
    esperaSeg: Math.max(1, reinicioSeg - Math.floor(ahoraMs / 1000)),
  };
}

// ─── El cuerpo de una escritura ──────────────────────────────────────────────

/** Tope del cuerpo de un POST/PATCH: 64 KB. Entran 4.000 emojis escritos con escapes
 *  (`\uXXXX\uXXXX`, 12 bytes cada uno: ≈ 48 KB) y el resto del JSON. */
export const CUERPO_MAX_BYTES = 64 * 1024;

export type CuerpoLeido =
  | { ok: true; texto: string }
  /** 400: no es UTF-8 válido; 413: pasa del tope; 415: no dice que es JSON. */
  | { ok: false; estado: 400 | 413 | 415 };

/** `application/json`, con `charset=utf-8` o sin charset. Cualquier otro tipo (o
 *  charset) no es un cuerpo que este API sepa leer. */
export function esJson(contentType: string | null): boolean {
  if (!contentType) return false;
  const [tipo, ...parametros] = contentType.split(";").map((p) => p.trim().toLowerCase());
  if (tipo !== "application/json") return false;
  for (const p of parametros) {
    if (p === "") continue;
    const [nombre, valor = ""] = p.split("=").map((x) => x.trim());
    if (nombre === "charset" && valor.replace(/^"|"$/g, "") !== "utf-8") return false;
  }
  return true;
}

/** Lee el cuerpo de un pedido con un tope DURO: mira el Content-Type (415), rechaza
 *  un Content-Length mayor que el tope sin leer nada (413) y, como el Content-Length
 *  puede faltar o mentir, lee en streaming y corta en cuanto pasa de `maxBytes`
 *  (413). Decodifica UTF-8 estricto (400 si no lo es). Nunca tira. */
export async function leerCuerpo(req: Request, maxBytes: number = CUERPO_MAX_BYTES): Promise<CuerpoLeido> {
  if (!esJson(req.headers.get("content-type"))) return { ok: false, estado: 415 };
  const largo = req.headers.get("content-length");
  if (largo !== null && (!/^\d+$/.test(largo.trim()) || Number(largo) > maxBytes)) return { ok: false, estado: 413 };
  if (!req.body) return { ok: true, texto: "" };
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await lector.cancel().catch(() => {});
        return { ok: false, estado: 413 };
      }
      partes.push(value);
    }
  } catch {
    return { ok: false, estado: 400 };
  }
  const bytes = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { bytes.set(p, i); i += p.byteLength; }
  try {
    return { ok: true, texto: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes) };
  } catch {
    return { ok: false, estado: 400 };
  }
}

// ─── fetch sin reintentos ────────────────────────────────────────────────────

/** fetch con plazo fijo y SIN reintentos escondidos, para los clientes de public-api.
 *
 *  ⚠️ supabase-js (postgrest-js) reintenta por su cuenta todo GET/HEAD que falla por
 *  red y todo 503/520 (respetando Retry-After sin tope), hasta 3 veces. En una
 *  escritura eso es peor que lento: el cliente no sabría cuántas veces se mandó.
 *  Aquí no se reintenta nada (como fetchConPlazo de messenger-webhooks/feed.ts):
 *   · un pedido que ya viene marcado como reintento (X-Retry-Count) se corta;
 *   · cualquier falla (red, plazo) sale como AbortError, que no se reintenta, y
 *     supabase-js la devuelve como un error SIN código (= resultado incierto);
 *   · un 503/520 sale como 502, que no se reintenta. */
export function fetchSinReintentos(plazoMs: number): typeof fetch {
  return async (entrada, init) => {
    if (new Headers(init?.headers).has("X-Retry-Count")) throw new DOMException("sin reintentos", "AbortError");
    const corte = AbortSignal.timeout(plazoMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, corte]) : corte;
    let r: Response;
    try {
      r = await fetch(entrada, { ...init, signal });
    } catch {
      throw new DOMException("fetchSinReintentos", "AbortError");
    }
    if (r.status !== 503 && r.status !== 520) return r;
    return new Response(r.body, { status: 502, statusText: r.statusText, headers: r.headers });
  };
}
