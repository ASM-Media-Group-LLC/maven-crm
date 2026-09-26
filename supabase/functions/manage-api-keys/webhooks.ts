// Los webhooks del Messenger desde Ajustes → API keys: registrar la URL del
// integrador, mandar la prueba, pausar, reanudar, borrar y ver las entregas.
//
// Vive aparte de index.ts para poder probarlo: todo lo que toca la base pasa por
// `Datos`, que acá se implementa sobre supabase-js (crearDatos) y en los tests con
// una base en memoria. Las tablas y sus reglas son de la migración
// 20260926120000_api_webhooks_tablas.sql; lo que se manda, de
// _shared/webhook-salida.ts.
//
// Quién puede qué (lo mismo que las llaves con Messenger):
//   - la persona cuyas conversaciones lee la llave: registrar, probar, reanudar;
//   - cualquier admin de la agencia: pausar, borrar y ver las entregas (el
//     botón de apagado no puede depender de una sola persona).
//
// ⚠️ Nada de acá devuelve ni loguea la URL entera (puede llevar un token), el
// secreto (salvo UNA vez, al crear), el cuerpo firmado ni error.details de una
// escritura sobre api_webhook_*: una violación de CHECK trae la fila entera en el
// DETAIL. De la base solo se usa error.code.
//
// ⚠️ Una lectura que FALLA no es una lectura VACÍA: si no se pudo saber si hay
// webhook, la respuesta es "no se pudo consultar" (503), nunca "no existe" ni "sin
// webhook" (la página escondería el botón de apagado de uno que sí está andando).

import {
  abrirSecreto,
  cuerpoDePrueba,
  decidir,
  direccionesPublicas,
  encabezadosFirmados,
  enviarWebhook,
  generarSecreto,
  kekConfigurada,
  type LeerEntorno,
  type MotivoUrl,
  normalizarUrlDeWebhook,
  type Resolvedor,
  type Resultado,
  sellarSecreto,
} from "../_shared/webhook-salida.ts";
import { type ClaveDeMensaje, type Idioma, msg } from "./mensajes.ts";

export const SCOPE_WEBHOOK = "messenger:read";
/** "Enviar prueba" (y Reanudar, que manda una): una cada 12 s por endpoint, o sea
 *  como mucho 5 por minuto. El turno se toma con UNA escritura condicional antes de
 *  mandar (reservarPrueba), así dos pedidos a la vez no pasan los dos; y un pedido
 *  rechazado no escribe nada.
 *  Riesgo aceptado: el tope es por endpoint, así que borrar y volver a registrar lo
 *  reinicia. Atarlo a la llave pide una columna nueva en api_keys. */
export const PRUEBA_CADA_MS = 12_000;
export const ENTREGAS_MAX = 50;
/** Al activar, el cursor arranca 10 s atrás (el margen del feed): lo que pasó
 *  antes no se anuncia. La base exige que caiga cerca de su now(). */
export const ARRANQUE_MS = 10_000;
const CURSOR_ID_INICIAL = "00000000-0000-0000-0000-000000000000";

// ─── lo que se lee y se escribe ──────────────────────────────────────────────

export interface Llave {
  id: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  acts_as_user_id: string;
}

export type Estado = "pending" | "active" | "paused" | "disabled";

export interface FilaEndpoint {
  id: string;
  api_key_id: string;
  acts_as_user_id: string;
  url: string;
  url_host: string;
  exclude_own: boolean;
  status: Estado;
  disabled_reason: string | null;
  disabled_at: string | null;
  paused_by: string | null;
  paused_at: string | null;
  secret_cipher: string;
  secret_nonce: string;
  secret_key_version: number;
  secret_last4: string;
  next_attempt_at: string | null;
  consecutive_failures: number;
  failing_since: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  last_test_at: string | null;
  created_by: string;
  created_at: string;
}

/** Lo único que sale de una entrega: nunca el cuerpo firmado, ni a qué endpoint o
 *  agencia pertenece. Es también la lista de columnas que se piden. */
export const CLAVES_ENTREGA = [
  "id", "event_type", "message_count", "state", "drop_reason", "attempts", "last_attempt_at",
  "last_status_code", "last_error", "latency_ms", "uncertain", "created_at", "delivered_at",
] as const;
export type EntregaVisible = Record<(typeof CLAVES_ENTREGA)[number], unknown>;

function entregaVisible(fila: Record<string, unknown>): EntregaVisible {
  return Object.fromEntries(CLAVES_ENTREGA.map((k) => [k, fila[k] ?? null])) as EntregaVisible;
}

/** Una escritura que la base puede rechazar: solo se conserva el código (P0001 es
 *  una regla de los triggers; 23505, el endpoint repetido). */
export type Escritura<T> = { ok: true; valor: T } | { ok: false; codigo: string | null };

/** La base no contestó una lectura. No lleva nada de la base: solo dónde fue. */
export class FalloDeLectura extends Error {
  constructor(donde: string) {
    super(donde);
    this.name = "FalloDeLectura";
  }
}

/** Todo lo que el módulo necesita de la base. Cada método va ATADO a la agencia de
 *  quien pide (crearDatos lo recibe una vez): no hay forma de pedir de otra.
 *  Las lecturas devuelven null / [] SOLO si no hay; si la base falla, tiran
 *  FalloDeLectura (servirWebhook contesta 503). */
export interface Datos {
  llave(id: string): Promise<Llave | null>;
  /** true solo si la base dice que la persona de la llave sigue activa en la agencia. */
  llaveVigente(id: string): Promise<boolean>;
  /** Cuántas agencias hay en Maven: con más de una los webhooks no andan (la base
   *  los detiene y no deja activarlos). */
  agencias(): Promise<number>;
  endpoint(id: string): Promise<FilaEndpoint | null>;
  endpointDeLlave(apiKeyId: string): Promise<FilaEndpoint | null>;
  endpointsDeLlaves(apiKeyIds: string[]): Promise<FilaEndpoint[]>;
  entregas(endpointId: string, limite: number, soloFallidas: boolean): Promise<Record<string, unknown>[]>;
  /** Solo para mostrar quién pausó: si falla, sin nombres (no frena nada). */
  nombres(ids: string[]): Promise<Map<string, string | null>>;
  crearEndpoint(fila: Record<string, unknown>): Promise<Escritura<FilaEndpoint>>;
  /** UPDATE … WHERE id AND tenant AND status IN (siEstado). null si no tocó nada. */
  actualizarEndpoint(id: string, cambios: Record<string, unknown>, siEstado: Estado[]): Promise<Escritura<FilaEndpoint | null>>;
  /** Toma el turno de la prueba: last_test_at = now() SOLO si la anterior fue antes
   *  de `anteriorAntesDeMs`. null si no le tocaba (no escribió nada). */
  reservarPrueba(id: string, anteriorAntesDeMs: number): Promise<Escritura<FilaEndpoint | null>>;
  borrarEndpoint(id: string): Promise<boolean | null>;
  crearEntrega(fila: Record<string, unknown>): Promise<boolean>;
  /** Anota el intento SOLO si la entrega sigue pendiente. */
  cerrarEntrega(id: string, cambios: Record<string, unknown>): Promise<boolean>;
}

/** El ÚNICO log del módulo: dónde, y un código (el de la base o el nombre del
 *  error). Nunca el mensaje, details ni la fila. */
function anotarFalla(donde: string, codigo: string): void {
  console.error(`[manage-api-keys] webhooks ${donde}: ${codigo}`);
}

// ─── lo que ve la página ─────────────────────────────────────────────────────

/** Lo que se le muestra a un admin: nunca la URL entera, el secreto ni el cursor. */
export interface Resumen {
  id: string;
  api_key_id: string;
  url_host: string;
  status: Estado;
  disabled_reason: string | null;
  disabled_at: string | null;
  paused_at: string | null;
  paused_by: { id: string; name: string | null } | null;
  exclude_own: boolean;
  secret_last4: string;
  created_at: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  last_test_at: string | null;
  consecutive_failures: number;
  failing_since: string | null;
  next_attempt_at: string | null;
}

export function resumir(e: FilaEndpoint, nombres: Map<string, string | null> = new Map()): Resumen {
  return {
    id: e.id,
    api_key_id: e.api_key_id,
    url_host: e.url_host,
    status: e.status,
    disabled_reason: e.disabled_reason,
    disabled_at: e.disabled_at,
    paused_at: e.paused_at,
    paused_by: e.paused_by ? { id: e.paused_by, name: nombres.get(e.paused_by) ?? null } : null,
    exclude_own: e.exclude_own,
    secret_last4: e.secret_last4,
    created_at: e.created_at,
    last_attempt_at: e.last_attempt_at,
    last_success_at: e.last_success_at,
    last_status_code: e.last_status_code,
    last_error: e.last_error,
    last_test_at: e.last_test_at,
    consecutive_failures: e.consecutive_failures,
    failing_since: e.failing_since,
    next_attempt_at: e.next_attempt_at,
  };
}

async function resumirConNombre(datos: Datos, e: FilaEndpoint): Promise<Resumen> {
  return resumir(e, e.paused_by ? await datos.nombres([e.paused_by]) : new Map());
}

/** Para `list`: el webhook de cada llave (a lo sumo uno), por id de llave. null si
 *  no se pudo consultar: la página tiene que decir "no se sabe", no "sin webhook". */
export async function webhooksDeLlaves(datos: Datos, apiKeyIds: string[]): Promise<Map<string, Resumen> | null> {
  let filas: FilaEndpoint[];
  try {
    filas = apiKeyIds.length ? await datos.endpointsDeLlaves(apiKeyIds) : [];
  } catch (e) {
    if (e instanceof FalloDeLectura) return null;
    throw e;
  }
  const nombres = await datos.nombres([...new Set(filas.map((f) => f.paused_by).filter((x): x is string => !!x))]);
  return new Map(filas.map((f) => [f.api_key_id, resumir(f, nombres)]));
}

// ─── las acciones ────────────────────────────────────────────────────────────

export interface Contexto {
  datos: Datos;
  callerId: string;
  idioma: Idioma;
  entorno?: LeerEntorno;
  resolver?: Resolvedor;
  enviar?: typeof enviarWebhook;
  ahora?: () => number;
  uuid?: () => string;
}

export type Respuesta = { estado: number; cuerpo: Record<string, unknown> };

export const ACCIONES_WEBHOOK = [
  "webhook_create", "webhook_test", "webhook_resume", "webhook_pause", "webhook_delete", "webhook_deliveries",
] as const;

const MOTIVOS_URL: Record<MotivoUrl, ClaveDeMensaje> = {
  url_invalida: "webhookUrlInvalida",
  no_https: "webhookUrlNoHttps",
  puerto: "webhookUrlPuerto",
  usuario: "webhookUrlUsuario",
  fragmento: "webhookUrlFragmento",
  muy_larga: "webhookUrlMuyLarga",
  ip_literal: "webhookUrlIp",
  host_invalido: "webhookUrlHostInvalido",
  host_prohibido: "webhookUrlHostProhibido",
};

/** Qué decirle a la persona de una prueba, en su idioma. */
function mensajeDePrueba(r: Resultado, idioma: Idioma): string {
  if (r.tipo === "respuesta") {
    if (r.estado >= 200 && r.estado < 300) return msg(idioma, "webhookPruebaEntregada", { codigo: r.estado });
    if (r.estado === 410) return msg(idioma, "webhookPrueba410");
    return msg(idioma, "webhookPruebaHttp", { codigo: r.estado });
  }
  if (r.tipo === "incierto") {
    return msg(idioma, r.clase === "plazo" ? "webhookPruebaPlazo" : "webhookPruebaIncierto");
  }
  const claves: Record<typeof r.clase, ClaveDeMensaje> = {
    host_prohibido: "webhookUrlHostProhibido",
    dns: "webhookPruebaDns",
    direccion_bloqueada: "webhookPruebaDireccion",
    conexion: "webhookPruebaConexion",
    tls: "webhookPruebaTls",
    plazo: "webhookPruebaPlazo",
  };
  return msg(idioma, claves[r.clase]);
}

/** El id que manda la página: un uuid, y en minúscula (como lo guarda la base). */
function idDelPedido(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}

function llaveUsable(k: Llave, ahoraMs: number): boolean {
  return !k.revoked_at && !!k.expires_at && new Date(k.expires_at).getTime() > ahoraMs && k.scopes.includes(SCOPE_WEBHOOK);
}

type ErrorDe = (estado: number, clave: ClaveDeMensaje, vars?: Record<string, string | number>) => Respuesta;

/** Despacha una acción webhook_*. Nunca tira: todo termina en una Respuesta con un
 *  mensaje en el idioma de la página. */
export async function servirWebhook(accion: string, body: Record<string, unknown>, ctx: Contexto): Promise<Respuesta> {
  const error: ErrorDe = (estado, clave, vars) => ({ estado, cuerpo: { error: msg(ctx.idioma, clave, vars) } });
  if (!(ACCIONES_WEBHOOK as readonly string[]).includes(accion)) return error(400, "accionDesconocida", { accion });
  try {
    return await servir(accion, body, ctx, error);
  } catch (e) {
    if (e instanceof FalloDeLectura) return error(503, "webhookErrorLectura");
    anotarFalla(accion, (e as Error)?.name || "sin nombre");
    return error(500, "webhookErrorInesperado");
  }
}

async function servir(accion: string, body: Record<string, unknown>, ctx: Contexto, error: ErrorDe): Promise<Respuesta> {
  const m = (clave: ClaveDeMensaje, vars?: Record<string, string | number>) => msg(ctx.idioma, clave, vars);
  const ahora = ctx.ahora ?? Date.now;
  const uuid = ctx.uuid ?? (() => crypto.randomUUID());
  const { datos, callerId } = ctx;

  // ── registrar ──
  if (accion === "webhook_create") {
    const keyId = idDelPedido(body.key_id);
    if (!keyId) return error(400, "idRequerido");
    if (typeof body.url !== "string" || !body.url.trim()) return error(400, "webhookUrlRequerida");
    if (body.exclude_own !== undefined && typeof body.exclude_own !== "boolean") return error(400, "webhookExcludeOwnInvalido");

    const llave = await datos.llave(keyId);
    if (!llave) return error(404, "noExisteORevocada");
    if (!llave.scopes.includes(SCOPE_WEBHOOK)) return error(400, "webhookSoloMessenger");
    if (llave.acts_as_user_id !== callerId) return error(403, "webhookSoloDueno");
    if (!llaveUsable(llave, ahora())) return error(409, "webhookLlaveNoActiva");
    if (!(await datos.llaveVigente(llave.id))) return error(409, "webhookPersonaNoVigente");
    if ((await datos.agencias()) !== 1) return error(409, "webhookVariasAgencias");
    if (await datos.endpointDeLlave(llave.id)) return error(409, "webhookYaExiste");
    if (!kekConfigurada(ctx.entorno)) return error(503, "webhookSinConfigurar");

    const url = normalizarUrlDeWebhook(body.url);
    if (!url.ok) return error(400, MOTIVOS_URL[url.motivo]);
    // "Resolvé ahora": una URL que hoy apunta adentro no se registra.
    const dns = await direccionesPublicas(url.host, ctx.resolver);
    if (!dns.ok) return error(400, dns.clase === "dns" ? "webhookPruebaDns" : "webhookPruebaDireccion");

    // El id se elige ACÁ: el secreto se cifra atado a él (AAD) antes del insert.
    const id = uuid();
    const { secreto, ultimos4 } = generarSecreto();
    const sellado = await sellarSecreto(secreto, id, ctx.entorno);
    if (!sellado) return error(503, "webhookSinConfigurar");

    const alta = await datos.crearEndpoint({
      id,
      api_key_id: llave.id,
      url: url.href,
      // La base los vuelve a sacar de la llave y de la URL; se mandan porque son NOT NULL.
      url_host: url.host,
      acts_as_user_id: llave.acts_as_user_id,
      exclude_own: body.exclude_own ?? true,
      secret_cipher: sellado.cipher,
      secret_nonce: sellado.nonce,
      secret_key_version: sellado.version,
      secret_last4: ultimos4,
      created_by: callerId,
    });
    if (!alta.ok) {
      if (alta.codigo === "23505") return error(409, "webhookYaExiste");
      // Una regla del trigger: la llave, la persona o la agencia cambiaron entre
      // las comprobaciones de arriba y el insert.
      if (alta.codigo === "P0001") return error(409, "webhookReglaBase");
      return error(500, "webhookErrorBase");
    }
    // El secreto viaja UNA sola vez: después solo quedan los últimos 4.
    return { estado: 201, cuerpo: { webhook: resumir(alta.valor), secret: secreto } };
  }

  // Todas las demás son sobre un endpoint que ya existe (en ESTA agencia).
  const id = idDelPedido(body.id);
  if (!id) return error(400, "webhookIdRequerido");
  const ep = await datos.endpoint(id);
  if (!ep) return error(404, "webhookNoExiste");

  // ── pausar (cualquier admin) ──
  if (accion === "webhook_pause") {
    const r = await datos.actualizarEndpoint(ep.id, { status: "paused", paused_at: "now", paused_by: callerId }, ["active"]);
    if (!r.ok) return error(500, "webhookErrorBase");
    if (!r.valor) return error(409, "webhookNoEstaActivo");
    return { estado: 200, cuerpo: { webhook: await resumirConNombre(datos, r.valor) } };
  }

  // ── borrar (cualquier admin) ──
  if (accion === "webhook_delete") {
    const borrado = await datos.borrarEndpoint(ep.id);
    if (borrado === null) return error(500, "webhookErrorBase");
    if (!borrado) return error(404, "webhookNoExiste");
    return { estado: 200, cuerpo: { success: true, id: ep.id } };
  }

  // ── entregas (cualquier admin) ──
  if (accion === "webhook_deliveries") {
    const pedido = typeof body.limit === "number" && Number.isInteger(body.limit) ? body.limit : ENTREGAS_MAX;
    const limite = Math.min(Math.max(pedido, 1), ENTREGAS_MAX);
    const filas = await datos.entregas(ep.id, limite, body.only_failed === true);
    // El endpoint va al lado: la fila pendiente dice "reintentando a las …" con un dato fresco.
    return { estado: 200, cuerpo: { webhook: await resumirConNombre(datos, ep), deliveries: filas.map(entregaVisible) } };
  }

  // ── probar y reanudar (solo la persona de la llave) ──
  if (ep.acts_as_user_id !== callerId) return error(403, "webhookSoloDueno");
  const reanudar = accion === "webhook_resume";
  const parado = ep.status === "paused" || ep.status === "disabled";
  if (reanudar && !parado) return error(409, ep.status === "active" ? "webhookYaEstabaActivo" : "webhookNoEstaParado");

  const llave = await datos.llave(ep.api_key_id);
  if (!llave) return error(409, "webhookLlaveNoActiva");
  if (!llave.scopes.includes(SCOPE_WEBHOOK)) return error(409, "webhookLlaveSinMessenger");
  if (!llaveUsable(llave, ahora())) return error(409, "webhookLlaveNoActiva");
  if (!(await datos.llaveVigente(llave.id))) return error(409, "webhookPersonaNoVigente");
  if ((await datos.agencias()) !== 1) return error(409, "webhookVariasAgencias");
  if (!kekConfigurada(ctx.entorno)) return error(503, "webhookSinConfigurar");
  const secreto = await abrirSecreto(
    { cipher: ep.secret_cipher, nonce: ep.secret_nonce, version: ep.secret_key_version },
    ep.id,
    ctx.entorno,
  );
  // Con la clave puesta y aun así no abre: el secreto guardado no sirve más.
  if (!secreto) return error(409, "webhookSecretoIlegible");

  // El turno, ANTES de mandar y en una sola escritura: de dos pedidos a la vez
  // pasa uno (el UPDATE toma el lock de la fila y el otro vuelve a evaluar el WHERE).
  const turno = await datos.reservarPrueba(ep.id, ahora() - PRUEBA_CADA_MS);
  if (!turno.ok) return error(500, "webhookErrorBase");
  if (!turno.valor) return error(429, "webhookPruebaMuySeguida", { segundos: PRUEBA_CADA_MS / 1000 });

  const entregaId = uuid();
  const cuerpo = cuerpoDePrueba({ id: entregaId, creadoEn: new Date(ahora()), prefijoLlave: llave.key_prefix });
  // Se anota ANTES de mandar: si la función se corta a mitad, queda la prueba
  // pendiente (la limpieza de 14 días se la lleva) y no un envío sin rastro.
  if (!(await datos.crearEntrega({ id: entregaId, endpoint_id: ep.id, event_type: "webhook.test", body: cuerpo }))) {
    return error(500, "webhookErrorBase");
  }
  const encabezados = await encabezadosFirmados(secreto, entregaId, cuerpo, ahora());
  const resultado = await (ctx.enviar ?? enviarWebhook)({ href: ep.url, cuerpo, encabezados, resolver: ctx.resolver });
  const d = decidir(resultado);
  const llego = d.accion === "entregado";

  // Primero la entrega, después el endpoint (contrato de la migración).
  await datos.cerrarEntrega(entregaId, {
    attempts: 1,
    last_attempt_at: "now",
    last_status_code: d.codigo,
    last_error: d.error,
    latency_ms: resultado.latenciaMs,
    uncertain: resultado.tipo === "incierto",
    ...(llego ? { state: "delivered", delivered_at: "now" } : { state: "dropped", drop_reason: "test_failed" }),
  });

  // `actual` es la foto que devolvió la última escritura; `fresca`, si todavía vale.
  let actual: FilaEndpoint = turno.valor;
  let fresca = true;
  // En uno recién registrado la prueba es toda su historia: se anota, y explica por
  // qué no se activó. En activo, pausado o detenido los last_* son del despachador
  // (por qué se detuvo, el último timbre): la prueba no los pisa; queda en su fila
  // y en la respuesta. last_test_at ya lo puso la reserva.
  if (ep.status === "pending") {
    const anotado = await datos.actualizarEndpoint(ep.id, {
      last_attempt_at: "now",
      last_status_code: d.codigo,
      last_error: d.error,
      ...(llego ? { last_success_at: "now" } : {}),
    }, ["pending"]);
    if (anotado.ok && anotado.valor) actual = anotado.valor;
    else fresca = false;
  }

  // La prueba ACTIVA solo un endpoint recién registrado; en uno activo, pausado o
  // detenido es solo "¿llega?". Reanudar es la otra acción.
  let activado = false;
  let aviso: string | null = null;
  const debeActivar = llego && (reanudar ? parado : ep.status === "pending");
  if (debeActivar) {
    const r = await datos.actualizarEndpoint(ep.id, {
      status: "active",
      paused_at: null,
      paused_by: null,
      disabled_reason: null,
      disabled_at: null,
      // Arranca desde ahora: lo que pasó mientras estaba parado no se anuncia.
      cursor_at: new Date(ahora() - ARRANQUE_MS).toISOString(),
      cursor_id: CURSOR_ID_INICIAL,
      // Reanudar arranca también el detalle de cero (el trigger ya reinicia la racha
      // de fallos): si no, seguiría mostrando el error por el que se detuvo.
      ...(reanudar ? { last_attempt_at: "now", last_success_at: "now", last_status_code: d.codigo, last_error: null } : {}),
    }, reanudar ? ["paused", "disabled"] : ["pending"]);
    if (r.ok && r.valor) {
      actual = r.valor;
      fresca = true;
      activado = true;
    } else {
      fresca = false;
    }
  }

  // Si una escritura no devolvió la fila (otro la movió en el medio, o la base no
  // dejó activar), se vuelve a leer: la respuesta cuenta cómo quedó DE VERDAD. La
  // prueba ya salió: si la relectura falla, se contesta igual, sin el webhook.
  let webhook: FilaEndpoint | null | undefined = actual;
  if (!fresca) {
    try {
      webhook = await datos.endpoint(ep.id);
    } catch (e) {
      if (!(e instanceof FalloDeLectura)) throw e;
      webhook = undefined;
    }
    if (webhook === null) return error(404, "webhookNoExiste");
  }
  if (debeActivar && !activado) {
    aviso = webhook === undefined
      ? m("webhookErrorLectura")
      : m(webhook.status === "active" ? "webhookYaEstabaActivo" : "webhookNoSePudoActivar");
  }

  return {
    estado: 200,
    cuerpo: {
      webhook: webhook ? await resumirConNombre(datos, webhook) : null,
      test: {
        delivered: llego,
        status_code: d.codigo,
        error_code: d.error,
        latency_ms: resultado.latenciaMs,
        uncertain: resultado.tipo === "incierto",
        activated: activado,
        message: mensajeDePrueba(resultado, ctx.idioma),
        notice: aviso,
      },
    },
  };
}

// ─── Datos sobre supabase-js ─────────────────────────────────────────────────

// Lo mínimo del cliente que se usa: se escribe así para no atar el tipo a una
// versión de supabase-js.
// deno-lint-ignore no-explicit-any
type Cliente = any;
type ErrorDeLaBase = { code?: string } | null;

const COLS_ENDPOINT =
  "id, api_key_id, acts_as_user_id, url, url_host, exclude_own, status, disabled_reason, disabled_at, paused_by, paused_at, " +
  "secret_cipher, secret_nonce, secret_key_version, secret_last4, next_attempt_at, consecutive_failures, failing_since, " +
  "last_attempt_at, last_success_at, last_status_code, last_error, last_test_at, created_by, created_at";
export const COLS_ENTREGA = CLAVES_ENTREGA.join(", ");

/** ⚠️ Cada consulta de acá a api_keys y api_webhook_* va con
 *  `.eq("tenant_id", tenantId)`: esta función usa service_role, que salta la RLS.
 *  Un test lo verifica sentencia por sentencia, y otro con un cliente que anota. */
export function crearDatos(admin: Cliente, tenantId: string): Datos {
  const falla = (donde: string, e: ErrorDeLaBase) => {
    // Solo el código: error.details trae la fila (con la URL y el secreto cifrado).
    if (e) anotarFalla(donde, e.code || "sin código");
  };
  /** Una lectura: si la base falló, se anota y se corta (FalloDeLectura). */
  const leido = <T>(donde: string, e: ErrorDeLaBase, valor: T): T => {
    if (e) {
      falla(donde, e);
      throw new FalloDeLectura(donde);
    }
    return valor;
  };
  const escrito = <T>(donde: string, e: ErrorDeLaBase, valor: T): Escritura<T> => {
    falla(donde, e);
    return e ? { ok: false, codigo: e.code || null } : { ok: true, valor };
  };
  return {
    async llave(id) {
      const { data, error } = await admin.from("api_keys")
        .select("id, key_prefix, scopes, expires_at, revoked_at, acts_as_user_id")
        .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      return leido("llave", error, (data ?? null) as Llave | null);
    },
    async llaveVigente(id) {
      const { data, error } = await admin.rpc("api_key_vigente", { _id: id });
      return leido("vigencia", error, data === true);
    },
    async agencias() {
      const { count, error } = await admin.from("tenants").select("id", { count: "exact", head: true });
      if (!error && typeof count !== "number") return leido("agencias", { code: "sin conteo" }, 0);
      return leido("agencias", error, count as number);
    },
    async endpoint(id) {
      const { data, error } = await admin.from("api_webhook_endpoints").select(COLS_ENDPOINT)
        .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      return leido("endpoint", error, (data ?? null) as FilaEndpoint | null);
    },
    async endpointDeLlave(apiKeyId) {
      const { data, error } = await admin.from("api_webhook_endpoints").select(COLS_ENDPOINT)
        .eq("api_key_id", apiKeyId).eq("tenant_id", tenantId).maybeSingle();
      return leido("endpoint de la llave", error, (data ?? null) as FilaEndpoint | null);
    },
    async endpointsDeLlaves(apiKeyIds) {
      const { data, error } = await admin.from("api_webhook_endpoints").select(COLS_ENDPOINT)
        .in("api_key_id", apiKeyIds).eq("tenant_id", tenantId);
      return leido("endpoints de las llaves", error, (data ?? []) as FilaEndpoint[]);
    },
    async entregas(endpointId, limite, soloFallidas) {
      let q = admin.from("api_webhook_deliveries").select(COLS_ENTREGA)
        .eq("endpoint_id", endpointId).eq("tenant_id", tenantId);
      if (soloFallidas) q = q.neq("state", "delivered");
      const { data, error } = await q.order("created_at", { ascending: false }).limit(limite);
      return leido("entregas", error, (data ?? []) as Record<string, unknown>[]);
    },
    async nombres(ids) {
      const mapa = new Map<string, string | null>();
      if (!ids.length) return mapa;
      const { data, error } = await admin.from("profiles").select("id, full_name").in("id", ids);
      falla("nombres", error);
      for (const p of (data ?? []) as { id: string; full_name: string | null }[]) mapa.set(p.id, p.full_name ?? null);
      return mapa;
    },
    async crearEndpoint(fila) {
      const { data, error } = await admin.from("api_webhook_endpoints")
        .insert({ ...fila, tenant_id: tenantId }).select(COLS_ENDPOINT).single();
      return escrito("alta", error, data as FilaEndpoint);
    },
    async actualizarEndpoint(id, cambios, siEstado) {
      const { data, error } = await admin.from("api_webhook_endpoints").update(cambios)
        .eq("id", id).eq("tenant_id", tenantId).in("status", siEstado).select(COLS_ENDPOINT);
      return escrito("cambio", error, ((data ?? []) as FilaEndpoint[])[0] ?? null);
    },
    async reservarPrueba(id, anteriorAntesDeMs) {
      // La hora la arma esta función con toISOString (no llega de afuera), igual que
      // el `expires_at.gt.${nowIso}` de index.ts que ya anda en producción.
      const corte = new Date(anteriorAntesDeMs).toISOString();
      const { data, error } = await admin.from("api_webhook_endpoints").update({ last_test_at: "now" })
        .eq("id", id).eq("tenant_id", tenantId).or(`last_test_at.is.null,last_test_at.lt.${corte}`).select(COLS_ENDPOINT);
      return escrito("turno de la prueba", error, ((data ?? []) as FilaEndpoint[])[0] ?? null);
    },
    async borrarEndpoint(id) {
      const { data, error } = await admin.from("api_webhook_endpoints").delete()
        .eq("id", id).eq("tenant_id", tenantId).select("id");
      falla("baja", error);
      return error ? null : (data ?? []).length > 0;
    },
    async crearEntrega(fila) {
      const { error } = await admin.from("api_webhook_deliveries").insert({ ...fila, tenant_id: tenantId });
      falla("entrega", error);
      return !error;
    },
    async cerrarEntrega(id, cambios) {
      const { error } = await admin.from("api_webhook_deliveries").update(cambios)
        .eq("id", id).eq("tenant_id", tenantId).eq("state", "pending");
      falla("cierre de la entrega", error);
      return !error;
    },
  };
}
