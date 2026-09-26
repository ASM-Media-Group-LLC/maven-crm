// El despachador de timbres del Messenger: lo que corre cada vez que el cron
// despierta a messenger-webhooks.
//
// Una corrida reclama hasta 5 endpoints con trabajo (60 s de reclamo) y a cada uno
// le hace UNA cosa: reintentar su timbre pendiente, o leer el feed como la persona
// y, si hay mensajes, crear un timbre y mandarlo. Todo dentro de PRESUPUESTO_MS; las
// escrituras de después del envío tienen su propio plazo, así que una corrida nunca
// vive más que su reclamo.
//
// Vive aparte de index.ts para poder probarlo: todo lo que toca la base pasa por
// `DatosDespacho` (./datos.ts sobre supabase-js; en los tests, una base en memoria y
// el banco PGlite contra la migración real).
//
// El contrato con la base (migraciones 20260926120000 y 20260926160000):
//   * toda escritura sobre el endpoint va con su reclamo (lease_until), status active
//     y el cursor GUARDADO (cursor_at + cursor_id). Toda activación cambia el cursor,
//     así que un Resume en el medio deja sin efecto lo que esta corrida escriba
//     después. 0 filas = perdió: no escribe ni manda nada más;
//   * toda escritura sobre un timbre va con state = pending: 0 filas = lo pausaron o
//     detuvieron mientras salía. Carrera perdida, no un fallo;
//   * el cursor y el timbre nuevo se escriben juntos (api_webhooks_timbrar);
//   * ANTES de mandar se anota el intento: la racha de fallos y la próxima espera en
//     el endpoint, y el intento en el timbre. Si la corrida se muere a mitad del envío
//     (el runtime corta un trabajo en segundo plano), el turno siguiente ya encuentra
//     el fallo contado y espera: nunca queda un reenvío cada 15 s;
//   * después de mandar, primero el timbre y después el endpoint, una sola escritura
//     final (la que suelta el reclamo);
//   * toda falla PROPIA (la base, la llave, el feed) termina con una espera de 5 min y
//     una clase maven_* en last_error; nunca un reintento en el turno siguiente. No
//     suma consecutive_failures: eso es del receptor (72 h → receiver_failing).
//
// ⚠️ Los instantes (lease_until, cursor_at, los cursores del feed) son TEXTO OPACO:
// no pasan por Date (que recorta a milisegundos) ni se comparan en JS. Toda
// comparación la hace la base, en el filtro de la escritura.
//
// ⚠️ Los logs llevan SOLO ids, acciones, clases, códigos y milisegundos (anotar(),
// con tipos cerrados). Nunca la URL (puede llevar un token), el cuerpo, los
// encabezados, el secreto, ni el mensaje o el detalle de un error de la base.

import {
  abrirSecreto,
  cuerpoDelTimbre,
  decidir as decidirEntrega,
  encabezadosFirmados,
  enviarWebhook,
  kekConfigurada,
  type LeerEntorno,
  PLAZO_ENVIO_MS,
  proximoIntento,
  type Resolvedor,
  vencioElHorizonte,
} from "../_shared/webhook-salida.ts";
import { decidir as decidirAislamiento } from "../public-api/aislamiento.ts";
import { codificarCursor, decodificarCursor } from "../public-api/messenger-formato.ts";
import type { FallaDelFeed, LeerFeed, PaginaDelFeed } from "./feed.ts";

export const SCOPE_WEBHOOK = "messenger:read";
/** Lo que dura la parte de una corrida que lee y manda. */
export const PRESUPUESTO_MS = 20_000;
/** Lo que puede tardar CADA escritura de después del envío (y la de la espera). */
export const PLAZO_DESPUES_MS = 5_000;
export const RECLAMO_MAX = 5;
export const RECLAMO_S = 60;
export const EN_PARALELO = 4;
/** Páginas del feed por corrida, entre TODOS los endpoints (cada una mira como mucho
 *  1 h). Lo que falte se camina en el turno siguiente. */
export const PAGINAS_POR_CORRIDA = 48;
/** No se empieza una lectura ni una escritura previa con menos que esto. */
export const MINIMO_PARA_LEER_MS = 2_000;
/** No se manda con menos que esto: el timbre queda para el turno siguiente. */
export const MINIMO_PARA_MANDAR_MS = 3_000;
/** Lo que se le deja a las escrituras de después, fuera del plazo del envío. */
export const MARGEN_ESCRITURA_MS = 2_000;
/** Si falla algo nuestro (la base, la llave, el feed), no el receptor. */
export const ESPERA_FALLA_PROPIA_MS = 5 * 60_000;

// ─── lo que se lee y se escribe ──────────────────────────────────────────────

/** El endpoint tal como lo devuelve api_webhooks_reclamar (los instantes, como
 *  texto de PostgREST). */
export interface Endpoint {
  id: string;
  tenant_id: string;
  api_key_id: string;
  acts_as_user_id: string;
  url: string;
  exclude_own: boolean;
  status: string;
  secret_cipher: string;
  secret_nonce: string;
  secret_key_version: number;
  cursor_at: string;
  cursor_id: string;
  lease_until: string;
  consecutive_failures: number;
  failing_since: string | null;
  last_error: string | null;
}

export interface LlaveDespacho {
  id: string;
  tenant_id: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  acts_as_user_id: string;
  ip_whitelist: string[] | null;
}

export interface Timbre {
  id: string;
  body: string;
  attempts: number;
  uncertain: boolean;
}

/** Una lectura: null en `valor` es "no hay"; ok:false es "no se pudo saber". */
export type Lectura<T> = { ok: true; valor: T } | { ok: false };

/** Con qué se condiciona cada escritura sobre el endpoint. Todo, texto opaco. */
export interface Guarda {
  id: string;
  tenantId: string;
  /** lease_until tal como lo devolvió el reclamo. */
  reclamo: string;
  /** El cursor GUARDADO: cambia solo después de una escritura que tocó la fila. */
  cursorAt: string;
  cursorId: string;
}

/** true = tocó la fila; false = 0 filas (perdió la guarda); null = error de la base. */
export type Escrito = boolean | null;
/** "antes" de mandar: con el presupuesto de la corrida. "despues": plazo propio. */
export type Fase = "antes" | "despues";

export interface DatosDespacho {
  /** Filas en tenants; null si no se pudo contar. */
  agencias(): Promise<number | null>;
  /** El respaldo de api_webhooks_por_agencias: detiene TODO endpoint no detenido con
   *  multi_agency. La ÚNICA escritura sin guarda de reclamo. */
  detenerPorAgencias(): Promise<boolean>;
  /** api_webhooks_reclamar(max, segundos); null si falló. */
  reclamar(max: number, segundos: number): Promise<Endpoint[] | null>;
  llave(id: string, tenantId: string): Promise<Lectura<LlaveDespacho | null>>;
  llaveVigente(id: string): Promise<Lectura<boolean>>;
  timbrePendiente(endpointId: string, tenantId: string): Promise<Lectura<Timbre | null>>;
  /** api_webhooks_timbrar: avanza el cursor (con la guarda) y crea el timbre, juntos.
   *  "ya_hay_uno" = 23505 (y el cursor no se movió). */
  timbrar(
    g: Guarda,
    nuevo: { t: string; i: string },
    timbre: { id: string; body: string; cantidad: number },
    limpiarError: boolean,
  ): Promise<"ok" | "perdio" | "ya_hay_uno" | "error">;
  /** UPDATE … WHERE id, tenant, lease_until, status = active, cursor_at, cursor_id. */
  actualizarEndpoint(g: Guarda, cambios: Record<string, unknown>, fase: Fase): Promise<Escrito>;
  /** UPDATE … WHERE id, tenant, state = pending. */
  anotarTimbre(id: string, tenantId: string, cambios: Record<string, unknown>, fase: Fase): Promise<Escrito>;
  /** lease_until = null WHERE id, tenant, lease_until = el nuestro (sin mirar el
   *  estado: si lo pausaron, igual se suelta). */
  soltar(id: string, tenantId: string, reclamo: string): Promise<void>;
}

// ─── los logs: solo tipos cerrados ───────────────────────────────────────────

export type MotivoDetencion =
  | "key_revoked" | "key_expired" | "scope_removed" | "person_inactive" | "config_error"
  | "receiver_gone" | "receiver_failing";

export type AccionLog =
  | "sin_configurar" | "puerta" | "multi_agency" | "reclamo" | "freno"
  | "entregado" | "reintentar" | "detenido" | "al_dia" | "cursor" | "espera"
  | "perdio" | "ya_hay_timbre" | "sin_tiempo" | "error";

export type ClaseLog =
  | FallaDelFeed | MotivoDetencion
  | "llave" | "vigencia" | "timbre" | "timbrar" | "adelanto" | "anotacion" | "secreto" | "cuerpo"
  | "interno" | "varias_agencias" | "agencias_sin_verificar";

export interface DetalleLog {
  clase?: ClaseLog;
  timbre?: string;
  intento?: number;
  /** El código HTTP del receptor, o la clase de decidir() de webhook-salida (que solo
   *  arma http_<n> o una clase fija: nunca texto del receptor). */
  envio?: number | string | null;
  ms?: number;
}

/** El único armado de una línea de log. */
export function lineaDeLog(endpoint: string | null, accion: AccionLog, d: DetalleLog = {}): string {
  let l = `[messenger-webhooks] ${endpoint ?? "-"} ${accion}`;
  if (d.clase) l += ` ${d.clase}`;
  if (d.timbre) l += ` timbre ${d.timbre}`;
  if (d.intento !== undefined) l += ` intento ${d.intento}`;
  if (d.envio !== undefined && d.envio !== null) l += ` ${d.envio}`;
  if (d.ms !== undefined) l += ` ${d.ms}ms`;
  return l;
}

// ─── la corrida ──────────────────────────────────────────────────────────────

export interface Entorno {
  datos: DatosDespacho;
  leerFeed: LeerFeed;
  /** ¿Está MAVEN_JWT_SECRET? Sin él no hay sesión como la persona. */
  sesionConfigurada: () => boolean;
  /** Cuándo vence el presupuesto (ms). Por defecto, ahora + PRESUPUESTO_MS. */
  fin?: number;
  enviar?: typeof enviarWebhook;
  entorno?: LeerEntorno;
  resolver?: Resolvedor;
  ahora?: () => number;
  uuid?: () => string;
  azar?: () => number;
  log?: (linea: string) => void;
}

export interface Informe {
  estado: number;
  cuerpo: { ok: boolean; motivo?: ClaseLog | "sin_configurar" | "reclamo"; resultados?: { id: string; accion: AccionLog }[] };
}

interface Corrida {
  datos: DatosDespacho;
  leerFeed: LeerFeed;
  enviar: typeof enviarWebhook;
  entorno?: LeerEntorno;
  resolver?: Resolvedor;
  ahora: () => number;
  uuid: () => string;
  azar?: () => number;
  anotar: (endpoint: string | null, accion: AccionLog, d?: DetalleLog) => AccionLog;
  fin: number;
  /** Páginas del feed leídas en esta corrida (entre todos los endpoints). */
  paginas: number;
  /** Hubo un error de la base: no se empieza ningún endpoint más. */
  frenar: boolean;
}

/** Una corrida. Nunca tira: todo termina en un Informe (solo ids y acciones). */
export async function despachar(e: Entorno): Promise<Informe> {
  const ahora = e.ahora ?? Date.now;
  const log = e.log ?? ((l: string) => console.log(l));
  const c: Corrida = {
    datos: e.datos,
    leerFeed: e.leerFeed,
    enviar: e.enviar ?? enviarWebhook,
    entorno: e.entorno,
    resolver: e.resolver,
    ahora,
    uuid: e.uuid ?? (() => crypto.randomUUID()),
    azar: e.azar,
    anotar: (endpoint, accion, d) => {
      log(lineaDeLog(endpoint, accion, d));
      return accion;
    },
    fin: e.fin ?? ahora() + PRESUPUESTO_MS,
    paginas: 0,
    frenar: false,
  };

  // Sin los secretos no se puede ni leer como la persona ni firmar: no se reclama
  // nada (y NO se detienen endpoints por algo que se arregla cargando el secreto).
  if (!e.sesionConfigurada() || !kekConfigurada(e.entorno)) {
    c.anotar(null, "sin_configurar");
    return { estado: 503, cuerpo: { ok: false, motivo: "sin_configurar" } };
  }

  // La misma puerta del API: con dos o más agencias el Messenger se apaga.
  let agencias: number | null;
  try {
    agencias = await c.datos.agencias();
  } catch {
    agencias = null;
  }
  const puerta = decidirAislamiento("messenger", agencias);
  if (!puerta.ok) {
    if (puerta.estado === 403) {
      // Respaldo del trigger (que ante un error solo deja un WARNING): se detiene todo.
      let ok = false;
      try {
        ok = await c.datos.detenerPorAgencias();
      } catch {
        ok = false;
      }
      c.anotar(null, ok ? "multi_agency" : "error", { clase: "varias_agencias" });
      return { estado: 200, cuerpo: { ok: true, motivo: "varias_agencias", resultados: [] } };
    }
    c.anotar(null, "puerta", { clase: "agencias_sin_verificar" });
    return { estado: 200, cuerpo: { ok: true, motivo: "agencias_sin_verificar", resultados: [] } };
  }

  let reclamados: Endpoint[] | null;
  try {
    reclamados = await c.datos.reclamar(RECLAMO_MAX, RECLAMO_S);
  } catch {
    reclamados = null;
  }
  if (reclamados === null) {
    c.anotar(null, "reclamo");
    return { estado: 503, cuerpo: { ok: false, motivo: "reclamo" } };
  }

  const resultados = await enParalelo(reclamados, EN_PARALELO, async (ep) => {
    // Con la base fallando no se sigue: los que no se tocaron quedan reclamados, sin
    // escribir nada, y el reclamo de 60 s hace de espera.
    if (c.frenar) return { id: ep.id, accion: c.anotar(ep.id, "freno") };
    return { id: ep.id, accion: await atender(ep, c) };
  });
  return { estado: 200, cuerpo: { ok: true, resultados } };
}

async function enParalelo<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(xs.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < xs.length) {
      const i = siguiente++;
      salida[i] = await f(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, trabajador));
  return salida;
}

/** Por qué una llave ya no sirve para un webhook, o null si sirve. */
export function motivoDeLlave(l: LlaveDespacho | null, ep: Endpoint, ahoraMs: number): MotivoDetencion | null {
  if (!l || l.revoked_at) return "key_revoked";
  if (!l.expires_at || !(Date.parse(l.expires_at) > ahoraMs)) return "key_expired";
  if (!l.scopes.includes(SCOPE_WEBHOOK)) return "scope_removed";
  // La base ya exige todo esto para una llave con Messenger; si igual llegara una
  // así, no se usa.
  if (!(l.ip_whitelist ?? []).length) return "config_error";
  if (l.acts_as_user_id !== ep.acts_as_user_id || l.tenant_id !== ep.tenant_id) return "config_error";
  return null;
}

/** La clase maven_* que queda en last_error por una falla propia (≤ 60 caracteres). */
function errorPropio(clase: ClaseLog): string {
  return `maven_${clase}`;
}

async function atender(ep: Endpoint, c: Corrida): Promise<AccionLog> {
  const d = c.datos;
  const g: Guarda = { id: ep.id, tenantId: ep.tenant_id, reclamo: ep.lease_until, cursorAt: ep.cursor_at, cursorId: ep.cursor_id };
  const queda = () => c.fin - c.ahora();
  /** El reclamo quedó en null por una escritura nuestra. */
  let suelto = false;
  /** Una escritura de espera falló: el reclamo (60 s) hace de espera, no se suelta. */
  let retener = false;
  const anotar = (accion: AccionLog, det?: DetalleLog) => c.anotar(ep.id, accion, det);
  /** Una lectura o escritura previa falló por la base: se frena la corrida. */
  const baseCaida = () => {
    c.frenar = true;
  };

  /** Escritura sobre el endpoint; `final` = la que suelta el reclamo. */
  const escribir = async (cambios: Record<string, unknown>, fase: Fase, final: boolean): Promise<Escrito> => {
    const r = await d.actualizarEndpoint(g, final ? { ...cambios, lease_until: null } : cambios, fase);
    if (r === null) baseCaida();
    if (r === true && final) suelto = true;
    return r;
  };
  /** Falla propia: espera de 5 min + la clase en last_error, y suelta. */
  const esperar = async (clase: ClaseLog, extra: Record<string, unknown> = {}): Promise<AccionLog> => {
    const r = await escribir(
      { ...extra, next_attempt_at: new Date(c.ahora() + ESPERA_FALLA_PROPIA_MS).toISOString(), last_error: errorPropio(clase) },
      "despues",
      true,
    );
    if (r === null) retener = true;
    return anotar(r === false ? "perdio" : "espera", { clase });
  };
  const detener = async (motivo: MotivoDetencion, fase: Fase, extra: Record<string, unknown> = {}, clase?: ClaseLog) => {
    const r = await escribir(
      { ...extra, status: "disabled", disabled_reason: motivo, disabled_at: "now", paused_at: null, paused_by: null },
      fase,
      true,
    );
    if (r === null) retener = true;
    return anotar(r === true ? "detenido" : r === false ? "perdio" : "error", { clase: clase ?? motivo });
  };

  try {
    if (queda() < MINIMO_PARA_LEER_MS) return anotar("sin_tiempo");

    // ── a. la llave y su persona, en cada vuelta ──
    const l = await d.llave(ep.api_key_id, ep.tenant_id);
    if (!l.ok) {
      baseCaida();
      return await esperar("llave");
    }
    const motivo = motivoDeLlave(l.valor, ep, c.ahora());
    if (motivo) return await detener(motivo, "antes");
    const llave = l.valor!;
    const v = await d.llaveVigente(llave.id);
    if (!v.ok) {
      baseCaida();
      return await esperar("vigencia");
    }
    if (!v.valor) return await detener("person_inactive", "antes");

    // ── b. el secreto ── (la clave está: se miró al empezar; si igual no abre, no se
    // arregla sola)
    const secreto = await abrirSecreto(
      { cipher: ep.secret_cipher, nonce: ep.secret_nonce, version: ep.secret_key_version },
      ep.id,
      c.entorno,
    );
    if (!secreto) return await detener("config_error", "antes", {}, "secreto");

    // ── c. ¿hay un timbre pendiente? se reintenta ──
    const t = await d.timbrePendiente(ep.id, ep.tenant_id);
    if (!t.ok) {
      baseCaida();
      return await esperar("timbre");
    }
    let timbre = t.valor;
    const limpiarError = ep.last_error?.startsWith("maven_") ?? false;

    // ── d. si no, el feed como la persona ──
    if (!timbre) {
      // `lectura` avanza en memoria con cada página vacía; la guarda (g) no.
      let lectura = codificarCursor({ t: ep.cursor_at, i: ep.cursor_id });
      let pagina: PaginaDelFeed | null = null;
      while (c.paginas < PAGINAS_POR_CORRIDA && queda() >= MINIMO_PARA_LEER_MS) {
        c.paginas++;
        pagina = await c.leerFeed({
          persona: ep.acts_as_user_id,
          agencia: ep.tenant_id,
          scopes: llave.scopes,
          conWhitelist: (llave.ip_whitelist ?? []).length > 0,
          venceEl: llave.expires_at,
          despues: lectura,
          sinPropios: ep.exclude_own,
          hastaMs: c.fin,
        });
        if (!pagina.ok || pagina.cantidad > 0 || !pagina.hayMas) break;
        // Página vacía con más por delante (la ventana de 1 h): se sigue desde ahí.
        lectura = pagina.siguiente;
      }
      // Lo que se avanzó en vacío, para guardarlo aunque después falle algo.
      const avanzado = decodificarCursor(lectura);
      const mover = (cur: { t: string; i: string } | null) =>
        cur && (cur.t !== g.cursorAt || cur.i !== g.cursorId) ? { cursor_at: cur.t, cursor_id: cur.i } : {};

      if (pagina === null) return anotar("sin_tiempo");
      if (!pagina.ok) {
        if (pagina.permanente) return await detener("config_error", "antes", {}, pagina.falla);
        if (pagina.falla === "sesion" || pagina.falla === "base" || pagina.falla === "plazo") baseCaida();
        return await esperar(pagina.falla, mover(avanzado));
      }
      if (pagina.cantidad === 0) {
        // Nada para avisar: el cursor avanza hasta donde se leyó.
        const r = await escribir({ ...mover(decodificarCursor(pagina.siguiente)), ...(limpiarError ? { last_error: null } : {}) }, "antes", true);
        if (r === null) {
          retener = true;
          return anotar("error", { clase: "base" });
        }
        return anotar(r === false ? "perdio" : pagina.hayMas ? "cursor" : "al_dia");
      }

      // Hay mensajes: el cursor y el timbre se guardan juntos, ANTES de mandar. Si
      // la función se corta después, el turno siguiente lo encuentra pendiente.
      const hasta = decodificarCursor(pagina.siguiente);
      if (!hasta) return await esperar("forma");
      const id = c.uuid();
      let cuerpo: string;
      try {
        cuerpo = cuerpoDelTimbre({
          id,
          creadoEn: new Date(c.ahora()),
          prefijoLlave: llave.key_prefix,
          cantidad: pagina.cantidad,
          hayMas: pagina.hayMas,
          conversaciones: pagina.conversaciones,
          sinPropios: ep.exclude_own,
          despues: lectura,
          hasta: pagina.siguiente,
        });
      } catch {
        return await esperar("cuerpo");
      }
      if (queda() < MINIMO_PARA_LEER_MS) return anotar("sin_tiempo");
      const alta = await d.timbrar(g, hasta, { id, body: cuerpo, cantidad: pagina.cantidad }, limpiarError);
      if (alta === "perdio") return anotar("perdio");
      if (alta === "ya_hay_uno") return anotar("ya_hay_timbre");
      if (alta === "error") {
        baseCaida();
        return await esperar("timbrar");
      }
      g.cursorAt = hasta.t;
      g.cursorId = hasta.i;
      timbre = { id, body: cuerpo, attempts: 0, uncertain: false };
    }

    // ── e. antes de mandar: el intento se anota PRIMERO ──
    if (queda() < MINIMO_PARA_MANDAR_MS) return anotar("sin_tiempo", { timbre: timbre.id });
    // Un timbre sin intentos arranca una racha nueva: si la escritura de éxito de un
    // timbre anterior se perdió, la racha vieja no puede detenerlo en falso.
    const nueva = timbre.attempts === 0;
    const fallos = nueva ? 1 : ep.consecutive_failures + 1;
    const fallandoDesde = nueva ? null : ep.failing_since;
    const intentoN = timbre.attempts + 1;
    const adelanto = await escribir({
      consecutive_failures: fallos,
      failing_since: fallandoDesde ?? "now",
      next_attempt_at: new Date(proximoIntento(fallos, c.ahora(), null, c.azar)).toISOString(),
    }, "antes", false);
    if (adelanto !== true) {
      if (adelanto === null) retener = true;
      return anotar(adelanto === false ? "perdio" : "error", { clase: "adelanto", timbre: timbre.id });
    }
    const marca = await d.anotarTimbre(timbre.id, ep.tenant_id, { attempts: intentoN, last_attempt_at: "now" }, "antes");
    if (marca !== true) {
      if (marca === null) baseCaida();
      return anotar(marca === false ? "perdio" : "error", { clase: "anotacion", timbre: timbre.id });
    }

    // ── f. mandar ──
    const plazo = Math.min(PLAZO_ENVIO_MS, queda() - MARGEN_ESCRITURA_MS);
    const encabezados = await encabezadosFirmados(secreto, timbre.id, timbre.body, c.ahora());
    const resultado = await c.enviar({ href: ep.url, cuerpo: timbre.body, encabezados, resolver: c.resolver, plazoMs: plazo });
    const r = decidirEntrega(resultado);
    const det: DetalleLog = { timbre: timbre.id, intento: intentoN, envio: r.codigo ?? r.error, ms: resultado.latenciaMs };
    const intento = {
      last_status_code: r.codigo,
      last_error: r.error,
      latency_ms: resultado.latenciaMs,
      // Una vez que no sabemos si llegó, no lo sabemos más (lección del #1868).
      uncertain: timbre.uncertain || resultado.tipo === "incierto",
    };
    const ultimo = { last_attempt_at: "now", last_status_code: r.codigo, last_error: r.error };

    // ── g. anotar: primero el timbre, después el endpoint (una sola escritura final).
    // Si algo falla acá, el adelanto ya dejó la espera: se suelta igual.
    if (r.accion === "entregado") {
      const a = await d.anotarTimbre(timbre.id, ep.tenant_id, { ...intento, state: "delivered", delivered_at: "now" }, "despues");
      if (a !== true) return anotar(a === false ? "perdio" : "error", { ...det, clase: "anotacion" });
      await escribir({
        ...ultimo, last_success_at: "now", consecutive_failures: 0, failing_since: null,
        // Lo que haya llegado mientras tanto sale en el turno siguiente.
        next_attempt_at: "now",
      }, "despues", true);
      return anotar("entregado", det);
    }

    if (r.accion === "detener") {
      const a = await d.anotarTimbre(timbre.id, ep.tenant_id, {
        ...intento, state: "dropped", drop_reason: r.motivo === "receiver_gone" ? "receiver_gone" : "endpoint_disabled",
      }, "despues");
      if (a !== true) return anotar(a === false ? "perdio" : "error", { ...det, clase: "anotacion" });
      anotar("detenido", det);
      return await detener(r.motivo, "despues", ultimo);
    }

    // reintentar: ¿72 h fallando sin parar? Se decide ANTES de escribir, con la racha
    // de antes de este intento.
    const ahoraMs = c.ahora();
    if (vencioElHorizonte(fallandoDesde ? new Date(fallandoDesde) : null, ahoraMs)) {
      const a = await d.anotarTimbre(timbre.id, ep.tenant_id, { ...intento, state: "dropped", drop_reason: "receiver_failing" }, "despues");
      if (a !== true) return anotar(a === false ? "perdio" : "error", { ...det, clase: "anotacion" });
      anotar("detenido", det);
      return await detener("receiver_failing", "despues", ultimo);
    }
    const a = await d.anotarTimbre(timbre.id, ep.tenant_id, intento, "despues");
    if (a !== true) return anotar(a === false ? "perdio" : "error", { ...det, clase: "anotacion" });
    await escribir({
      ...ultimo,
      next_attempt_at: new Date(proximoIntento(fallos, ahoraMs, r.retryAfterS, c.azar)).toISOString(),
    }, "despues", true);
    return anotar("reintentar", det);
  } catch (err) {
    // Algo tiró (un bug): la misma espera que una falla propia.
    c.anotar(ep.id, "error", { clase: "interno" });
    void err;
    if (!suelto) {
      try {
        return await esperar("interno");
      } catch {
        retener = true;
      }
    }
    return "error";
  } finally {
    if (!suelto && !retener) {
      try {
        await d.soltar(ep.id, ep.tenant_id, ep.lease_until);
      } catch {
        // Si ni esto anda, el reclamo vence solo en 60 s.
      }
    }
  }
}
