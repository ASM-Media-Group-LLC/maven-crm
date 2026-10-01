// El feed del Messenger leído COMO la persona de la llave, para armar un timbre.
//
// ⚠️ LA REGLA DE ESTE ARCHIVO: el feed se lee con el MISMO código que usa el API
// (../public-api), por su única entrada (servirComoUsuario, que antes de leer mira el
// scope y que la base vea la sesión en la agencia de la llave), con la sesión de la
// persona (su RLS). Nunca con service_role ni con una copia de la consulta: así un
// timbre nunca apunta a algo que el feed no le devolvería al integrador. Un test lo
// verifica leyendo este archivo.
//
// ⚠️ Del feed sale el CONTENIDO de los mensajes (texto, adjuntos, remitentes). Aquí
// se queda SOLO con lo que va en el timbre —cuántos, en qué conversaciones y los
// cursores— y el resto se descarta en esta misma función: no sale ni al log, ni a la
// base, ni al cuerpo del timbre. El detalle de un 503 (que puede traer el mensaje de
// un error de la base) tampoco: se reduce a una clase cerrada.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clienteComoUsuario } from "../public-api/como-usuario.ts";
import { DETALLE_TOPE_CONVERSACIONES, servirComoUsuario } from "../public-api/recursos-como-usuario.ts";

/** Por qué no se pudo leer. Cerrada: nada de texto libre llega al log ni a la base. */
export type FallaDelFeed =
  /** La base o la sesión fallaron: se vuelve a intentar más tarde. */
  | "sesion" | "base" | "plazo" | "forma"
  /** No se arregla sola: más conversaciones que el tope, o el feed rechazó el pedido
   *  (cursor inválido, llave sin reglas, sin scope). */
  | "tope" | "feed_400" | "feed_403" | "feed_404";

/** Lo único que el despachador sabe de una página del feed. */
export type PaginaDelFeed =
  | {
    ok: true;
    /** Mensajes en la página (0 a 100). */
    cantidad: number;
    /** Las conversaciones de esos mensajes, sin repetir. */
    conversaciones: string[];
    /** El next_cursor del feed: desde aquí se lee la próxima. Texto opaco. */
    siguiente: string;
    /** Queda más por leer (página llena o todavía no se llegó al presente). */
    hayMas: boolean;
  }
  | { ok: false; permanente: boolean; falla: FallaDelFeed };

export interface PedidoDelFeed {
  /** La persona cuyas conversaciones lee la llave (= acts_as del endpoint). Es la
   *  misma para la sesión fabricada y para el contexto del feed. */
  persona: string;
  /** La agencia de la llave: la sesión fabricada tiene que ser de ESTA agencia. */
  agencia: string;
  scopes: string[];
  conWhitelist: boolean;
  venceEl: string | null;
  /** El cursor desde el que se lee. Texto opaco. */
  despues: string;
  sinPropios: boolean;
  /** Hasta cuándo (ms) puede tardar la lectura entera. */
  hastaMs: number;
}

export type LeerFeed = (p: PedidoDelFeed) => Promise<PaginaDelFeed>;

const NO_PERMANENTE = (falla: FallaDelFeed): PaginaDelFeed => ({ ok: false, permanente: false, falla });
const PERMANENTE = (falla: FallaDelFeed): PaginaDelFeed => ({ ok: false, permanente: true, falla });

/** Una página del feed con un cliente que YA es la persona. Nunca tira. */
export async function leerFeedCon(yo: SupabaseClient, p: PedidoDelFeed): Promise<PaginaDelFeed> {
  let r: Awaited<ReturnType<typeof servirComoUsuario>>;
  try {
    r = await servirComoUsuario("messenger", yo, {
      agenciaDeLaLlave: p.agencia,
      actuaComo: p.persona,
      scopes: p.scopes,
      ruta: ["feed"],
      consulta: { after: p.despues, exclude_own: p.sinPropios ? "true" : "false", limit: "100" },
      llave: { conWhitelist: p.conWhitelist, venceEl: p.venceEl },
      // Solo arma las URLs de los adjuntos, que aquí se descartan.
      baseDeArchivos: "",
      cupo: { limite: 0, restantes: 0, reinicio: new Date(0).toISOString() },
      idioma: "es",
      // Solo lee: el feed es un GET, sin cuerpo ni Idempotency-Key.
      metodo: "GET",
      cuerpo: null,
      idempotencia: null,
    });
  } catch {
    return NO_PERMANENTE("base");
  }
  if (!r.ok) {
    if ("detalle" in r) return clasificar503(r.detalle);
    if (r.estado === 400 || r.estado === 403 || r.estado === 404) return PERMANENTE(`feed_${r.estado}`);
    // Lo demás (un 405, un tope, una pausa) no lo devuelve un GET del feed: si llegara,
    // se vuelve a intentar más tarde, sin detener el endpoint.
    return NO_PERMANENTE("base");
  }
  return extraerDelFeed(r.cuerpo);
}

/** El 503 del feed, reducido a una clase. Se compara con el texto que exporta el
 *  propio feed (no con una copia) para el tope, y por prefijo para la sesión. */
export function clasificar503(detalle: string): PaginaDelFeed {
  if (detalle === DETALLE_TOPE_CONVERSACIONES) return PERMANENTE("tope");
  if (detalle.startsWith("current_tenant_id") || detalle.startsWith("la sesión fabricada")) return NO_PERMANENTE("sesion");
  return NO_PERMANENTE("base");
}

/** Cómo se fabrica la sesión de la persona (en producción, clienteComoUsuario). */
export type FabricarSesion = (persona: string, opciones: { fetch: typeof fetch }) => Promise<SupabaseClient | null>;

/** Una página del feed como la persona: fabrica la sesión (con un fetch que corta
 *  cada pedido a tiempo) y lee. Nunca tira. La fábrica se inyecta SOLO para probarla
 *  (clienteComoUsuario lee Deno.env y los tests corren sin --allow-env). */
export function crearLeerFeedComoPersona(fabricar: FabricarSesion = clienteComoUsuario): LeerFeed {
  return async (p) => {
    const conPlazo = fetchConPlazo(() => p.hastaMs - Date.now());
    let yo: SupabaseClient | null;
    try {
      yo = await fabricar(p.persona, { fetch: conPlazo });
    } catch {
      return NO_PERMANENTE("sesion");
    }
    // Sin MAVEN_JWT_SECRET no hay sesión: cerrado, nunca cae a service_role.
    if (!yo) return NO_PERMANENTE("sesion");
    const restante = Math.max(0, p.hastaMs - Date.now());
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const plazo = new Promise<PaginaDelFeed>((resolve) => {
      reloj = setTimeout(() => resolve(NO_PERMANENTE("plazo")), restante);
    });
    try {
      return await Promise.race([leerFeedCon(yo, p), plazo]);
    } finally {
      clearTimeout(reloj);
    }
  };
}

export const leerFeedComoPersona: LeerFeed = crearLeerFeedComoPersona();

/** fetch que corta cada pedido cuando se acaba el plazo (al menos 500 ms, a lo sumo
 *  5 s): una base lenta no puede estirar una corrida más allá de su reclamo. */
export function fetchConPlazo(restanteMs: () => number): typeof fetch {
  return async (entrada, init) => {
    // ⚠️ supabase-js (postgrest-js) REINTENTA por su cuenta todo GET/HEAD que falla por
    // red —incluido este corte, que llega como TimeoutError y no como AbortError— y todo
    // 503/520 (respetando Retry-After sin tope): hasta 3 veces, con 1+2+4 s de espera
    // que ningún plazo corta. Un pedido de 0,5 s se volvía 4 pedidos y 9 s justo con la
    // base caída. Aquí no se reintenta nada: el reintento lo decide el despachador (la
    // espera de 5 min, el freno). Un pedido que ya viene marcado como reintento se corta,
    // cualquier falla sale como AbortError (que no se reintenta) y un 503/520 como 502.
    if (new Headers(init?.headers).has("X-Retry-Count")) throw new DOMException("sin reintentos", "AbortError");
    const ms = Math.min(Math.max(restanteMs(), 500), 5_000);
    const corte = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, corte]) : corte;
    let r: Response;
    try {
      r = await fetch(entrada, { ...init, signal });
    } catch {
      throw new DOMException("fetchConPlazo", "AbortError");
    }
    if (r.status !== 503 && r.status !== 520) return r;
    return new Response(r.body, { status: 502, statusText: r.statusText, headers: r.headers });
  };
}

/** De la respuesta del feed, SOLO lo que va en el timbre. Pura, para testearla con
 *  una respuesta que traiga texto, adjuntos y remitentes. */
export function extraerDelFeed(cuerpo: unknown): PaginaDelFeed {
  const c = cuerpo as { data?: unknown; next_cursor?: unknown; has_more?: unknown };
  if (!c || !Array.isArray(c.data) || typeof c.next_cursor !== "string" || typeof c.has_more !== "boolean") {
    return NO_PERMANENTE("forma");
  }
  const conversaciones = new Set<string>();
  for (const m of c.data) {
    const id = (m as { conversation_id?: unknown } | null)?.conversation_id;
    if (typeof id !== "string") return NO_PERMANENTE("forma");
    conversaciones.add(id);
  }
  return { ok: true, cantidad: c.data.length, conversaciones: [...conversaciones], siguiente: c.next_cursor, hayMas: c.has_more };
}
