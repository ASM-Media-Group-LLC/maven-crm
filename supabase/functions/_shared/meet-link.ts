// ── Link de invitado (Meet y llamadas del Messenger) ────────────────────────
//
// Alvaro (17/11): «Meet igual que Google Meet, con gente de afuera». El
// invitado sin cuenta abre un link, escribe su nombre y entra: sin clave y sin
// sala de espera. El código de 6 letras NO sirve para eso: se adivina probando
// (31^6 ≈ 900 millones, con 8 intentos cada 10 min por IP se barre con una
// botnet). Por eso el link directo lleva un SECRETO aparte:
//
//     /unirse/<id de 32 hex>.<firma HMAC-SHA256 de 32 caracteres>
//
// La firma se calcula con un secreto del servidor (MEET_LINK_SECRET, y si no
// está, la service_role, que nunca sale de las edges). Así la base no guarda el
// link en claro —quien lea la tabla no puede armar links— y el anfitrión puede
// volver a pedir el mismo link las veces que quiera: se recalcula, no se busca.
//
// Lo que el link abre lo decide SIEMPRE la fila de meet_invite_links (sala,
// vencimiento, anulado), nunca lo que mande el navegador.

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secreto: string, texto: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`meet-link:${texto}`)));
  return b64url(sig).slice(0, 32);
}

/** Comparación de tiempo constante: no se filtra cuántos caracteres acertó. */
function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{32})$/;

const sinGuiones = (id: string) => id.replace(/-/g, "").toLowerCase();
const conGuiones = (h: string) =>
  `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

/** El texto del link para una fila de meet_invite_links. */
export async function firmarLink(id: string, secreto: string): Promise<string> {
  if (!UUID.test(id)) throw new Error("id de link inválido");
  if (!secreto) throw new Error("falta el secreto de los links");
  const h = sinGuiones(id);
  return `${h}.${await hmac(secreto, h)}`;
}

/** El id de la fila si la firma es buena; null si el link es falso o está roto. */
export async function verificarLink(raw: unknown, secreto: string): Promise<string | null> {
  if (typeof raw !== "string" || !secreto) return null;
  const m = LINK.exec(raw.trim());
  if (!m) return null;
  const esperada = await hmac(secreto, m[1]);
  return igualesSeguro(esperada, m[2]) ? conGuiones(m[1]) : null;
}

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** Cuánto vive un link nuevo.
 *  · Meet: 7 días (una reunión recurrente de la semana no obliga a mandar otro
 *    link), o hasta 12 h después de la hora agendada si es más tarde.
 *  · Llamada del Messenger: 24 h. Es «te llamo ahora», no una sala fija.
 *  Igual, al terminar la reunión el link deja de servir aunque no haya vencido. */
export function vencimientoDelLink(familia: "meet" | "llamada", ahora: Date, agendadaPara?: Date | null): Date {
  if (familia === "llamada") return new Date(ahora.getTime() + DIA);
  const semana = ahora.getTime() + 7 * DIA;
  const trasLaReunion = agendadaPara ? agendadaPara.getTime() + 12 * HORA : 0;
  return new Date(Math.max(semana, trasLaReunion));
}

/** Un link existente se reusa si le queda al menos una hora: compartir un link
 *  que vence en cinco minutos deja al invitado afuera. */
export function sirveParaReusar(venceEn: string | Date, ahora: Date): boolean {
  return new Date(venceEn).getTime() - ahora.getTime() > HORA;
}

/** Nombre del invitado como lo van a ver los de adentro: sin espacios de más,
 *  sin caracteres de control y con tope. null si no alcanza. */
export function nombreDeInvitado(raw: unknown): string | null {
  const limpio = String(raw ?? "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim().replace(/\s+/g, " ").slice(0, 40);
  return limpio.length >= 2 ? limpio : null;
}

/** Correos para la invitación de un Meet agendado: válidos, sin repetir, con tope. */
export function correosDeInvitacion(raw: unknown, tope = 25): string[] {
  const lista = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
  const ok = new Set<string>();
  for (const c of lista) {
    const e = String(c ?? "").trim().toLowerCase();
    if (e.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(e)) ok.add(e);
    if (ok.size >= tope) break;
  }
  return [...ok];
}
