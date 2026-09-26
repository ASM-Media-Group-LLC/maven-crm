// Salida de los webhooks del Messenger: todo lo que hace falta para mandarle un
// timbre al integrador SIN que eso se pueda usar para pegarle a otra cosa.
//
// Lo usan manage-api-keys (registrar la URL, mandar la prueba) y la función del
// cron que manda los timbres (PRs 3 y 4). Las tablas y sus reglas son de la
// migración 20260926120000_api_webhooks_tablas.sql.
//
// Qué hay acá, y por qué junto:
//   1. La URL: solo https, puerto 443, un nombre de dominio de verdad, y nada
//      nuestro ni de red interna. Se guarda el href normalizado y se manda ESE, y
//      se vuelve a mirar en CADA envío (una lista que crece alcanza también a los
//      endpoints ya registrados, que no se pueden editar).
//   2. Las IPs: cada dirección a la que resuelve el host tiene que ser pública.
//   3. El DNS: se resuelve en cada envío y, si no se puede, no se manda.
//   4. La conexión va a la IP que se verificó (no se vuelve a resolver), con el
//      certificado validado contra el nombre: así un DNS que cambia entre el
//      chequeo y la conexión (rebinding) no sirve para llegar a otro lado.
//   5. La firma Standard Webhooks, que el integrador verifica con la librería
//      oficial (standardwebhooks) sin escribir criptografía.
//   6. El secreto de firma cifrado con AES-GCM, atado a la fila (AAD).
//   7. El cuerpo del timbre: solo ids, cursores y cantidades. NUNCA texto.
//   8. Qué hacer con cada resultado: entregado, detener, o reintentar y cuándo.
//
// ⚠️ Este módulo no loguea NADA: ni la URL (puede llevar un token), ni los
// encabezados, ni la firma, ni el cuerpo, ni la respuesta. Quien lo usa loguea
// solo la clase de error y el código HTTP.
//
// No usa fetch() para mandar: fetch vuelve a resolver el DNS por su cuenta (el
// chequeo de IP quedaría separado de la conexión), y cuando algo se corta no
// dice si el cuerpo ya había salido. Acá eso importa: un corte DESPUÉS de mandar
// no es un fallo, es incertidumbre (la lección del correo que salió dos veces,
// #1868), y el timbre se reintenta con el mismo id.

import { codificarCursor, decodificarCursor } from "../public-api/messenger-formato.ts";
import { escribirTodo } from "./socket-write.ts";

// ─── 1. la URL ───────────────────────────────────────────────────────────────

export const URL_MAX = 2048;

/** Nombres nuestros, de red interna o que resuelven a lo que uno les pida. Se
 *  bloquea el nombre y todo lo que termine en `.nombre`. Los de Maven van porque
 *  un timbre firmado por Maven no tiene que poder pegarle a Maven: hay funciones
 *  que aceptan cualquier "Bearer" (memoria whatsapp_auth_falsa_22_funciones) y
 *  gateways del VPS publicados con nip.io/traefik.me. Un test exige que cada
 *  origen de _shared/cors.ts (ALLOWED_ORIGINS) caiga acá: un dominio nuevo de
 *  Maven que se sume allá y no acá hace fallar el CI. */
export const SUFIJOS_PROHIBIDOS: readonly string[] = [
  // Supabase (el proyecto y cualquier otro: el integrador no recibe ahí)
  "supabase.co", "supabase.in",
  // Maven y la empresa: los canónicos, los históricos (maven.asmtech.me sigue en
  // cors.ts) y el de Cowork en DuckDNS
  "maven-ai.me", "asmtech.ai", "asmtech.me", "unlok.me", "kashagency.me", "kash-agency.me",
  "coowork.duckdns.org",
  // DNS comodín: 10-0-0-1.nip.io resuelve a 10.0.0.1, y así los gateways del VPS
  "nip.io", "sslip.io", "xip.io", "traefik.me", "localtest.me", "lvh.me",
  // Red interna y nombres reservados que nunca son de internet
  "localhost", "localdomain", "local", "internal", "intranet", "lan", "home",
  "corp", "private", "home.arpa", "arpa", "test", "invalid", "example", "onion",
];

export type MotivoUrl =
  | "url_invalida" | "no_https" | "puerto" | "usuario" | "fragmento"
  | "muy_larga" | "ip_literal" | "host_invalido" | "host_prohibido";

export type UrlDeWebhook =
  | { ok: true; href: string; host: string }
  | { ok: false; motivo: MotivoUrl };

// La misma forma que exige la base (api_webhooks_host_de_url): minúsculas, al
// menos dos partes, cada una de 1 a 63, y la última empieza con letra (eso deja
// afuera las IPs escritas como número).
const HOST_VALIDO = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

export function esHostProhibido(host: string): boolean {
  return SUFIJOS_PROHIBIDOS.some((s) => host === s || host.endsWith("." + s));
}

/** Normaliza lo que pegó la persona y dice si sirve. Devuelve el href que se va a
 *  guardar y a mandar tal cual (la base no deja editarlo después). */
export function normalizarUrlDeWebhook(entrada: string): UrlDeWebhook {
  const texto = entrada.trim();
  // Antes de parsear: "https://a.com/#" deja hash vacío, pero el # estaba.
  if (texto.includes("#")) return { ok: false, motivo: "fragmento" };
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { ok: false, motivo: "url_invalida" };
  }
  if (url.protocol !== "https:") return { ok: false, motivo: "no_https" };
  if (url.username !== "" || url.password !== "") return { ok: false, motivo: "usuario" };
  // WHATWG deja el puerto vacío cuando es el de https (443).
  if (url.port !== "") return { ok: false, motivo: "puerto" };
  const host = url.hostname;
  if (host.startsWith("[") || IPV4_LITERAL.test(host)) return { ok: false, motivo: "ip_literal" };
  if (host.length > 253 || !HOST_VALIDO.test(host)) return { ok: false, motivo: "host_invalido" };
  if (esHostProhibido(host)) return { ok: false, motivo: "host_prohibido" };
  const href = url.href;
  if (href.length > URL_MAX) return { ok: false, motivo: "muy_larga" };
  // La base exige ASCII visible y sin barra invertida. WHATWG la pasa a "/" en el
  // camino pero la deja en la consulta: mejor rechazar que guardar otra URL.
  if (!/^[!-~]+$/.test(href) || href.includes("\\")) return { ok: false, motivo: "url_invalida" };
  return { ok: true, href, host };
}

// ─── 2. las IPs ──────────────────────────────────────────────────────────────

/** IPs públicas que igual son nuestras. Se bloquean en cada envío: un nombre
 *  nuestro que no esté en SUFIJOS_PROHIBIDOS (o uno de un tercero apuntado acá)
 *  no llega. Cuando se sume un servidor, sumarlo acá.
 *   - 147.93.3.97: el VPS de Dokploy (gateways de WhatsApp, Telegram, teléfonos,
 *     Whisper, Gotenberg, LiveKit) — infra/livekit/README.md, memoria dokploy.
 *   - 217.216.95.7: el segundo Dokploy (Oficina/ONLYOFFICE, Postgres del scouter)
 *     — docs/oficina-onlyoffice.md. */
export const IPS_PROPIAS: readonly string[] = ["147.93.3.97", "217.216.95.7"];

/** Solo la forma canónica (sin ceros a la izquierda): "012.0.0.1" es 12.0.0.1
 *  para unos y 10.0.0.1 (octal) para otros, así que no pasa. */
function ipv4ANumero(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let n = 0;
  for (const p of partes) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [red, bits] — RFC 6890 y compañía: nada de esto es un servidor de internet.
const IPV4_BLOQUEADAS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4EsPublica(ip: string): boolean {
  const n = ipv4ANumero(ip);
  if (n === null) return false;
  for (const [red, bits] of IPV4_BLOQUEADAS) {
    const r = ipv4ANumero(red)!;
    const tamano = 2 ** (32 - bits);
    if (n >= r && n < r + tamano) return false;
  }
  return !IPS_PROPIAS.includes(ip);
}

/** IPv6 → 8 grupos de 16 bits, o null si no es una IPv6 válida. Acepta "::" y
 *  la cola en IPv4 ("::ffff:1.2.3.4"). Una zona ("fe80::1%eth0") es inválida. */
function ipv6AGrupos(ip: string): number[] | null {
  if (ip.includes("%") || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  let texto = ip;
  let cola: number[] = [];
  const ultimoDosPuntos = texto.lastIndexOf(":");
  const posibleV4 = texto.slice(ultimoDosPuntos + 1);
  if (posibleV4.includes(".")) {
    const n = ipv4ANumero(posibleV4);
    if (n === null) return null;
    cola = [Math.floor(n / 65536), n % 65536];
    texto = texto.slice(0, ultimoDosPuntos + 1) + "0:0";
  }
  const dobles = texto.split("::");
  if (dobles.length > 2) return null;
  const aGrupos = (s: string) => (s === "" ? [] : s.split(":"));
  const izq = aGrupos(dobles[0]);
  const der = dobles.length === 2 ? aGrupos(dobles[1]) : [];
  const faltan = 8 - izq.length - der.length;
  if (dobles.length === 1 ? faltan !== 0 : faltan < 1) return null;
  const grupos: number[] = [];
  for (const g of [...izq, ...Array(dobles.length === 2 ? faltan : 0).fill("0"), ...der]) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    grupos.push(parseInt(g, 16));
  }
  if (grupos.length !== 8) return null;
  if (cola.length) {
    grupos[6] = cola[0];
    grupos[7] = cola[1];
  }
  return grupos;
}

function ipv6EsPublica(ip: string): boolean {
  const g = ipv6AGrupos(ip);
  if (!g) return false;
  // NAT64 (64:ff9b::/96): lo que vale es la IPv4 de adentro.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return ipv4EsPublica(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  // Solo unicast global (2000::/3), y ni siquiera todo.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] < 0x0200) return false; // 2001::/23: Teredo, ORCHID, pruebas
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // 2001:db8::/32: documentación
  if (g[0] === 0x2002) return false; // 6to4 (2002::/16)
  // 3ff0::/12: incluye 3fff::/20 (documentación, RFC 9637); el resto no está asignado.
  if ((g[0] & 0xfff0) === 0x3ff0) return false;
  return true;
}

/** ¿Se le puede mandar un POST a esta dirección? Todo lo que no sea una IP válida
 *  y pública da falso. */
export function ipEsPublica(ip: string): boolean {
  return ip.includes(":") ? ipv6EsPublica(ip) : ipv4EsPublica(ip);
}

// ─── 3. el DNS ───────────────────────────────────────────────────────────────

/** Lo mínimo de Deno.resolveDns que se usa (inyectable para los tests). */
export type Resolvedor = (host: string, tipo: "A" | "AAAA", opciones: { signal: AbortSignal }) => Promise<string[]>;

export type Direcciones =
  | { ok: true; direcciones: string[] }
  | { ok: false; clase: "dns" | "direccion_bloqueada" };

export const PLAZO_DNS_MS = 3_000;

const resolvedorDeDeno: Resolvedor = (host, tipo, opciones) => Deno.resolveDns(host, tipo, opciones);

/** A y AAAA a la vez. Si CUALQUIER dirección no es pública, no se manda (aunque
 *  otras lo sean). Si no hay ninguna, o el DNS no contesta, tampoco: nunca se
 *  deja pasar por no poder verificar. Que falte un tipo (sin AAAA) es normal;
 *  que uno falle y el otro no, también: solo se conecta a direcciones
 *  verificadas, así que lo que no se pudo mirar no se usa. */
export async function direccionesPublicas(
  host: string,
  resolver: Resolvedor = resolvedorDeDeno,
  plazoMs = PLAZO_DNS_MS,
): Promise<Direcciones> {
  const signal = AbortSignal.timeout(Math.max(0, plazoMs));
  const [a, aaaa] = await Promise.allSettled([
    resolver(host, "A", { signal }),
    resolver(host, "AAAA", { signal }),
  ]);
  const todas = [
    ...(a.status === "fulfilled" ? a.value : []),
    ...(aaaa.status === "fulfilled" ? aaaa.value : []),
  ];
  const unicas = [...new Set(todas)];
  if (unicas.length === 0) return { ok: false, clase: "dns" };
  if (unicas.some((ip) => !ipEsPublica(ip))) return { ok: false, clase: "direccion_bloqueada" };
  return { ok: true, direcciones: unicas };
}

// ─── 4 y 5. la firma (Standard Webhooks) ─────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Sobre un ArrayBuffer propio, como en mail-crypto.ts: WebCrypto pide
// Uint8Array<ArrayBuffer>, no ArrayBufferLike.
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const PREFIJO_SECRETO = "whsec_";

/** Un secreto nuevo: whsec_ + 33 bytes al azar en base64 (44 caracteres, sin el
 *  "=" de relleno que tendrían 32: así los últimos 4, lo que se guarda para
 *  reconocerlo, son 4 caracteres que dicen algo). Se muestra UNA vez. */
export function generarSecreto(): { secreto: string; ultimos4: string } {
  const secreto = PREFIJO_SECRETO + b64(crypto.getRandomValues(new Uint8Array(33)));
  return { secreto, ultimos4: secreto.slice(-4) };
}

function claveDelSecreto(secreto: string): Uint8Array<ArrayBuffer> {
  if (!secreto.startsWith(PREFIJO_SECRETO)) throw new Error("webhooks: secreto sin prefijo whsec_");
  const clave = unb64(secreto.slice(PREFIJO_SECRETO.length));
  if (clave.length < 24 || clave.length > 64) throw new Error("webhooks: secreto de largo inválido");
  return clave;
}

/** "v1,<base64 de HMAC-SHA256(clave, id.timestamp.cuerpo)>", como lo verifica la
 *  librería oficial. timestamp en segundos. */
export async function firmar(secreto: string, id: string, timestamp: number, cuerpo: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    claveDelSecreto(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, enc.encode(`${id}.${timestamp}.${cuerpo}`));
  return `v1,${b64(new Uint8Array(firma))}`;
}

/** Los tres encabezados de Standard Webhooks. La hora es la del INTENTO (cada
 *  reintento firma de nuevo, así pasa la ventana de 5 min del receptor); el id y
 *  el cuerpo son los de siempre. */
export async function encabezadosFirmados(
  secreto: string,
  id: string,
  cuerpo: string,
  ahoraMs: number,
): Promise<Record<string, string>> {
  const timestamp = Math.floor(ahoraMs / 1000);
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": await firmar(secreto, id, timestamp, cuerpo),
  };
}

// ─── 6. el secreto guardado (AES-GCM con AAD) ────────────────────────────────

export const VERSION_KEK_ACTUAL = 1;
/** Una KEK más corta que esto se toma como NO configurada: mejor no mandar que
 *  cifrar con una clave que se adivina. */
export const KEK_MINIMO = 32;

export interface SecretoSellado {
  cipher: string;
  nonce: string;
  version: number;
}

/** De dónde sale la KEK (inyectable para los tests). v1 = WEBHOOK_SIGNING_KEK;
 *  para rotar: WEBHOOK_SIGNING_KEK_V2, y las filas viejas se abren con la vieja
 *  hasta que se vuelven a cifrar (la base deja subir la versión). */
export type LeerEntorno = (nombre: string) => string | undefined;
const entornoDeDeno: LeerEntorno = (n) => Deno.env.get(n);

function nombreDeKek(version: number): string {
  return version === 1 ? "WEBHOOK_SIGNING_KEK" : `WEBHOOK_SIGNING_KEK_V${version}`;
}

async function kek(version: number, entorno: LeerEntorno): Promise<CryptoKey | null> {
  if (!Number.isInteger(version) || version < 1) return null;
  const raw = entorno(nombreDeKek(version));
  if (!raw || raw.length < KEK_MINIMO) return null;
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** ¿Está cargada la KEK actual? Sin ella no se crea ni se manda nada
 *  (config_error), y nunca se cae a otra cosa. */
export function kekConfigurada(entorno: LeerEntorno = entornoDeDeno): boolean {
  const raw = entorno(nombreDeKek(VERSION_KEK_ACTUAL));
  return !!raw && raw.length >= KEK_MINIMO;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** El id del endpoint como lo devuelve la base (uuid en minúscula). Se sella con
 *  ESTA forma: sellar con "8C1E…" y abrir con el "8c1e…" que devuelve la base no
 *  abriría nunca, y el secreto ya se le mostró al integrador. */
function idCanonico(endpointId: string): string | null {
  if (typeof endpointId !== "string") return null;
  const id = endpointId.toLowerCase();
  return UUID.test(id) ? id : null;
}

const aad = (endpointId: string, version: number) => enc.encode(`${endpointId}|${version}`);

/** Cifra el secreto para ESTA fila: el AAD lleva el id del endpoint y la versión,
 *  así que el cifrado copiado a otra fila no abre. null si no hay KEK. Tira si el
 *  id no es un UUID: mejor fallar en el alta, antes de mostrar el secreto. */
export async function sellarSecreto(
  secreto: string,
  endpointId: string,
  entorno: LeerEntorno = entornoDeDeno,
  version = VERSION_KEK_ACTUAL,
): Promise<SecretoSellado | null> {
  const id = idCanonico(endpointId);
  if (!id) throw new Error("webhooks: el id del endpoint no es un UUID");
  const clave = await kek(version, entorno);
  if (!clave) return null;
  // Nonce nuevo cada vez: repetirlo con la misma clave rompe AES-GCM.
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad(id, version) },
    clave,
    enc.encode(secreto),
  );
  return { cipher: b64(new Uint8Array(buf)), nonce: b64(nonce), version };
}

/** null si falta la KEK de esa versión, si el cifrado es de otra fila, o si lo
 *  tocaron: no se distingue el motivo a propósito. */
export async function abrirSecreto(
  sellado: SecretoSellado,
  endpointId: string,
  entorno: LeerEntorno = entornoDeDeno,
): Promise<string | null> {
  const id = idCanonico(endpointId);
  if (!id) return null;
  const clave = await kek(sellado.version, entorno);
  if (!clave) return null;
  try {
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(sellado.nonce), additionalData: aad(id, sellado.version) },
      clave,
      unb64(sellado.cipher),
    );
    return dec.decode(buf);
  } catch {
    return null;
  }
}

// ─── 7. el cuerpo: solo ids, cursores y cantidades ───────────────────────────

export const CUERPO_MAX = 16_384; // el CHECK de api_webhook_deliveries.body

const PREFIJO_LLAVE = /^[A-Za-z0-9_]{1,40}$/;

/** El cursor tiene que ser uno que el feed arma y acepta, en su forma CANÓNICA
 *  (decodificar y volver a codificar da lo mismo): así after/until no pueden
 *  llevar ninguna otra cosa en base64, y el integrador nunca recibe un after que
 *  el feed le rechace. Se usa el codificador DEL FEED, no una copia. */
function cursorCanonico(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const c = decodificarCursor(s);
  return c !== null && codificarCursor(c) === s;
}

export interface DatosDelTimbre {
  id: string;
  creadoEn: Date;
  prefijoLlave: string;
  cantidad: number;
  hayMas: boolean;
  conversaciones: string[];
  sinPropios: boolean;
  /** el cursor con el que se leyó el feed */
  despues: string;
  /** el next_cursor que devolvió el feed */
  hasta: string;
}

function validarComun(id: string, creadoEn: Date, prefijoLlave: string) {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("webhooks: id de timbre inválido");
  if (!(creadoEn instanceof Date) || Number.isNaN(creadoEn.getTime())) throw new Error("webhooks: fecha inválida");
  if (typeof prefijoLlave !== "string" || !PREFIJO_LLAVE.test(prefijoLlave)) {
    throw new Error("webhooks: prefijo de llave inválido");
  }
}

function comoTexto(cuerpo: unknown): string {
  const texto = JSON.stringify(cuerpo);
  if (enc.encode(texto).length > CUERPO_MAX) throw new Error("webhooks: cuerpo demasiado grande");
  return texto;
}

/** El cuerpo del timbre, UNA vez: se guarda en api_webhook_deliveries.body y se
 *  firma y manda idéntico en cada intento. Se arma campo por campo a propósito:
 *  aunque le pasen un mensaje entero, solo salen estas claves. */
export function cuerpoDelTimbre(d: DatosDelTimbre): string {
  validarComun(d.id, d.creadoEn, d.prefijoLlave);
  if (!Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > 100) {
    throw new Error("webhooks: la cantidad va de 1 a 100");
  }
  if (typeof d.hayMas !== "boolean" || typeof d.sinPropios !== "boolean") {
    throw new Error("webhooks: hayMas y sinPropios son booleanos");
  }
  if (!Array.isArray(d.conversaciones)) throw new Error("webhooks: conversaciones inválidas");
  const conversaciones = [...new Set(d.conversaciones)];
  if (
    conversaciones.length < 1 || conversaciones.length > 100 ||
    !conversaciones.every((c) => typeof c === "string" && UUID.test(c))
  ) {
    throw new Error("webhooks: conversaciones inválidas");
  }
  if (!cursorCanonico(d.despues) || !cursorCanonico(d.hasta)) throw new Error("webhooks: cursor inválido");
  return comoTexto({
    id: d.id,
    type: "messages.created",
    api_version: "v1",
    created_at: d.creadoEn.toISOString(),
    key_prefix: d.prefijoLlave,
    data: {
      count: d.cantidad,
      has_more: d.hayMas,
      conversation_ids: conversaciones,
      exclude_own: d.sinPropios,
      after: d.despues,
      until: d.hasta,
      fetch: `/messenger/feed?after=${d.despues}&exclude_own=${d.sinPropios}`,
    },
  });
}

/** La prueba de "Enviar prueba": mismo formato y misma firma, sin datos. */
export function cuerpoDePrueba(d: { id: string; creadoEn: Date; prefijoLlave: string }): string {
  validarComun(d.id, d.creadoEn, d.prefijoLlave);
  return comoTexto({
    id: d.id,
    type: "webhook.test",
    api_version: "v1",
    created_at: d.creadoEn.toISOString(),
    key_prefix: d.prefijoLlave,
    data: {},
  });
}

// ─── el envío ────────────────────────────────────────────────────────────────

export const AGENTE = "Maven-Webhooks/1";
/** Todo el intento: DNS, conexión, TLS, mandar y esperar el código. */
export const PLAZO_ENVIO_MS = 10_000;
/** Por dirección (TCP + TLS juntos): si la primera no conecta, queda tiempo para
 *  otra. Como mucho 4 direcciones por intento. */
export const PLAZO_CONEXION_MS = 4_000;
export const DIRECCIONES_POR_INTENTO = 4;
/** La respuesta se lee hasta el fin de los encabezados y ni un byte más. El tope
 *  cuenta TODO lo leído, 1xx incluidos: un receptor que manda "100 Continue" sin
 *  parar no puede tener ocupado el lector (el límite de CPU de la edge es 2 s). */
export const ENCABEZADOS_MAX = 16_384;
export const INTERINOS_MAX = 8;

/** Lo mínimo de una conexión TLS (inyectable para los tests). */
export interface Conexion {
  write(p: Uint8Array): Promise<number>;
  read(p: Uint8Array): Promise<number | null>;
  close(): void;
}

/** Abre TCP a `ip` y TLS validando el certificado contra `host`, todo dentro de
 *  `plazoMs`. Tira ErrorDeTls si el TCP anduvo y el TLS no, y Vencido si se acabó
 *  el plazo. */
export type Conectar = (ip: string, host: string, plazoMs: number) => Promise<Conexion>;

export class ErrorDeTls extends Error {}
export class Vencido extends Error {}

function cerrarSinRuido(c: { close(): void } | null | undefined) {
  try {
    c?.close();
  } catch {
    // cerrar algo ya muerto no es noticia
  }
}

async function conPlazo<T>(p: Promise<T>, ms: number, alVencer: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reloj = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Vencido("plazo"));
      try {
        alVencer();
      } catch {
        // cerrar algo ya muerto no es noticia
      }
    }, Math.max(0, ms));
  });
  try {
    return await Promise.race([p, reloj]);
  } finally {
    clearTimeout(timer);
    p.catch(() => {});
  }
}

/** Una conexión TLS abierta pero con el handshake todavía por hacer. */
export type TlsSinHandshake = Conexion & { handshake(): Promise<unknown> };

/** Las dos llamadas de Deno que abren la conexión (inyectables para los tests). */
export interface Red {
  conectarTcp(ip: string, puerto: number): Promise<{ close(): void }>;
  iniciarTls(tcp: { close(): void }, host: string): Promise<TlsSinHandshake>;
}

// TCP a la IP que se verificó (Deno.connect no vuelve a resolver una IP literal),
// y el TLS con hostname = el NOMBRE: es el del certificado y el del SNI. Solo
// HTTP/1.1: no se anuncia h2. NO usar connectTls: resuelve el nombre por su cuenta.
const redDeDeno: Red = {
  conectarTcp: (ip, puerto) => Deno.connect({ hostname: ip, port: puerto }),
  iniciarTls: (tcp, host) => Deno.startTls(tcp as Deno.TcpConn, { hostname: host, alpnProtocols: ["http/1.1"] }),
};

/** El Conectar de verdad. Un solo límite para TCP + TLS. Deno.connect no se puede
 *  cancelar: si la conexión llega después del plazo, se cierra al llegar.
 *  ⚠️ En Deno 2.9.5, cerrar un TLS con el handshake pendiente no libera el socket
 *  hasta que muere el worker: queda como mucho uno por dirección probada. */
export function crearConectar(red: Red = redDeDeno): Conectar {
  return async (ip, host, plazoMs) => {
    const limite = Date.now() + plazoMs;
    let vencio = false;
    const conectando = red.conectarTcp(ip, 443);
    conectando.then((c) => {
      if (vencio) cerrarSinRuido(c);
    }, () => {});
    const tcp = await conPlazo(conectando, plazoMs, () => {
      vencio = true;
    });
    let tls: TlsSinHandshake | undefined;
    try {
      tls = await red.iniciarTls(tcp, host);
      const t = tls;
      await conPlazo(t.handshake(), limite - Date.now(), () => t.close());
      return t;
    } catch (e) {
      cerrarSinRuido(tls ?? tcp);
      if (e instanceof Vencido) throw e;
      throw new ErrorDeTls(e instanceof Error ? e.message : "tls");
    }
  };
}

export type Resultado =
  /** El receptor contestó: acá está el código. */
  | { tipo: "respuesta"; estado: number; retryAfterS: number | null; latenciaMs: number }
  /** No salió ni un byte del cuerpo: es un fallo seguro. host_prohibido: la URL
   *  guardada ya no pasa la validación (nunca se va a mandar). */
  | {
    tipo: "sin_enviar";
    clase: "host_prohibido" | "dns" | "direccion_bloqueada" | "conexion" | "tls" | "plazo";
    latenciaMs: number;
  }
  /** El pedido salió entero y no hubo una respuesta legible: puede haber llegado. */
  | { tipo: "incierto"; clase: "plazo" | "cortado" | "respuesta_invalida"; latenciaMs: number };

export interface Envio {
  href: string;
  cuerpo: string;
  encabezados: Record<string, string>;
  resolver?: Resolvedor;
  conectar?: Conectar;
  plazoMs?: number;
  ahora?: () => number;
}

const ENCABEZADO_SEGURO = /^[A-Za-z0-9-]+$/;
const VALOR_SEGURO = /^[\x20-\x7e]*$/;

function armarPedido(url: URL, cuerpo: Uint8Array, encabezados: Record<string, string>): Uint8Array {
  const lineas = [
    `POST ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${url.hostname}`,
    `User-Agent: ${AGENTE}`,
    "Content-Type: application/json",
    `Content-Length: ${cuerpo.length}`,
    "Connection: close",
  ];
  for (const [k, v] of Object.entries(encabezados)) {
    // Sin saltos de línea ni nada raro: un encabezado no puede inyectar otro.
    if (!ENCABEZADO_SEGURO.test(k) || !VALOR_SEGURO.test(v)) throw new Error("webhooks: encabezado inválido");
    lineas.push(`${k}: ${v}`);
  }
  const cabeza = enc.encode(lineas.join("\r\n") + "\r\n\r\n");
  const todo = new Uint8Array(cabeza.length + cuerpo.length);
  todo.set(cabeza, 0);
  todo.set(cuerpo, cabeza.length);
  return todo;
}

/** Retry-After en segundos, o como fecha HTTP. null si no vino o no se entiende. */
export function leerRetryAfter(valor: string | null, ahoraMs: number): number | null {
  if (valor === null) return null;
  const v = valor.trim();
  if (/^\d{1,9}$/.test(v)) return Number(v);
  const fecha = Date.parse(v);
  if (Number.isNaN(fecha)) return null;
  return Math.max(0, Math.ceil((fecha - ahoraMs) / 1000));
}

type Encabezado = { estado: number; retryAfter: string | null };

/** Del bloque de encabezados: el código y el Retry-After. null si no es HTTP.
 *  Acepta fin de línea con o sin \r (RFC 9112 §2.2 lo permite al que recibe). */
function leerBloque(texto: string): Encabezado | null {
  const lineas = texto.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const m = /^HTTP\/1\.[01] (\d{3})(?: .*)?$/.exec(lineas[0]);
  if (!m) return null;
  let retryAfter: string | null = null;
  for (const l of lineas.slice(1)) {
    const i = l.indexOf(":");
    if (i > 0 && l.slice(0, i).trim().toLowerCase() === "retry-after") retryAfter = l.slice(i + 1).trim();
  }
  return { estado: Number(m[1]), retryAfter };
}

/** Dónde termina un bloque de encabezados: la línea vacía ("\n\n" o "\n\r\n",
 *  que cubre el "\r\n\r\n" de siempre), buscada en los BYTES a partir de `desde`
 *  (un byte que no es UTF-8 no corre la cuenta). null si todavía no llegó. */
function finDeEncabezados(b: Uint8Array, desde: number): { fin: number; largo: number } | null {
  for (let i = Math.max(0, desde); i < b.length; i++) {
    if (b[i] !== 10) continue;
    if (b[i + 1] === 10) return { fin: i, largo: 2 };
    if (b[i + 1] === 13 && b[i + 2] === 10) return { fin: i, largo: 3 };
  }
  return null;
}

/** Lee hasta el primer código final (saltea hasta INTERINOS_MAX respuestas 1xx,
 *  como 103 Early Hints) y no toca el cuerpo de la respuesta. */
async function leerEstado(conn: Conexion, hastaMs: number, ahora: () => number): Promise<Encabezado | "invalida"> {
  let buffer = new Uint8Array(0);
  const trozo = new Uint8Array(4096);
  let inicio = 0; // dónde empieza el bloque actual
  let buscado = 0; // hasta dónde ya se buscó el fin
  let interinos = 0;
  while (true) {
    // -2: el separador puede haber quedado partido entre dos lecturas
    const f = finDeEncabezados(buffer, Math.max(inicio, buscado - 2));
    if (f) {
      const bloque = leerBloque(dec.decode(buffer.subarray(inicio, f.fin)));
      if (!bloque) return "invalida";
      if (bloque.estado >= 200) return bloque;
      if (bloque.estado < 100 || ++interinos > INTERINOS_MAX) return "invalida";
      inicio = buscado = f.fin + f.largo;
      continue;
    }
    buscado = buffer.length;
    if (buffer.length > ENCABEZADOS_MAX) return "invalida";
    const restante = hastaMs - ahora();
    if (restante <= 0) throw new Vencido("plazo");
    const n = await conPlazo(conn.read(trozo), restante, () => conn.close());
    if (n === null) return "invalida";
    const nuevo = new Uint8Array(buffer.length + n);
    nuevo.set(buffer, 0);
    nuevo.set(trozo.subarray(0, n), buffer.length);
    buffer = nuevo;
  }
}

/** Manda UN intento. Todo lo que viene de la red o del receptor termina en un
 *  Resultado. Tira SOLO ante un error del que llama: encabezados con caracteres
 *  que no van (y eso se mira antes de tocar el DNS). */
export async function enviarWebhook(e: Envio): Promise<Resultado> {
  const ahora = e.ahora ?? Date.now;
  const inicio = ahora();
  const hasta = inicio + (e.plazoMs ?? PLAZO_ENVIO_MS);
  const latencia = () => Math.max(0, ahora() - inicio);

  // El nombre se vuelve a mirar en CADA envío, no solo al registrar.
  const n = normalizarUrlDeWebhook(e.href);
  if (!n.ok || n.href !== e.href) return { tipo: "sin_enviar", clase: "host_prohibido", latenciaMs: latencia() };
  const url = new URL(n.href);
  const pedido = armarPedido(url, enc.encode(e.cuerpo), e.encabezados);

  const dns = await direccionesPublicas(url.hostname, e.resolver, Math.min(PLAZO_DNS_MS, hasta - ahora()));
  if (!dns.ok) return { tipo: "sin_enviar", clase: dns.clase, latenciaMs: latencia() };

  const conectar = e.conectar ?? crearConectar();
  let conn: Conexion | null = null;
  let ultimaClase: "conexion" | "tls" | "plazo" = "conexion";
  for (const ip of dns.direcciones.slice(0, DIRECCIONES_POR_INTENTO)) {
    const restante = hasta - ahora();
    if (restante <= 0) {
      ultimaClase = "plazo";
      break;
    }
    try {
      conn = await conectar(ip, url.hostname, Math.min(PLAZO_CONEXION_MS, restante));
      break;
    } catch (err) {
      ultimaClase = err instanceof ErrorDeTls ? "tls" : err instanceof Vencido ? "plazo" : "conexion";
    }
  }
  if (!conn) return { tipo: "sin_enviar", clase: ultimaClase, latenciaMs: latencia() };

  try {
    const restante = hasta - ahora();
    if (restante <= 0) return { tipo: "sin_enviar", clase: "plazo", latenciaMs: latencia() };
    try {
      await escribirTodo(conn, pedido, restante, "del integrador");
    } catch {
      // Un pedido a medias no lo procesa ningún servidor: no salió.
      return { tipo: "sin_enviar", clase: "conexion", latenciaMs: latencia() };
    }
    // Desde acá el pedido salió ENTERO: cualquier corte es incertidumbre.
    let r: Encabezado | "invalida";
    try {
      r = await leerEstado(conn, hasta, ahora);
    } catch (err) {
      return { tipo: "incierto", clase: err instanceof Vencido ? "plazo" : "cortado", latenciaMs: latencia() };
    }
    if (r === "invalida") return { tipo: "incierto", clase: "respuesta_invalida", latenciaMs: latencia() };
    return {
      tipo: "respuesta",
      estado: r.estado,
      retryAfterS: leerRetryAfter(r.retryAfter, ahora()),
      latenciaMs: latencia(),
    };
  } finally {
    cerrarSinRuido(conn);
  }
}

// ─── 8. qué hacer con el resultado ───────────────────────────────────────────

/** `error` es lo que va a last_error (≤ 60 caracteres, una clase, nunca un cuerpo).
 *
 *  Para los PRs 3 y 4:
 *   - `incierto` es de ESTE intento; en la fila se acumula (uncertain = previo OR
 *     incierto): una vez que no sabemos si llegó, no lo sabemos más.
 *   - En una PRUEBA solo cuenta `entregado`: un 410 en la prueba de un endpoint
 *     pending no detiene nada (queda pending y se muestra el código).
 *   - El timbre y el endpoint se anotan con el intento ANTES de cambiar el estado
 *     del endpoint (contrato de la sección 5 de la migración). */
export type Decision =
  /** 2xx: entregado. */
  | { accion: "entregado"; codigo: number; error: null }
  /** 410 (receiver_gone) o una URL que ya no se acepta (config_error): se detiene
   *  en el acto y se descarta el timbre. */
  | { accion: "detener"; motivo: "receiver_gone" | "config_error"; codigo: number | null; error: string }
  /** Cualquier otra cosa: reintentar más tarde con el mismo id y el mismo cuerpo. */
  | { accion: "reintentar"; codigo: number | null; error: string; incierto: boolean; retryAfterS: number | null };

/** Un 3xx NO se sigue: cuenta como fallo, igual que un 408, un 429, un 5xx u
 *  otro 4xx. */
export function decidir(r: Resultado): Decision {
  if (r.tipo === "respuesta") {
    if (r.estado >= 200 && r.estado < 300) return { accion: "entregado", codigo: r.estado, error: null };
    if (r.estado === 410) return { accion: "detener", motivo: "receiver_gone", codigo: 410, error: "http_410" };
    return { accion: "reintentar", codigo: r.estado, error: `http_${r.estado}`, incierto: false, retryAfterS: r.retryAfterS };
  }
  if (r.tipo === "sin_enviar" && r.clase === "host_prohibido") {
    return { accion: "detener", motivo: "config_error", codigo: null, error: "host_prohibido" };
  }
  return { accion: "reintentar", codigo: null, error: r.clase, incierto: r.tipo === "incierto", retryAfterS: null };
}

/** Espera antes de cada reintento: 30 s, 2 min, 10 min, 30 min, 1 h, 2 h, 4 h, 8 h
 *  y de ahí cada 8 h. Con el ±20 % de azar caben entre 14 y 18 intentos en 72 h
 *  (16 con el azar en el medio). */
export const ESPERAS_S: readonly number[] = [30, 120, 600, 1_800, 3_600, 7_200, 14_400, 28_800];
/** Retry-After se respeta hasta 1 h: más que eso, manda nuestra espera. */
export const RETRY_AFTER_MAX_S = 3_600;
/** 72 h fallando sin parar: se detiene (receiver_failing) y se descarta el timbre. */
export const HORIZONTE_MS = 72 * 3_600 * 1_000;

/** Cuándo reintentar (ms desde epoch), con ±20 % de azar para que los reintentos
 *  de varios endpoints no caigan juntos. `fallos` cuenta el que acaba de pasar. */
export function proximoIntento(fallos: number, ahoraMs: number, retryAfterS: number | null, azar: () => number = Math.random): number {
  const i = Math.min(Math.max(fallos, 1), ESPERAS_S.length) - 1;
  const conAzar = ESPERAS_S[i] * (0.8 + 0.4 * Math.min(Math.max(azar(), 0), 1));
  const pedido = retryAfterS === null ? 0 : Math.min(Math.max(retryAfterS, 0), RETRY_AFTER_MAX_S);
  return ahoraMs + Math.round(Math.max(conAzar, pedido) * 1_000);
}

/** ¿Ya pasaron 72 h desde que empezó a fallar? Se mira DESPUÉS de anotar cada
 *  fallo (sección 5 de la migración): el primer fallo a partir de las 72 h
 *  detiene el endpoint, así que eso cae entre las 72 h y las ~81,6 h. */
export function vencioElHorizonte(fallandoDesde: Date | null, ahoraMs: number): boolean {
  return fallandoDesde !== null && ahoraMs - fallandoDesde.getTime() >= HORIZONTE_MS;
}
