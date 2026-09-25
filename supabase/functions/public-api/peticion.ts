// Piezas PURAS del pedido: de qué IP viene y qué cabeceras de límite lleva.
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
