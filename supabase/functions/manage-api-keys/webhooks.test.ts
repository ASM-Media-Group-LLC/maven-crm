// Las acciones de webhooks de manage-api-keys, por comportamiento: con una base en
// memoria que anota cada escritura y un envío falso que contesta lo que le pidamos.
// Las reglas de la BASE (triggers, CHECKs) se prueban aparte, contra Postgres:
// supabase/tests/api_webhooks_tablas.ts.
// Correr: deno test --allow-read supabase/functions/manage-api-keys/webhooks.test.ts

import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import { abrirSecreto, type Envio, firmar, type Resultado } from "../_shared/webhook-salida.ts";
import {
  ARRANQUE_MS,
  CLAVES_ENTREGA,
  COLS_ENTREGA,
  conWebhooks,
  type Contexto,
  crearDatos,
  type Datos,
  type Estado,
  FalloDeLectura,
  type FilaEndpoint,
  type Llave,
  PRUEBA_CADA_MS,
  servirWebhook,
  webhooksDeLlaves,
} from "./webhooks.ts";
import { type ClaveDeMensaje, msg } from "./mensajes.ts";

const DUENA = "aaaaaaaa-0000-4000-8000-000000000001"; // la persona de la llave
const OTRA_ADMIN = "bbbbbbbb-0000-4000-8000-000000000002";
const LLAVE = "cccccccc-0000-4000-8000-000000000003";
const LLAVE_SIN_MSG = "cccccccc-0000-4000-8000-000000000004";
const LLAVE_DE_OTRA = "cccccccc-0000-4000-8000-000000000005";
const KEK = "k".repeat(40);
const AHORA = Date.parse("2026-09-26T12:00:00Z");
const RESUELVE_PUBLICA = () => Promise.resolve(["93.184.216.34"]);
const es = (clave: ClaveDeMensaje, vars?: Record<string, string | number>) => msg("es", clave, vars);

function llave(extra: Partial<Llave> = {}): Llave {
  return {
    id: LLAVE, key_prefix: "mvk_live_ab12cd", scopes: ["messenger:read"],
    expires_at: new Date(AHORA + 30 * 86_400_000).toISOString(), revoked_at: null, acts_as_user_id: DUENA, ...extra,
  };
}

type Opciones = {
  llaves?: Llave[];
  vigente?: boolean;
  agencias?: number;
  /** Lecturas: tiran FalloDeLectura. Escrituras: devuelven ese código (actualizarEndpoint, solo si cambia el estado). */
  falla?: Partial<Record<keyof Datos, string>>;
};

/** Una base en memoria con la agencia ya aplicada (como crearDatos): lo que no
 *  está acá, para el módulo no existe. Su reloj es el de la "base" (now()). */
function baseFalsa(o: Opciones = {}) {
  const llaves = new Map((o.llaves ?? [llave(), llave({ id: LLAVE_SIN_MSG, scopes: ["creators:read"] }), llave({ id: LLAVE_DE_OTRA, acts_as_user_id: OTRA_ADMIN })]).map((k) => [k.id, k]));
  const endpoints = new Map<string, FilaEndpoint>();
  const entregas: Record<string, unknown>[] = [];
  const escrituras: string[] = [];
  // Se puede cambiar después de registrar (enEstado): lo lee cada llamada.
  const cfg = { vigente: o.vigente ?? true, agencias: o.agencias ?? 1, falla: o.falla ?? {} };
  const reloj = { ms: AHORA };
  const lee = <T>(k: keyof Datos, f: () => T): Promise<T> =>
    cfg.falla[k] ? Promise.reject(new FalloDeLectura(k)) : Promise.resolve(f());
  const datos: Datos = {
    llave: (id) => lee("llave", () => llaves.get(id) ?? null),
    llaveVigente: () => lee("llaveVigente", () => cfg.vigente),
    agencias: () => lee("agencias", () => cfg.agencias),
    endpoint: (id) => lee("endpoint", () => endpoints.get(id) ?? null),
    endpointDeLlave: (k) => lee("endpointDeLlave", () => [...endpoints.values()].find((e) => e.api_key_id === k) ?? null),
    endpointsDeLlaves: (ks) => lee("endpointsDeLlaves", () => [...endpoints.values()].filter((e) => ks.includes(e.api_key_id))),
    entregas: (id, limite, soloFallidas) => {
      escrituras.push(`entregas ${limite} ${soloFallidas}`);
      return lee("entregas", () => entregas.filter((d) => d.endpoint_id === id && (!soloFallidas || d.state !== "delivered")).slice(0, limite));
    },
    nombres: (ids) => Promise.resolve(new Map(ids.map((i) => [i, i === DUENA ? "Álvaro" : "Ana"]))),
    crearEndpoint(fila) {
      escrituras.push("crearEndpoint");
      if (cfg.falla.crearEndpoint) return Promise.resolve({ ok: false as const, codigo: cfg.falla.crearEndpoint });
      const e = {
        status: "pending", disabled_reason: null, disabled_at: null, paused_by: null, paused_at: null,
        next_attempt_at: null, consecutive_failures: 0, failing_since: null, last_attempt_at: null, last_success_at: null,
        last_status_code: null, last_error: null, last_test_at: null, created_at: new Date(AHORA).toISOString(),
        ...fila,
      } as unknown as FilaEndpoint;
      endpoints.set(e.id, e);
      return Promise.resolve({ ok: true as const, valor: e });
    },
    actualizarEndpoint(id, cambios, siEstado) {
      escrituras.push(`actualizarEndpoint ${JSON.stringify({ cambios, siEstado })}`);
      if (cfg.falla.actualizarEndpoint && "status" in cambios) return Promise.resolve({ ok: false as const, codigo: cfg.falla.actualizarEndpoint });
      const e = endpoints.get(id);
      // Como el trigger: sin una prueba ENTREGADA de ese endpoint, no se activa.
      if (e && cambios.status === "active" && e.status !== "active" && siEstado.includes(e.status) &&
        !entregas.some((d) => d.endpoint_id === id && d.event_type === "webhook.test" && d.state === "delivered")) {
        return Promise.resolve({ ok: false as const, codigo: "P0001" });
      }
      if (!e || !siEstado.includes(e.status)) return Promise.resolve({ ok: true as const, valor: null });
      const nuevo = { ...e, ...cambios } as FilaEndpoint;
      endpoints.set(id, nuevo);
      return Promise.resolve({ ok: true as const, valor: nuevo });
    },
    async reservarPrueba(id, anteriorAntesDeMs) {
      // Un respiro antes: así los pedidos a la vez se intercalan de verdad. El
      // chequeo y la escritura van juntos (como el UPDATE condicional de la base).
      await new Promise((r) => setTimeout(r, 1));
      escrituras.push("reservarPrueba");
      if (cfg.falla.reservarPrueba) return { ok: false as const, codigo: cfg.falla.reservarPrueba };
      const e = endpoints.get(id);
      if (!e || (e.last_test_at !== null && Date.parse(e.last_test_at) >= anteriorAntesDeMs)) return { ok: true as const, valor: null };
      const nuevo = { ...e, last_test_at: new Date(reloj.ms).toISOString() };
      endpoints.set(id, nuevo);
      return { ok: true as const, valor: nuevo };
    },
    borrarEndpoint(id) {
      escrituras.push("borrarEndpoint");
      return Promise.resolve(endpoints.delete(id));
    },
    crearEntrega(fila) {
      escrituras.push("crearEntrega");
      entregas.push({ ...fila, tenant_id: "la-agencia", state: "pending", attempts: 0, uncertain: false });
      return Promise.resolve(true);
    },
    cerrarEntrega(id, cambios) {
      escrituras.push("cerrarEntrega");
      const d = entregas.find((x) => x.id === id && x.state === "pending");
      if (d) Object.assign(d, cambios);
      return Promise.resolve(true);
    },
  };
  return { datos, llaves, endpoints, entregas, escrituras, reloj, cfg };
}
type Base = ReturnType<typeof baseFalsa>;

const OK_204: Resultado = { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 42 };

function contexto(base: Base, extra: Partial<Contexto> = {}): Contexto & { envios: Envio[] } {
  const envios: Envio[] = [];
  let n = 0;
  return {
    datos: base.datos, callerId: DUENA, idioma: "es",
    entorno: (v) => (v === "WEBHOOK_SIGNING_KEK" ? KEK : undefined),
    resolver: RESUELVE_PUBLICA,
    ahora: () => base.reloj.ms,
    uuid: () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    enviar: (e: Envio) => {
      envios.push(e);
      return Promise.resolve(OK_204);
    },
    envios,
    ...extra,
  };
}
/** Un envío falso que anota y contesta `r` (o lo que devuelva la función). */
function envio(ctx: { envios: Envio[] }, r: Resultado | ((e: Envio) => Promise<Resultado>)) {
  return (e: Envio) => (ctx.envios.push(e), typeof r === "function" ? r(e) : Promise.resolve(r));
}

const URL_OK = "https://Hooks.Integrador.com/maven/abc?token=secreto123";

async function registrar(base = baseFalsa(), extra: Partial<Contexto> = {}) {
  const ctx = contexto(base, extra);
  const r = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK }, ctx);
  return { base, ctx, r, id: (r.cuerpo.webhook as { id: string } | undefined)?.id as string };
}
/** Un endpoint registrado y puesto en `estado` (con lo que se le pase); las
 *  opciones de la base valen DESPUÉS del alta. */
async function enEstado(estado: Estado, extra: Partial<FilaEndpoint> = {}, opciones: Opciones = {}) {
  const x = await registrar();
  x.base.endpoints.set(x.id, { ...x.base.endpoints.get(x.id)!, status: estado, ...extra });
  x.base.escrituras.length = 0;
  Object.assign(x.base.cfg, { ...opciones });
  x.base.cfg.falla = opciones.falla ?? {};
  if (opciones.llaves) for (const k of opciones.llaves) x.base.llaves.set(k.id, k);
  return x;
}
const fila = (b: Base, id: string) => b.endpoints.get(id)!;
const prueba = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo.test as Record<string, unknown>;

// ─── registrar ───────────────────────────────────────────────────────────────

Deno.test("alta: 201, el secreto UNA vez, y lo que se guarda es lo normalizado y cifrado para ESA fila", async () => {
  const { base, r, id } = await registrar();
  assertEquals(r.estado, 201);
  const secreto = r.cuerpo.secret as string;
  assertMatch(secreto, /^whsec_[A-Za-z0-9+/]{44}$/);
  const f = fila(base, id);
  assertEquals(f.url, "https://hooks.integrador.com/maven/abc?token=secreto123");
  assertEquals(f.url_host, "hooks.integrador.com");
  assertEquals(f.created_by, DUENA);
  assertEquals(f.exclude_own, true, "por defecto no avisa los mensajes propios");
  assertEquals(f.secret_last4, secreto.slice(-4));
  const abierto = await abrirSecreto({ cipher: f.secret_cipher, nonce: f.secret_nonce, version: f.secret_key_version }, id, (v) => (v === "WEBHOOK_SIGNING_KEK" ? KEK : undefined));
  assertEquals(abierto, secreto, "el cifrado abre con el id de la fila");
  const resumen = JSON.stringify(r.cuerpo.webhook);
  assert(!resumen.includes("secreto123") && !resumen.includes("/maven/abc"), "el resumen no lleva la URL entera");
  assert(!resumen.includes(f.secret_cipher) && !resumen.includes("secret_cipher"), "ni el secreto cifrado");
});

Deno.test("alta: exclude_own=false se respeta; un valor raro no", async () => {
  const base = baseFalsa();
  const r = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK, exclude_own: false }, contexto(base));
  assertEquals(r.estado, 201);
  assertEquals([...base.endpoints.values()][0].exclude_own, false);
  const mal = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK, exclude_own: "no" }, contexto(baseFalsa()));
  assertEquals([mal.estado, mal.cuerpo.error], [400, es("webhookExcludeOwnInvalido")]);
});

Deno.test("alta: lo que no se registra, con su código y sin escribir nada", async () => {
  const casos: Array<[string, Record<string, unknown>, Opciones, Partial<Contexto>, number, ClaveDeMensaje]> = [
    ["sin key_id", { url: URL_OK }, {}, {}, 400, "idRequerido"],
    ["sin URL", { key_id: LLAVE }, {}, {}, 400, "webhookUrlRequerida"],
    ["llave de otra agencia (no existe acá)", { key_id: "eeeeeeee-0000-4000-8000-000000000009", url: URL_OK }, {}, {}, 404, "noExisteORevocada"],
    ["llave sin Messenger", { key_id: LLAVE_SIN_MSG, url: URL_OK }, {}, {}, 400, "webhookSoloMessenger"],
    ["llave de OTRA persona", { key_id: LLAVE_DE_OTRA, url: URL_OK }, {}, {}, 403, "webhookSoloDueno"],
    ["llave revocada", { key_id: LLAVE, url: URL_OK }, { llaves: [llave({ revoked_at: "2026-09-01T00:00:00Z" })] }, {}, 409, "webhookLlaveNoActiva"],
    ["llave vencida", { key_id: LLAVE, url: URL_OK }, { llaves: [llave({ expires_at: "2026-09-01T00:00:00Z" })] }, {}, 409, "webhookLlaveNoActiva"],
    ["llave sin vencimiento", { key_id: LLAVE, url: URL_OK }, { llaves: [llave({ expires_at: null })] }, {}, 409, "webhookLlaveNoActiva"],
    ["persona de baja", { key_id: LLAVE, url: URL_OK }, { vigente: false }, {}, 409, "webhookPersonaNoVigente"],
    ["no se pudo saber si la persona sigue", { key_id: LLAVE, url: URL_OK }, { falla: { llaveVigente: "x" } }, {}, 503, "webhookErrorLectura"],
    ["dos agencias", { key_id: LLAVE, url: URL_OK }, { agencias: 2 }, {}, 409, "webhookVariasAgencias"],
    ["ninguna agencia contada", { key_id: LLAVE, url: URL_OK }, { agencias: 0 }, {}, 409, "webhookVariasAgencias"],
    ["no se pudieron contar las agencias", { key_id: LLAVE, url: URL_OK }, { falla: { agencias: "x" } }, {}, 503, "webhookErrorLectura"],
    ["no se pudo leer la llave", { key_id: LLAVE, url: URL_OK }, { falla: { llave: "x" } }, {}, 503, "webhookErrorLectura"],
    ["no se pudo saber si ya tiene webhook", { key_id: LLAVE, url: URL_OK }, { falla: { endpointDeLlave: "x" } }, {}, 503, "webhookErrorLectura"],
    ["sin KEK", { key_id: LLAVE, url: URL_OK }, {}, { entorno: () => undefined }, 503, "webhookSinConfigurar"],
    ["http", { key_id: LLAVE, url: "http://hooks.integrador.com/x" }, {}, {}, 400, "webhookUrlNoHttps"],
    ["IP", { key_id: LLAVE, url: "https://10.0.0.1/x" }, {}, {}, 400, "webhookUrlIp"],
    ["Supabase", { key_id: LLAVE, url: "https://lsagslbkliprespbyhts.supabase.co/functions/v1/x" }, {}, {}, 400, "webhookUrlHostProhibido"],
    ["puerto", { key_id: LLAVE, url: "https://hooks.integrador.com:8443/x" }, {}, {}, 400, "webhookUrlPuerto"],
    ["en blanco", { key_id: LLAVE, url: "   " }, {}, {}, 400, "webhookUrlRequerida"],
    ["no es una URL", { key_id: LLAVE, url: "esto no es una url" }, {}, {}, 400, "webhookUrlInvalida"],
    ["con usuario", { key_id: LLAVE, url: "https://ana:clave@hooks.integrador.com/x" }, {}, {}, 400, "webhookUrlUsuario"],
    ["con fragmento", { key_id: LLAVE, url: "https://hooks.integrador.com/x#y" }, {}, {}, 400, "webhookUrlFragmento"],
    ["muy larga", { key_id: LLAVE, url: "https://hooks.integrador.com/" + "a".repeat(2100) }, {}, {}, 400, "webhookUrlMuyLarga"],
    ["host sin dominio", { key_id: LLAVE, url: "https://intranet/x" }, {}, {}, 400, "webhookUrlHostInvalido"],
    ["DNS no resuelve", { key_id: LLAVE, url: URL_OK }, {}, { resolver: () => Promise.reject(new Error("nx")) }, 400, "webhookPruebaDns"],
    ["DNS a una IP privada", { key_id: LLAVE, url: URL_OK }, {}, { resolver: () => Promise.resolve(["10.1.2.3"]) }, 400, "webhookPruebaDireccion"],
  ];
  for (const [nombre, body, opciones, extra, estado, clave] of casos) {
    const base = baseFalsa(opciones);
    const r = await servirWebhook("webhook_create", body, contexto(base, extra));
    assertEquals([r.estado, r.cuerpo.error], [estado, es(clave)], nombre);
    assert(!("secret" in r.cuerpo), `${nombre}: no sale ningún secreto`);
    assertEquals(base.escrituras, [], `${nombre}: no se escribió nada`);
  }
});

Deno.test("alta: ya tiene webhook → 409; la base lo repite (23505) → 409; una regla del trigger (P0001) → 409 con motivo; otro error → 500", async () => {
  const { base } = await registrar();
  const r = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK }, contexto(base));
  assertEquals([r.estado, r.cuerpo.error], [409, es("webhookYaExiste")]);
  for (const [codigo, estado, clave] of [["23505", 409, "webhookYaExiste"], ["P0001", 409, "webhookReglaBase"], ["23514", 500, "webhookErrorBase"]] as const) {
    const x = await registrar(baseFalsa({ falla: { crearEndpoint: codigo } }));
    assertEquals([x.r.estado, x.r.cuerpo.error], [estado, es(clave)], codigo);
    assert(!("secret" in x.r.cuerpo), `${codigo}: el secreto no sale si no se guardó`);
  }
});

Deno.test("alta: en inglés, los errores salen en inglés", async () => {
  const r = await servirWebhook("webhook_create", { key_id: LLAVE_DE_OTRA, url: URL_OK }, contexto(baseFalsa(), { idioma: "en" }));
  assertEquals(r.cuerpo.error, msg("en", "webhookSoloDueno"));
});

// ─── probar ──────────────────────────────────────────────────────────────────

Deno.test("prueba: firmada de verdad, con el cuerpo de prueba, y lo que se guarda es lo que se firmó", async () => {
  const { base, ctx, r: alta, id } = await registrar();
  const secreto = alta.cuerpo.secret as string;
  const r = await servirWebhook("webhook_test", { id }, ctx);
  assertEquals(r.estado, 200);
  const e = ctx.envios[0];
  assertEquals(e.href, "https://hooks.integrador.com/maven/abc?token=secreto123");
  const cuerpo = JSON.parse(e.cuerpo);
  assertEquals(cuerpo.type, "webhook.test");
  assertEquals(cuerpo.data, {});
  assertEquals(cuerpo.key_prefix, "mvk_live_ab12cd");
  assertEquals(e.encabezados["webhook-id"], cuerpo.id);
  assertEquals(e.encabezados["webhook-signature"], await firmar(secreto, cuerpo.id, Number(e.encabezados["webhook-timestamp"]), e.cuerpo));
  assertEquals(base.entregas[0].body, e.cuerpo, "se guarda exactamente lo que se firmó");
});

Deno.test("prueba: turno → entrega → envío → cierre de la entrega → endpoint → activación; sin turno o sin entrega no sale", async () => {
  const { base, ctx, id } = await registrar();
  base.escrituras.length = 0;
  let alMandar: string[] = [];
  const r = await servirWebhook("webhook_test", { id }, { ...ctx, enviar: (e) => ((alMandar = [...base.escrituras]), ctx.enviar!(e)) });
  assertEquals(r.estado, 200);
  assertEquals(alMandar, ["reservarPrueba", "crearEntrega"], "al mandar ya están el turno y la entrega, y nada más");
  const i = (f: (x: string) => boolean) => base.escrituras.findIndex(f);
  const cierre = i((x) => x === "cerrarEntrega");
  const anotado = i((x) => x.includes('"last_attempt_at"') && !x.includes('"status"'));
  const activacion = i((x) => x.includes('"status":"active"'));
  assert(1 < cierre && cierre < anotado && anotado < activacion, base.escrituras.join(" | "));

  const sinEntrega = await registrar();
  sinEntrega.base.datos.crearEntrega = () => Promise.resolve(false);
  const r2 = await servirWebhook("webhook_test", { id: sinEntrega.id }, sinEntrega.ctx);
  assertEquals([r2.estado, r2.cuerpo.error, sinEntrega.ctx.envios.length], [500, es("webhookErrorBase"), 0]);

  const sinTurno = await registrar(baseFalsa({ falla: { reservarPrueba: "40001" } }));
  const r3 = await servirWebhook("webhook_test", { id: sinTurno.id }, sinTurno.ctx);
  assertEquals([r3.estado, r3.cuerpo.error, sinTurno.ctx.envios.length], [500, es("webhookErrorBase"), 0]);
  assertEquals(sinTurno.base.entregas, [], "sin turno no se anota ninguna entrega");
});

Deno.test("prueba 2xx sobre un endpoint pending: la anota entregada y lo ACTIVA desde ahora (10 s atrás)", async () => {
  const { base, ctx, id } = await registrar();
  const r = await servirWebhook("webhook_test", { id }, ctx);
  const d = base.entregas[0];
  assertEquals([d.state, d.attempts, d.last_attempt_at, d.last_status_code, d.last_error, d.delivered_at, d.uncertain, d.latency_ms], ["delivered", 1, "now", 204, null, "now", false, 42]);
  const f = fila(base, id);
  assertEquals(f.status, "active");
  assertEquals((f as unknown as { cursor_at: string }).cursor_at, new Date(AHORA - 10_000).toISOString(), "el margen del feed: 10 s");
  assertEquals(ARRANQUE_MS, 10_000);
  assertEquals((f as unknown as { cursor_id: string }).cursor_id, "00000000-0000-0000-0000-000000000000");
  assertEquals([f.last_test_at, f.last_attempt_at, f.last_status_code, f.last_error, f.last_success_at], [new Date(AHORA).toISOString(), "now", 204, null, "now"]);
  const activacion = base.escrituras.find((x) => x.includes('"status":"active"'))!;
  assert(activacion.includes('"siEstado":["pending"]'), "la prueba activa SOLO desde pending");
  assertEquals(prueba(r), { delivered: true, status_code: 204, error_code: null, latency_ms: 42, uncertain: false, activated: true, message: es("webhookPruebaEntregada", { codigo: 204 }), notice: null });
  assertEquals((r.cuerpo.webhook as Record<string, unknown>).status, "active", "la respuesta trae el endpoint como quedó");
  assert(!("error" in r.cuerpo), "sin error arriba (adminInvoke lo tomaría como fallo)");
});

Deno.test("prueba que no llega: descartada (test_failed), el endpoint queda pending y anotado, y el mensaje dice por qué", async () => {
  const casos: Array<[Resultado, string, boolean, number | null, string]> = [
    [{ tipo: "respuesta", estado: 401, retryAfterS: null, latenciaMs: 5 }, es("webhookPruebaHttp", { codigo: 401 }), false, 401, "http_401"],
    [{ tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 5 }, es("webhookPrueba410"), false, 410, "http_410"],
    [{ tipo: "respuesta", estado: 301, retryAfterS: null, latenciaMs: 5 }, es("webhookPruebaHttp", { codigo: 301 }), false, 301, "http_301"],
    [{ tipo: "sin_enviar", clase: "tls", latenciaMs: 5 }, es("webhookPruebaTls"), false, null, "tls"],
    [{ tipo: "sin_enviar", clase: "dns", latenciaMs: 5 }, es("webhookPruebaDns"), false, null, "dns"],
    [{ tipo: "sin_enviar", clase: "direccion_bloqueada", latenciaMs: 5 }, es("webhookPruebaDireccion"), false, null, "direccion_bloqueada"],
    [{ tipo: "sin_enviar", clase: "conexion", latenciaMs: 5 }, es("webhookPruebaConexion"), false, null, "conexion"],
    [{ tipo: "sin_enviar", clase: "plazo", latenciaMs: 5 }, es("webhookPruebaPlazo"), false, null, "plazo"],
    [{ tipo: "sin_enviar", clase: "host_prohibido", latenciaMs: 5 }, es("webhookUrlHostProhibido"), false, null, "host_prohibido"],
    [{ tipo: "incierto", clase: "plazo", latenciaMs: 10_000 }, es("webhookPruebaPlazo"), true, null, "plazo"],
    [{ tipo: "incierto", clase: "respuesta_invalida", latenciaMs: 5 }, es("webhookPruebaIncierto"), true, null, "respuesta_invalida"],
  ];
  for (const [resultado, mensaje, incierto, codigo, error] of casos) {
    const base = baseFalsa();
    const { ctx, id } = await registrar(base);
    const r = await servirWebhook("webhook_test", { id }, { ...ctx, enviar: envio(ctx, resultado) });
    const caso = JSON.stringify(resultado);
    const d = base.entregas[0];
    assertEquals([d.state, d.drop_reason, d.uncertain, d.attempts, d.last_status_code, d.last_error, d.latency_ms], ["dropped", "test_failed", incierto, 1, codigo, error, resultado.latenciaMs], caso);
    const f = fila(base, id);
    assertEquals([f.status, f.last_attempt_at, f.last_status_code, f.last_error, f.last_success_at], ["pending", "now", codigo, error, null], `${caso}: un 410 en la prueba no detiene nada`);
    assertEquals(prueba(r), { delivered: false, status_code: codigo, error_code: error, latency_ms: resultado.latenciaMs, uncertain: incierto, activated: false, message: mensaje, notice: null }, caso);
    const w = r.cuerpo.webhook as Record<string, unknown>;
    assertEquals([w.status, w.last_status_code, w.last_error], ["pending", codigo, error], `${caso}: la respuesta trae el endpoint ya anotado`);
  }
});

Deno.test("prueba 200 (el 2xx más común) también activa; en inglés el mensaje sale en inglés", async () => {
  const base = baseFalsa();
  const { ctx, id } = await registrar(base);
  const r = await servirWebhook("webhook_test", { id }, { ...ctx, idioma: "en", enviar: envio(ctx, { tipo: "respuesta", estado: 200, retryAfterS: null, latenciaMs: 9 }) });
  assertEquals([prueba(r).activated, prueba(r).message], [true, msg("en", "webhookPruebaEntregada", { codigo: 200 })]);
});

Deno.test("prueba sobre un ACTIVO, pausado o detenido: solo mira si llega; no cambia el estado ni pisa los datos del despachador", async () => {
  for (const estado of ["active", "paused", "disabled"] as Estado[]) {
    const historia = { last_attempt_at: "t-despachador", last_status_code: 500, last_error: "http_500", last_success_at: "t-exito", consecutive_failures: 4 };
    const { base, ctx, id } = await enEstado(estado, historia);
    const r = await servirWebhook("webhook_test", { id }, ctx);
    assertEquals(r.estado, 200);
    const f = fila(base, id);
    assertEquals(f.status, estado);
    assertEquals([f.last_attempt_at, f.last_status_code, f.last_error, f.last_success_at], ["t-despachador", 500, "http_500", "t-exito"], `${estado}: los last_* son del despachador`);
    assertEquals(f.last_test_at, new Date(AHORA).toISOString(), `${estado}: queda cuándo se probó`);
    assertEquals(base.escrituras, ["reservarPrueba", "crearEntrega", "cerrarEntrega"], `${estado}: nada más se escribe`);
    assertEquals([prueba(r).delivered, prueba(r).activated, prueba(r).notice], [true, false, null]);
    assertEquals(base.entregas[0].state, "delivered", `${estado}: el resultado queda en su fila de prueba`);
  }
});

Deno.test("prueba: una cada 12 s por endpoint; la de hace 11,9 s cuenta, la de hace 12,1 s no", async () => {
  assertEquals(PRUEBA_CADA_MS, 12_000);
  const { base, ctx, id } = await registrar();
  assertEquals((await servirWebhook("webhook_test", { id }, ctx)).estado, 200);
  base.reloj.ms = AHORA + 11_900;
  const seguida = await servirWebhook("webhook_test", { id }, ctx);
  assertEquals([seguida.estado, seguida.cuerpo.error], [429, es("webhookPruebaMuySeguida", { segundos: 12 })]);
  assertEquals(ctx.envios.length, 1, "la seguida no salió");
  assertEquals(base.entregas.length, 1, "ni se anotó");
  base.reloj.ms = AHORA + 12_100;
  assertEquals((await servirWebhook("webhook_test", { id }, ctx)).estado, 200);
  assertEquals(ctx.envios.length, 2);
});

Deno.test("prueba: diez pedidos A LA VEZ mandan UNA sola (el turno se toma de una)", async () => {
  const { base, ctx, id } = await enEstado("active");
  const rs = await Promise.all(Array.from({ length: 10 }, () => servirWebhook("webhook_test", { id }, ctx)));
  assertEquals(rs.map((r) => r.estado).sort(), [200, 429, 429, 429, 429, 429, 429, 429, 429, 429]);
  assertEquals(ctx.envios.length, 1);
  assertEquals(base.entregas.length, 1);
});

Deno.test("prueba y reanudar: quién, y lo que frena ANTES de mandar (llave, persona, agencias, clave, secreto)", async () => {
  for (const accion of ["webhook_test", "webhook_resume"]) {
    const casos: Array<[string, Opciones, Partial<Contexto>, (b: Base) => void, number, ClaveDeMensaje]> = [
      ["otra admin", {}, { callerId: OTRA_ADMIN }, () => {}, 403, "webhookSoloDueno"],
      ["llave revocada", {}, {}, (b) => b.llaves.set(LLAVE, llave({ revoked_at: "2026-09-26T11:00:00Z" })), 409, "webhookLlaveNoActiva"],
      ["llave vencida", {}, {}, (b) => b.llaves.set(LLAVE, llave({ expires_at: new Date(AHORA - 1).toISOString() })), 409, "webhookLlaveNoActiva"],
      ["llave que ya no está", {}, {}, (b) => b.llaves.delete(LLAVE), 409, "webhookLlaveNoActiva"],
      ["llave sin Messenger", {}, {}, (b) => b.llaves.set(LLAVE, llave({ scopes: ["creators:read"] })), 409, "webhookLlaveSinMessenger"],
      ["persona de baja", { vigente: false }, {}, () => {}, 409, "webhookPersonaNoVigente"],
      ["no se sabe si la persona sigue", { falla: { llaveVigente: "x" } }, {}, () => {}, 503, "webhookErrorLectura"],
      ["dos agencias", { agencias: 2 }, {}, () => {}, 409, "webhookVariasAgencias"],
      ["no se pudo leer la llave", { falla: { llave: "x" } }, {}, () => {}, 503, "webhookErrorLectura"],
      ["sin KEK", {}, { entorno: () => undefined }, () => {}, 503, "webhookSinConfigurar"],
      ["con OTRA KEK (el secreto no abre)", {}, { entorno: (v) => (v === "WEBHOOK_SIGNING_KEK" ? "z".repeat(40) : undefined) }, () => {}, 409, "webhookSecretoIlegible"],
    ];
    for (const [nombre, opciones, extra, preparar, estado, clave] of casos) {
      const { base, ctx, id } = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN }, opciones);
      preparar(base);
      const r = await servirWebhook(accion, { id }, { ...ctx, ...extra });
      assertEquals([r.estado, r.cuerpo.error, ctx.envios.length], [estado, es(clave), 0], `${accion}: ${nombre}`);
      assertEquals(base.escrituras, [], `${accion}: ${nombre}: no se escribió nada (ni el turno)`);
    }
  }
});

// ─── reanudar ────────────────────────────────────────────────────────────────

Deno.test("reanudar desde una pausa de verdad: borra quién y cuándo, arranca 10 s atrás y con el detalle limpio", async () => {
  const { base, ctx, id } = await enEstado("paused", { paused_at: "2026-09-26T11:00:00Z", paused_by: OTRA_ADMIN, last_error: "http_500", last_status_code: 500, last_success_at: "viejo" });
  const r = await servirWebhook("webhook_resume", { id }, ctx);
  assertEquals(r.estado, 200);
  const f = fila(base, id);
  assertEquals([f.status, f.paused_at, f.paused_by], ["active", null, null]);
  assertEquals([f.last_error, f.last_status_code, f.last_success_at, f.last_attempt_at], [null, 204, "now", "now"]);
  assertEquals((f as unknown as { cursor_at: string }).cursor_at, new Date(AHORA - 10_000).toISOString());
  assert(base.escrituras.some((x) => x.includes('"status":"active"') && x.includes('"siEstado":["paused","disabled"]')), "reanudar activa solo desde paused/disabled");
  const w = r.cuerpo.webhook as Record<string, unknown>;
  assertEquals([w.status, w.paused_at, w.paused_by, w.last_error], ["active", null, null, null]);
  assertEquals([prueba(r).activated, prueba(r).notice], [true, null]);
});

Deno.test("reanudar desde detenido: limpia el motivo", async () => {
  const { base, ctx, id } = await enEstado("disabled", { disabled_reason: "receiver_failing", disabled_at: "x" });
  assertEquals((await servirWebhook("webhook_resume", { id }, ctx)).estado, 200);
  const f = fila(base, id);
  assertEquals([f.status, f.disabled_reason, f.disabled_at], ["active", null, null]);
});

Deno.test("reanudar: pending → 'no está parado'; activo → 'ya estaba activo'; sin mandar nada", async () => {
  for (const [estado, clave] of [["pending", "webhookNoEstaParado"], ["active", "webhookYaEstabaActivo"]] as const) {
    const { base, ctx, id } = await enEstado(estado);
    const r = await servirWebhook("webhook_resume", { id }, ctx);
    assertEquals([r.estado, r.cuerpo.error, ctx.envios.length, base.escrituras], [409, es(clave), 0, []], estado);
  }
});

Deno.test("reanudar que no llega: no activa, no pisa el detalle, y dice por qué", async () => {
  const { base, ctx, id } = await enEstado("disabled", { disabled_reason: "receiver_failing", disabled_at: "x", last_error: "http_500" });
  const r = await servirWebhook("webhook_resume", { id }, { ...ctx, enviar: envio(ctx, { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 3 }) });
  assertEquals(r.estado, 200);
  assertEquals([fila(base, id).status, fila(base, id).last_error], ["disabled", "http_500"]);
  assertEquals([prueba(r).delivered, prueba(r).activated, prueba(r).message], [false, false, es("webhookPruebaHttp", { codigo: 503 })]);
});

Deno.test("activar: si la base no deja (P0001), 200 con la prueba, el aviso y el endpoint releído; sin error arriba", async () => {
  const { ctx, id } = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN }, { falla: { actualizarEndpoint: "P0001" } });
  const r = await servirWebhook("webhook_resume", { id }, ctx);
  assertEquals(r.estado, 200);
  assert(!("error" in r.cuerpo), "adminInvoke tira ante un error en un 2xx y se perdería la prueba");
  assertEquals([prueba(r).delivered, prueba(r).activated, prueba(r).notice], [true, false, es("webhookNoSePudoActivar")]);
  assertEquals((r.cuerpo.webhook as Record<string, unknown>).status, "paused");
});

Deno.test("carrera: otro reanuda mientras esta manda → 'ya estaba activo', con el estado real", async () => {
  const { base, ctx, id } = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN });
  const r = await servirWebhook("webhook_resume", { id }, {
    ...ctx,
    enviar: envio(ctx, () => {
      base.endpoints.set(id, { ...fila(base, id), status: "active", paused_at: null, paused_by: null });
      return Promise.resolve(OK_204);
    }),
  });
  assertEquals(r.estado, 200);
  assertEquals([prueba(r).activated, prueba(r).notice], [false, es("webhookYaEstabaActivo")]);
  assertEquals((r.cuerpo.webhook as Record<string, unknown>).status, "active");
});

Deno.test("carrera: otra prueba lo activa mientras esta manda → 'ya estaba activo'; si lo borran, 404", async () => {
  const x = await registrar();
  const r = await servirWebhook("webhook_test", { id: x.id }, {
    ...x.ctx,
    enviar: envio(x.ctx, () => {
      x.base.endpoints.set(x.id, { ...fila(x.base, x.id), status: "active" });
      return Promise.resolve(OK_204);
    }),
  });
  assertEquals([r.estado, prueba(r).activated, prueba(r).notice], [200, false, es("webhookYaEstabaActivo")]);
  assertEquals((r.cuerpo.webhook as Record<string, unknown>).status, "active");

  const y = await registrar();
  const borrado = await servirWebhook("webhook_test", { id: y.id }, {
    ...y.ctx,
    enviar: envio(y.ctx, () => (y.base.endpoints.delete(y.id), Promise.resolve(OK_204))),
  });
  assertEquals([borrado.estado, borrado.cuerpo.error], [404, es("webhookNoExiste")]);
});

Deno.test("carrera: si la relectura falla después de mandar, se contesta igual con la prueba (sin el webhook)", async () => {
  const { base, ctx, id } = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN }, { falla: { actualizarEndpoint: "P0001" } });
  const r = await servirWebhook("webhook_resume", { id }, {
    ...ctx,
    enviar: envio(ctx, () => {
      base.datos.endpoint = () => Promise.reject(new FalloDeLectura("endpoint"));
      return Promise.resolve(OK_204);
    }),
  });
  assertEquals([r.estado, r.cuerpo.webhook, prueba(r).delivered, prueba(r).notice], [200, null, true, es("webhookErrorLectura")]);
});


// ─── lo que pasa MIENTRAS sale la prueba ─────────────────────────────────────

Deno.test("carrera: sobre un activo, pausado o detenido, si lo borran mientras sale → 404; si lo pausan o lo detienen, el estado real", async () => {
  for (const estado of ["active", "paused", "disabled"] as Estado[]) {
    const extra = estado === "disabled" ? { disabled_reason: "receiver_failing", disabled_at: "x" } : {};
    const a = await enEstado(estado, extra);
    const r = await servirWebhook("webhook_test", { id: a.id }, { ...a.ctx, enviar: envio(a.ctx, () => (a.base.endpoints.delete(a.id), Promise.resolve(OK_204))) });
    assertEquals([r.estado, r.cuerpo.error], [404, es("webhookNoExiste")], `${estado}: borrado`);
  }
  const b = await enEstado("active");
  const pausada = await servirWebhook("webhook_test", { id: b.id }, {
    ...b.ctx,
    enviar: envio(b.ctx, () => (b.base.endpoints.set(b.id, { ...fila(b.base, b.id), status: "paused", paused_by: OTRA_ADMIN, paused_at: "t" }), Promise.resolve(OK_204))),
  });
  assertEquals((pausada.cuerpo.webhook as Record<string, unknown>).status, "paused");
  assertEquals((pausada.cuerpo.webhook as Record<string, unknown>).paused_by, { id: OTRA_ADMIN, name: "Ana" });
  const c = await enEstado("active");
  const detenida = await servirWebhook("webhook_test", { id: c.id }, {
    ...c.ctx,
    enviar: envio(c.ctx, () => (c.base.endpoints.set(c.id, { ...fila(c.base, c.id), status: "disabled", disabled_reason: "key_revoked", disabled_at: "t" }), Promise.resolve(OK_204))),
  });
  assertEquals([(detenida.cuerpo.webhook as Record<string, unknown>).status, prueba(detenida).notice], ["disabled", null]);
});

Deno.test("carrera: reanudar que no llega y lo borran mientras sale → 404", async () => {
  const a = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN });
  const r = await servirWebhook("webhook_resume", { id: a.id }, {
    ...a.ctx,
    enviar: envio(a.ctx, () => (a.base.endpoints.delete(a.id), Promise.resolve<Resultado>({ tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 3 }))),
  });
  assertEquals([r.estado, r.cuerpo.error], [404, es("webhookNoExiste")]);
});

Deno.test("carrera: si mientras sale una prueba que FALLA otro lo activa y el despachador anota, no le pisa los last_* y cuenta el estado real", async () => {
  const x = await registrar();
  const r = await servirWebhook("webhook_test", { id: x.id }, {
    ...x.ctx,
    enviar: envio(x.ctx, () => {
      x.base.endpoints.set(x.id, { ...fila(x.base, x.id), status: "active", last_attempt_at: "t-despachador", last_status_code: 500, last_error: "http_500" });
      return Promise.resolve<Resultado>({ tipo: "respuesta", estado: 401, retryAfterS: null, latenciaMs: 5 });
    }),
  });
  assertEquals([r.estado, prueba(r).delivered, prueba(r).activated, prueba(r).notice], [200, false, false, null]);
  const f = fila(x.base, x.id);
  assertEquals([f.status, f.last_attempt_at, f.last_status_code, f.last_error], ["active", "t-despachador", 500, "http_500"], "la anotación va SOLO sobre pending");
  const w = r.cuerpo.webhook as Record<string, unknown>;
  assertEquals([w.status, w.last_status_code], ["active", 500], "la respuesta cuenta cómo quedó, no la foto de antes de mandar");

  const y = await registrar();
  const borrada = await servirWebhook("webhook_test", { id: y.id }, {
    ...y.ctx,
    enviar: envio(y.ctx, () => (y.base.endpoints.delete(y.id), Promise.resolve<Resultado>({ tipo: "respuesta", estado: 401, retryAfterS: null, latenciaMs: 5 }))),
  });
  assertEquals([borrada.estado, borrada.cuerpo.error], [404, es("webhookNoExiste")]);
});

Deno.test("carrera: si la relectura falla, el aviso dice que no se sabe SIEMPRE (webhook null solo se leería como 'sin webhook')", async () => {
  const x = await registrar();
  const r = await servirWebhook("webhook_test", { id: x.id }, {
    ...x.ctx,
    enviar: envio(x.ctx, () => {
      x.base.endpoints.set(x.id, { ...fila(x.base, x.id), status: "active" });
      x.base.datos.endpoint = () => Promise.reject(new FalloDeLectura("endpoint"));
      return Promise.resolve<Resultado>({ tipo: "respuesta", estado: 401, retryAfterS: null, latenciaMs: 5 });
    }),
  });
  assertEquals([r.estado, prueba(r).delivered, r.cuerpo.webhook, prueba(r).notice], [200, false, null, es("webhookErrorLectura")]);
  const a = await enEstado("active");
  const r2 = await servirWebhook("webhook_test", { id: a.id }, {
    ...a.ctx,
    enviar: envio(a.ctx, () => ((a.base.datos.endpoint = () => Promise.reject(new FalloDeLectura("endpoint"))), Promise.resolve(OK_204))),
  });
  assertEquals([r2.estado, r2.cuerpo.webhook, prueba(r2).notice], [200, null, es("webhookErrorLectura")]);
});

Deno.test("carrera: reanudar y le revocan la llave mientras sale → dice por qué no se activó (la llave), con el detenido", async () => {
  const casos: Array<[string, ClaveDeMensaje]> = [
    ["key_revoked", "webhookLlaveNoActiva"], ["key_expired", "webhookLlaveNoActiva"], ["scope_removed", "webhookLlaveSinMessenger"],
    ["person_inactive", "webhookPersonaNoVigente"], ["multi_agency", "webhookVariasAgencias"],
  ];
  for (const [motivo, clave] of casos) {
    const a = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN });
    const r = await servirWebhook("webhook_resume", { id: a.id }, {
      ...a.ctx,
      enviar: envio(a.ctx, () => {
        // La base lo detiene, y por eso mismo después no deja activarlo (P0001).
        a.base.endpoints.set(a.id, { ...fila(a.base, a.id), status: "disabled", disabled_reason: motivo, disabled_at: "t", paused_at: null, paused_by: null });
        a.base.cfg.falla = { actualizarEndpoint: "P0001" };
        return Promise.resolve(OK_204);
      }),
    });
    assertEquals([r.estado, prueba(r).activated, prueba(r).notice], [200, false, es(clave)], motivo);
    assertEquals((r.cuerpo.webhook as Record<string, unknown>).disabled_reason, motivo);
  }
});

Deno.test("activar: la base rechaza por otra cosa que una regla (no P0001) → 'probá de nuevo', no culpa a la llave", async () => {
  const { ctx, id } = await enEstado("paused", { paused_at: "x", paused_by: OTRA_ADMIN }, { falla: { actualizarEndpoint: "57014" } });
  const r = await servirWebhook("webhook_resume", { id }, ctx);
  assertEquals([r.estado, prueba(r).activated, prueba(r).notice], [200, false, es("webhookActivacionFallo")]);
});

Deno.test("prueba: el endpoint se toca recién con la entrega CERRADA (la base no activa sin una prueba entregada)", async () => {
  for (const [estado, accion] of [["pending", "webhook_test"], ["paused", "webhook_resume"]] as const) {
    const { base, ctx, id } = await enEstado(estado, estado === "paused" ? { paused_at: "x", paused_by: OTRA_ADMIN } : {});
    const cerrar = base.datos.cerrarEntrega;
    base.datos.cerrarEntrega = async (i, c) => {
      await new Promise((r) => setTimeout(r, 5)); // la base tarda en contestar
      return cerrar(i, c);
    };
    const r = await servirWebhook(accion, { id }, ctx);
    assertEquals([prueba(r).activated, prueba(r).notice, fila(base, id).status], [true, null, "active"], accion);
  }
});

Deno.test("prueba: si no se pudo cerrar la entrega, ni se intenta activar, y el aviso lo dice", async () => {
  for (const [estado, accion] of [["pending", "webhook_test"], ["paused", "webhook_resume"]] as const) {
    const { base, ctx, id } = await enEstado(estado, estado === "paused" ? { paused_at: "x", paused_by: OTRA_ADMIN } : {});
    base.datos.cerrarEntrega = () => Promise.resolve(false);
    const r = await servirWebhook(accion, { id }, ctx);
    assertEquals([r.estado, prueba(r).delivered, prueba(r).activated, prueba(r).notice], [200, true, false, es("webhookPruebaSinAnotar")], accion);
    assert(!base.escrituras.some((x) => x.includes('"status":"active"')), `${accion}: no se intentó activar`);
    assertEquals(fila(base, id).status, estado);
  }
});

Deno.test("prueba: si la entrega no se pudo anotar porque lo borraron, 404; si sigue ahí, 500", async () => {
  const a = await registrar();
  a.base.datos.crearEntrega = () => (a.base.endpoints.delete(a.id), Promise.resolve(false));
  const r = await servirWebhook("webhook_test", { id: a.id }, a.ctx);
  assertEquals([r.estado, r.cuerpo.error, a.ctx.envios.length], [404, es("webhookNoExiste"), 0]);
});

Deno.test("prueba: el cuerpo y la firma llevan la hora de AHORA (un receptor rechaza una firma vieja)", async () => {
  const { ctx, id } = await registrar();
  await servirWebhook("webhook_test", { id }, ctx);
  const e = ctx.envios[0];
  assertEquals(e.encabezados["webhook-timestamp"], String(Math.floor(AHORA / 1000)), "en segundos, de ahora");
  assertEquals(JSON.parse(e.cuerpo).created_at, new Date(AHORA).toISOString());
});

Deno.test("prueba que contesta 300: no es 'entregada' (un 3xx no se sigue y cuenta como fallo)", async () => {
  const { ctx, id } = await registrar();
  const r = await servirWebhook("webhook_test", { id }, { ...ctx, enviar: envio(ctx, { tipo: "respuesta", estado: 300, retryAfterS: null, latenciaMs: 5 }) });
  assertEquals([prueba(r).delivered, prueba(r).message], [false, es("webhookPruebaHttp", { codigo: 300 })]);
});

Deno.test("prueba sobre un pausado: la respuesta trae cuándo y quién (con nombre) lo pausó", async () => {
  const { ctx, id } = await enEstado("paused", { paused_at: "t-pausa", paused_by: OTRA_ADMIN });
  const r = await servirWebhook("webhook_test", { id }, ctx);
  const w = r.cuerpo.webhook as Record<string, unknown>;
  assertEquals([w.status, w.paused_at, w.paused_by], ["paused", "t-pausa", { id: OTRA_ADMIN, name: "Ana" }]);
});

Deno.test("secreto que no abre con la clave actual: 409, y queda en el log (le pasa a todos a la vez)", async () => {
  const { ctx, id } = await enEstado("active");
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    const r = await servirWebhook("webhook_test", { id }, { ...ctx, entorno: (v) => (v === "WEBHOOK_SIGNING_KEK" ? "z".repeat(40) : undefined) });
    assertEquals([r.estado, r.cuerpo.error], [409, es("webhookSecretoIlegible")]);
  } finally {
    console.error = original;
  }
  assertEquals(logs, ["[manage-api-keys] webhooks webhook_test: secreto ilegible"]);
});

// ─── alta: lo que no se sabe ─────────────────────────────────────────────────

Deno.test("alta: se resuelve el HOST de la URL (no la URL entera, que lleva el token)", async () => {
  const pedidos: string[] = [];
  const r = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK }, contexto(baseFalsa(), {
    resolver: (h) => (pedidos.push(h), Promise.resolve(["93.184.216.34"])),
  }));
  assertEquals(r.estado, 201);
  assertEquals([...new Set(pedidos)], ["hooks.integrador.com"]);
});

Deno.test("alta: si la base no contestó el INSERT (sin código), se mira: guardado → 201 con el secreto; no está → 500; no se puede mirar → 503", async () => {
  // Guardó, pero la respuesta se perdió.
  const g = baseFalsa();
  const crear = g.datos.crearEndpoint;
  g.datos.crearEndpoint = async (f) => (await crear(f), { ok: false as const, codigo: null });
  const r = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK }, contexto(g));
  assertEquals(r.estado, 201);
  const secreto = r.cuerpo.secret as string;
  assertEquals(fila(g, (r.cuerpo.webhook as { id: string }).id).secret_last4, secreto.slice(-4), "el secreto es el de la fila que quedó");
  // No guardó.
  const n = baseFalsa();
  n.datos.crearEndpoint = () => Promise.resolve({ ok: false as const, codigo: null });
  const r2 = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK }, contexto(n));
  assertEquals([r2.estado, r2.cuerpo.error, "secret" in r2.cuerpo], [500, es("webhookErrorBase"), false]);
  // No se puede saber.
  const u = baseFalsa();
  u.datos.crearEndpoint = () => ((u.cfg.falla = { endpoint: "x" }), Promise.resolve({ ok: false as const, codigo: null }));
  const r3 = await servirWebhook("webhook_create", { key_id: LLAVE, url: URL_OK }, contexto(u));
  assertEquals([r3.estado, r3.cuerpo.error, "secret" in r3.cuerpo], [503, es("webhookAltaIncierta"), false]);
});

// ─── pausar, borrar, entregas ────────────────────────────────────────────────

Deno.test("pausar: cualquier admin, solo un activo, y queda quién", async () => {
  const { base, ctx, id } = await enEstado("active");
  const r = await servirWebhook("webhook_pause", { id }, { ...ctx, callerId: OTRA_ADMIN });
  assertEquals(r.estado, 200);
  const f = fila(base, id);
  assertEquals([f.status, f.paused_by, f.paused_at], ["paused", OTRA_ADMIN, "now"]);
  assertEquals((r.cuerpo.webhook as { paused_by: unknown }).paused_by, { id: OTRA_ADMIN, name: "Ana" });
  assert(base.escrituras[0].includes('"siEstado":["active"]'));
});

Deno.test("pausar solo un activo: contra todos los demás estados, sin cambiar nada (ni quién pausó)", async () => {
  for (const estado of ["pending", "paused", "disabled"] as Estado[]) {
    const { base, ctx, id } = await enEstado(estado, estado === "paused" ? { paused_by: DUENA, paused_at: "antes" } : {});
    const antes = { ...fila(base, id) };
    const r = await servirWebhook("webhook_pause", { id }, { ...ctx, callerId: OTRA_ADMIN });
    assertEquals([r.estado, r.cuerpo.error], [409, es("webhookNoEstaActivo")], estado);
    assertEquals(fila(base, id), antes, estado);
  }
});

Deno.test("borrar: cualquier admin; lo que no existe, 404", async () => {
  const { base, ctx, id } = await registrar();
  const r = await servirWebhook("webhook_delete", { id }, { ...ctx, callerId: OTRA_ADMIN });
  assertEquals([r.estado, r.cuerpo], [200, { success: true, id }]);
  assertEquals(base.endpoints.size, 0);
  assertEquals((await servirWebhook("webhook_delete", { id }, ctx)).estado, 404);
});

Deno.test("entregas: cualquier admin, tope de 50, filtro de fallidas solo con true", async () => {
  const { base, ctx, id } = await registrar();
  for (const [limit, esperado] of [[undefined, 50], [10, 10], [500, 50], [0, 1], [-3, 1], [2.5, 50], ["20", 50]] as const) {
    base.escrituras.length = 0;
    const r = await servirWebhook("webhook_deliveries", { id, limit, only_failed: true }, { ...ctx, callerId: OTRA_ADMIN });
    assertEquals(r.estado, 200);
    assertEquals(base.escrituras, [`entregas ${esperado} true`], `limit ${limit}`);
  }
  for (const body of [{ id }, { id, only_failed: false }, { id, only_failed: "true" }]) {
    base.escrituras.length = 0;
    await servirWebhook("webhook_deliveries", body, ctx);
    assertEquals(base.escrituras, ["entregas 50 false"], JSON.stringify(body));
  }
});

Deno.test("entregas: solo las columnas de la lista (nunca el cuerpo firmado, el endpoint ni la agencia) y el webhook al lado", async () => {
  const { base, ctx, id } = await registrar();
  await servirWebhook("webhook_test", { id }, ctx);
  assert("body" in base.entregas[0] && "tenant_id" in base.entregas[0], "la base falsa sí las tiene");
  const r = await servirWebhook("webhook_deliveries", { id }, { ...ctx, callerId: OTRA_ADMIN });
  const filas = r.cuerpo.deliveries as Record<string, unknown>[];
  assertEquals(filas.length, 1);
  assertEquals(Object.keys(filas[0]).sort(), [...CLAVES_ENTREGA].sort());
  assertEquals((r.cuerpo.webhook as Record<string, unknown>).status, "active");
  assert(!JSON.stringify(r.cuerpo).includes("mvk_live_ab12cd"), "ni rastro del cuerpo firmado (lleva el prefijo de la llave)");
  for (const prohibida of ["body", "tenant_id", "endpoint_id"]) assert(!(CLAVES_ENTREGA as readonly string[]).includes(prohibida), prohibida);
  assertEquals(COLS_ENTREGA.split(", "), [...CLAVES_ENTREGA]);
});

Deno.test("entregas: lo que la página necesita para pintar cada fila, con sus valores", async () => {
  const { base, ctx, id } = await registrar();
  await servirWebhook("webhook_test", { id }, { ...ctx, enviar: envio(ctx, { tipo: "incierto", clase: "plazo", latenciaMs: 10_000 }) });
  base.entregas[0].created_at = "t-creada";
  const r = await servirWebhook("webhook_deliveries", { id }, { ...ctx, callerId: OTRA_ADMIN });
  assertEquals((r.cuerpo.deliveries as unknown[])[0], {
    id: base.entregas[0].id, event_type: "webhook.test", message_count: null, state: "dropped", drop_reason: "test_failed",
    attempts: 1, last_attempt_at: "now", last_status_code: null, last_error: "plazo", latency_ms: 10_000, uncertain: true,
    created_at: "t-creada", delivered_at: null,
  });
});

Deno.test("los errores de la base: escribir → 500; leer → 503 y nunca 'no existe' (ni en pausar, borrar, entregas o probar)", async () => {
  for (const accion of ["webhook_pause", "webhook_delete", "webhook_deliveries", "webhook_test", "webhook_resume"]) {
    const { base, ctx, id } = await enEstado("active");
    base.datos.endpoint = () => Promise.reject(new FalloDeLectura("endpoint"));
    const r = await servirWebhook(accion, { id }, ctx);
    assertEquals([r.estado, r.cuerpo.error, base.escrituras, ctx.envios.length], [503, es("webhookErrorLectura"), [], 0], accion);
  }
  const { base, ctx, id } = await enEstado("active");
  base.datos.entregas = () => Promise.reject(new FalloDeLectura("entregas"));
  assertEquals((await servirWebhook("webhook_deliveries", { id }, ctx)).estado, 503);
  base.datos.actualizarEndpoint = () => Promise.resolve({ ok: false as const, codigo: "P0001" });
  const p = await servirWebhook("webhook_pause", { id }, { ...ctx, callerId: OTRA_ADMIN });
  assertEquals([p.estado, p.cuerpo.error], [500, es("webhookErrorBase")]);
  base.datos.borrarEndpoint = () => Promise.resolve(null);
  assertEquals((await servirWebhook("webhook_delete", { id }, ctx)).estado, 500);
  base.datos.borrarEndpoint = () => Promise.resolve(false); // otro lo borró entre la lectura y el delete
  assertEquals((await servirWebhook("webhook_delete", { id }, ctx)).estado, 404);
});

Deno.test("algo inesperado (un bug): 500 genérico, y en el log solo el nombre del error", async () => {
  const { base, ctx, id } = await enEstado("active");
  base.datos.crearEntrega = () => Promise.reject(new TypeError(`MARCA ${URL_OK}`));
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    const r = await servirWebhook("webhook_test", { id }, ctx);
    assertEquals([r.estado, r.cuerpo.error], [500, es("webhookErrorInesperado")]);
    assert(!JSON.stringify(r.cuerpo).includes("MARCA"));
  } finally {
    console.error = original;
  }
  assertEquals(logs, ["[manage-api-keys] webhooks webhook_test: TypeError"]);
});

// ─── id, acción, list, resumen ───────────────────────────────────────────────

Deno.test("id: tiene que ser un uuid entero (se recorta y se busca en minúscula); lo que no existe es 404", async () => {
  const { ctx, id } = await registrar();
  for (const malo of ["no-uuid", "", undefined, 7, `x${id}`, `${id}0`, `${id}-${id}`]) {
    const r = await servirWebhook("webhook_deliveries", { id: malo }, ctx);
    assertEquals([r.estado, r.cuerpo.error], [400, es("webhookIdRequerido")], String(malo));
  }
  assertEquals((await servirWebhook("webhook_deliveries", { id: `  ${id}\n` }, ctx)).estado, 200);
  assertEquals((await servirWebhook("webhook_deliveries", { id: id.toUpperCase() }, ctx)).estado, 200, "un uuid en mayúsculas se busca en minúscula");
  assertEquals((await servirWebhook("webhook_pause", { id: "eeeeeeee-0000-4000-8000-000000000009" }, ctx)).estado, 404);
  assertEquals((await servirWebhook("webhook_create", { key_id: `${LLAVE}x`, url: URL_OK }, ctx)).cuerpo.error, es("idRequerido"));
});

Deno.test("acción desconocida: 400 con su nombre, sin mirar nada más", async () => {
  const base = baseFalsa({ falla: { endpoint: "x" } });
  const r = await servirWebhook("webhook_rotar", {}, contexto(base));
  assertEquals([r.estado, r.cuerpo.error], [400, es("accionDesconocida", { accion: "webhook_rotar" })]);
});

Deno.test("list: el webhook de cada llave, sin URL ni secreto, con quién lo pausó; si no se pudo consultar, null", async () => {
  const { base, id } = await enEstado("paused", { paused_by: OTRA_ADMIN, paused_at: "x" });
  const mapa = (await webhooksDeLlaves(base.datos, [LLAVE, LLAVE_SIN_MSG]))!;
  assertEquals([...mapa.keys()], [LLAVE]);
  const r = mapa.get(LLAVE)!;
  assertEquals([r.id, r.paused_by], [id, { id: OTRA_ADMIN, name: "Ana" }]);
  const texto = JSON.stringify(r);
  for (const prohibido of ["secreto123", "secret_cipher", "secret_nonce", "cursor", '"url"']) assert(!texto.includes(prohibido), prohibido);
  assertEquals((await webhooksDeLlaves(base.datos, []))!.size, 0);
  base.datos.endpointsDeLlaves = () => Promise.reject(new FalloDeLectura("endpoints"));
  assertEquals(await webhooksDeLlaves(base.datos, [LLAVE]), null, "no se sabe ≠ sin webhook");
});

Deno.test("list: conWebhooks pone el webhook de cada llave; sin mapa, todas en null Y webhooks_unknown", async () => {
  const { base } = await registrar();
  const mapa = (await webhooksDeLlaves(base.datos, [LLAVE]))!;
  const keys = [{ id: LLAVE, name: "a" }, { id: LLAVE_SIN_MSG, name: "b" }];
  const bien = conWebhooks(keys, mapa);
  assertEquals([bien.webhooks_unknown, bien.keys[0].webhook?.api_key_id, bien.keys[1].webhook, bien.keys[0].name], [false, LLAVE, null, "a"]);
  const noSe = conWebhooks(keys, null);
  assertEquals([noSe.webhooks_unknown, noSe.keys.map((k) => k.webhook)], [true, [null, null]]);
});

Deno.test("resumen: exactamente estos campos, con los valores de la fila (lo que pinta el chip de estado)", async () => {
  const { base, r, id } = await registrar();
  const f = fila(base, id);
  assertEquals(r.cuerpo.webhook, {
    id, api_key_id: LLAVE, url_host: "hooks.integrador.com", status: "pending", disabled_reason: null, disabled_at: null,
    paused_at: null, paused_by: null, exclude_own: true, secret_last4: (r.cuerpo.secret as string).slice(-4), created_at: f.created_at,
    last_attempt_at: null, last_success_at: null, last_status_code: null, last_error: null, last_test_at: null,
    consecutive_failures: 0, failing_since: null, next_attempt_at: null,
  });
  base.endpoints.set(id, { ...f, status: "disabled", disabled_reason: "receiver_gone", disabled_at: "t", exclude_own: false, last_error: "http_410", last_status_code: 410, consecutive_failures: 3, failing_since: "f", next_attempt_at: "n", last_test_at: "p", last_attempt_at: "a", last_success_at: "s", paused_at: "pa" });
  const w = (await webhooksDeLlaves(base.datos, [LLAVE]))!.get(LLAVE)!;
  assertEquals(
    [w.status, w.disabled_reason, w.disabled_at, w.exclude_own, w.last_error, w.last_status_code, w.consecutive_failures, w.failing_since, w.next_attempt_at, w.last_test_at, w.last_attempt_at, w.last_success_at, w.paused_at],
    ["disabled", "receiver_gone", "t", false, "http_410", 410, 3, "f", "n", "p", "a", "s", "pa"],
  );
});

Deno.test("el secreto aparece SOLO en la respuesta del alta", async () => {
  const { ctx, r: alta, id } = await registrar();
  const secreto = alta.cuerpo.secret as string;
  for (const accion of ["webhook_test", "webhook_deliveries", "webhook_pause", "webhook_resume", "webhook_delete"]) {
    const r = await servirWebhook(accion, { id }, ctx);
    const texto = JSON.stringify(r.cuerpo);
    assert(!texto.includes(secreto) && !texto.includes(secreto.slice(6, 20)), `${accion} devolvió el secreto`);
    assert(!texto.includes("secreto123"), `${accion} devolvió la URL entera`);
  }
});

// ─── crearDatos: lo que de verdad le llega a PostgREST ───────────────────────
// Las guardas de estado, el id, el turno y el tope de entregas viven en las
// cadenas de crearDatos; la base falsa de arriba las reimplementa.

const AGENCIA = "ffffffff-0000-4000-8000-000000000001";
const EP = "dddddddd-0000-4000-8000-000000000099";
type Llamada = [string, ...unknown[]];
type RespuestaFalsa = { data?: unknown; error?: unknown; count?: number | null };
/** Un cliente de supabase-js que anota cada llamada de la cadena y contesta
 *  `respuesta` (o lo que devuelva, según la tabla y las llamadas). */
function clienteGrabador(respuesta: RespuestaFalsa | ((tabla: string, llamadas: Llamada[]) => RespuestaFalsa) = {}) {
  const consultas: { tabla: string; llamadas: Llamada[] }[] = [];
  const cadena = (tabla: string, primera?: Llamada) => {
    const c = { tabla, llamadas: (primera ? [primera] : []) as Llamada[] };
    consultas.push(c);
    const p: unknown = new Proxy({}, {
      get(_, prop) {
        if (prop === "then") {
          const r = Promise.resolve({ data: null, error: null, count: null, ...(typeof respuesta === "function" ? respuesta(tabla, c.llamadas) : respuesta) });
          return r.then.bind(r);
        }
        return (...args: unknown[]) => (c.llamadas.push([String(prop), ...args]), p);
      },
    });
    return p;
  };
  return { consultas, cliente: { from: (t: string) => cadena(t), rpc: (n: string, a: unknown) => cadena(`rpc:${n}`, ["rpc", a]) } };
}
const tiene = (ll: Llamada[], ...esperada: unknown[]) => ll.some((l) => JSON.stringify(l) === JSON.stringify(esperada));

Deno.test("crearDatos: cada cambio va por id, agencia y estado de origen", async () => {
  const g = clienteGrabador({ data: [] });
  const d = crearDatos(g.cliente, AGENCIA);
  await d.actualizarEndpoint(EP, { status: "paused" }, ["active"]);
  await d.borrarEndpoint(EP);
  await d.cerrarEntrega(LLAVE, { attempts: 1 });
  const [cambio, baja, cierre] = g.consultas;
  assertEquals([cambio.tabla, baja.tabla, cierre.tabla], ["api_webhook_endpoints", "api_webhook_endpoints", "api_webhook_deliveries"]);
  assert(tiene(cambio.llamadas, "update", { status: "paused" }));
  assert(tiene(cambio.llamadas, "eq", "id", EP), "sin .eq(id) cambia TODOS los endpoints de la agencia");
  assert(tiene(cambio.llamadas, "in", "status", ["active"]), "sin .in(status) no queda ninguna guarda de estado");
  assert(tiene(baja.llamadas, "delete") && tiene(baja.llamadas, "eq", "id", EP), "sin .eq(id) borra TODOS");
  assert(tiene(cierre.llamadas, "eq", "id", LLAVE));
  assert(tiene(cierre.llamadas, "eq", "state", "pending"), "una entrega cerrada no se vuelve a escribir");
});

Deno.test("crearDatos: el turno de la prueba es UN update condicional sobre last_test_at", async () => {
  const g = clienteGrabador({ data: [] });
  assertEquals(await crearDatos(g.cliente, AGENCIA).reservarPrueba(EP, Date.parse("2026-09-26T11:59:48Z")), { ok: true, valor: null }, "0 filas = no le tocaba");
  const ll = g.consultas[0].llamadas;
  assertEquals(g.consultas[0].tabla, "api_webhook_endpoints");
  assert(tiene(ll, "update", { last_test_at: "now" }));
  assert(tiene(ll, "eq", "id", EP));
  assert(tiene(ll, "or", "last_test_at.is.null,last_test_at.lt.2026-09-26T11:59:48.000Z"), JSON.stringify(ll));
  const conFila = clienteGrabador({ data: [{ id: EP }] });
  assertEquals(await crearDatos(conFila.cliente, AGENCIA).reservarPrueba(EP, 0), { ok: true, valor: { id: EP } as unknown as FilaEndpoint });
});

Deno.test("crearDatos: entregas del endpoint, las más nuevas primero, con tope, las columnas de la lista y el filtro de fallidas", async () => {
  const g = clienteGrabador({ data: [] });
  const d = crearDatos(g.cliente, AGENCIA);
  await d.entregas(EP, 7, true);
  await d.entregas(EP, 7, false);
  const [fallidas, todas] = g.consultas.map((c) => c.llamadas);
  for (const ll of [fallidas, todas]) {
    assert(tiene(ll, "select", COLS_ENTREGA));
    assert(tiene(ll, "eq", "endpoint_id", EP));
    assert(tiene(ll, "order", "created_at", { ascending: false }));
    assert(tiene(ll, "limit", 7));
  }
  assert(tiene(fallidas, "neq", "state", "delivered"));
  assert(!todas.some((l) => l.includes("state")), "sin only_failed van todas");
});

Deno.test("crearDatos: las agencias se cuentan TODAS (sin filtro), con head; la vigencia es la de la base", async () => {
  const g = clienteGrabador({ count: 1 });
  assertEquals(await crearDatos(g.cliente, AGENCIA).agencias(), 1);
  assertEquals(g.consultas[0].tabla, "tenants");
  assertEquals(g.consultas[0].llamadas, [["select", "id", { count: "exact", head: true }]]);
  const sinConteo = clienteGrabador({ count: null });
  let tiro = false;
  try { await crearDatos(sinConteo.cliente, AGENCIA).agencias(); } catch (e) { tiro = e instanceof FalloDeLectura; }
  assert(tiro, "sin conteo no se asume 1");
  for (const [data, esperado] of [[true, true], [false, false], [null, false], ["true", false]] as const) {
    const v = clienteGrabador({ data });
    assertEquals(await crearDatos(v.cliente, AGENCIA).llaveVigente(LLAVE), esperado, String(data));
    assertEquals(v.consultas[0].llamadas, [["rpc", { _id: LLAVE }]]);
  }
});

Deno.test("crearDatos: toda consulta a api_keys y api_webhook_* va con .eq(tenant_id, ESTA agencia), y un insert no la deja pisar", async () => {
  const g = clienteGrabador({ data: null });
  const d = crearDatos(g.cliente, AGENCIA);
  const OTRA = "ffffffff-0000-4000-8000-00000000dead";
  await d.llave(LLAVE); await d.endpoint(EP); await d.endpointDeLlave(LLAVE); await d.endpointsDeLlaves([LLAVE]);
  await d.crearEndpoint({ id: EP, tenant_id: OTRA }); await d.actualizarEndpoint(EP, {}, ["active"]); await d.reservarPrueba(EP, 0);
  await d.borrarEndpoint(EP); await d.crearEntrega({ id: EP, tenant_id: OTRA }); await d.cerrarEntrega(EP, {}); await d.entregas(EP, 1, false);
  const deApi = g.consultas.filter((c) => c.tabla.startsWith("api_"));
  assertEquals(deApi.length, 11);
  for (const c of deApi) {
    const porFiltro = tiene(c.llamadas, "eq", "tenant_id", AGENCIA);
    const porInsert = c.llamadas.some((l) => l[0] === "insert" && (l[1] as Record<string, unknown>).tenant_id === AGENCIA);
    assert(porFiltro || porInsert, `${c.tabla} sin la agencia: ${JSON.stringify(c.llamadas)}`);
    const otros = c.llamadas.filter((l) => l.includes("tenant_id") && !(l[0] === "eq" && l[2] === AGENCIA));
    assertEquals(otros, [], `${c.tabla}: otro filtro sobre tenant_id`);
  }
  assert(tiene(g.consultas[3].llamadas, "in", "api_key_id", [LLAVE]), "list: solo las llaves pedidas");
});

Deno.test("crearDatos: de un error de la base queda el código; una lectura que falla TIRA (no pasa por vacía)", async () => {
  const g = clienteGrabador({ error: { code: "23505", details: "(la fila entera)", message: "duplicate" } });
  const d = crearDatos(g.cliente, AGENCIA);
  assertEquals(await d.crearEndpoint({ id: EP }), { ok: false, codigo: "23505" }, "23505 es 'ya existe' (409), no un 500");
  assertEquals(await d.actualizarEndpoint(EP, {}, ["active"]), { ok: false, codigo: "23505" });
  assertEquals(await d.reservarPrueba(EP, 0), { ok: false, codigo: "23505" });
  assertEquals(await d.borrarEndpoint(EP), null);
  assertEquals(await d.crearEntrega({}), false);
  assertEquals(await d.cerrarEntrega(EP, {}), false);
  assertEquals((await d.nombres([DUENA])).size, 0, "los nombres son cosméticos: sin ellos se sigue");
  const lecturas: Array<[string, () => Promise<unknown>]> = [
    ["llave", () => d.llave(LLAVE)], ["llaveVigente", () => d.llaveVigente(LLAVE)], ["agencias", () => d.agencias()],
    ["endpoint", () => d.endpoint(EP)], ["endpointDeLlave", () => d.endpointDeLlave(LLAVE)],
    ["endpointsDeLlaves", () => d.endpointsDeLlaves([LLAVE])], ["entregas", () => d.entregas(EP, 1, false)],
  ];
  for (const [nombre, leer] of lecturas) {
    let tiro = false;
    try { await leer(); } catch (e) { tiro = e instanceof FalloDeLectura; }
    assert(tiro, `${nombre}: un error de la base no es 'no hay'`);
  }
});

Deno.test("crearDatos: con la base fallando, lo que la base trae en message/details/hint no sale ni en la respuesta ni en los logs", async () => {
  const MARCA = "MARCA-9f3c";
  const logs: string[] = [];
  const original = { error: console.error, log: console.log, warn: console.warn };
  const anota = (...a: unknown[]) => void logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  console.error = anota; console.log = anota; console.warn = anota;
  try {
    const g = clienteGrabador({ error: { code: "XX000", message: MARCA, details: `${MARCA} ${URL_OK}`, hint: MARCA }, data: { url: URL_OK, secret_cipher: MARCA } });
    const ctx = contexto(baseFalsa(), { datos: crearDatos(g.cliente, AGENCIA) });
    for (const accion of ["webhook_create", "webhook_test", "webhook_resume", "webhook_pause", "webhook_delete", "webhook_deliveries"]) {
      const r = await servirWebhook(accion, { id: EP, key_id: LLAVE, url: URL_OK }, ctx);
      assertEquals(r.estado, 503, accion);
      assert(!JSON.stringify(r.cuerpo).includes(MARCA) && !JSON.stringify(r.cuerpo).includes("secreto123"), accion);
    }
    assertEquals(await webhooksDeLlaves(crearDatos(g.cliente, AGENCIA), [LLAVE]), null);
  } finally {
    Object.assign(console, original);
  }
  assert(logs.length > 0, "algo se anotó");
  for (const l of logs) {
    assert(!l.includes(MARCA) && !l.includes("secreto123"), l);
    assertMatch(l, /^\[manage-api-keys\] webhooks [a-z_ ]+: XX000$/);
  }
});

const columnasDe = (ll: Llamada[]) => String(ll.find((l) => l[0] === "select")?.[1] ?? "").split(",").map((x) => x.trim()).sort();
/** Todas las de FilaEndpoint y Llave: si la interfaz gana un campo, esto no compila hasta sumarlo. */
const COLUMNAS_FILA = Object.keys({
  id: 1, api_key_id: 1, acts_as_user_id: 1, url: 1, url_host: 1, exclude_own: 1, status: 1, disabled_reason: 1, disabled_at: 1,
  paused_by: 1, paused_at: 1, secret_cipher: 1, secret_nonce: 1, secret_key_version: 1, secret_last4: 1, next_attempt_at: 1,
  consecutive_failures: 1, failing_since: 1, last_attempt_at: 1, last_success_at: 1, last_status_code: 1, last_error: 1,
  last_test_at: 1, created_by: 1, created_at: 1,
} satisfies Record<keyof FilaEndpoint, 1>).sort();
const COLUMNAS_LLAVE = Object.keys({ id: 1, key_prefix: 1, scopes: 1, expires_at: 1, revoked_at: 1, acts_as_user_id: 1 } satisfies Record<keyof Llave, 1>).sort();

Deno.test("crearDatos: cada lectura pide las columnas que el módulo usa, por su clave, y 0 filas es 'no hay' (maybeSingle)", async () => {
  const g = clienteGrabador({ data: null });
  const d = crearDatos(g.cliente, AGENCIA);
  await d.llave(LLAVE); await d.endpoint(EP); await d.endpointDeLlave(LLAVE); await d.endpointsDeLlaves([LLAVE]);
  assertEquals(g.consultas.map((c) => c.tabla), ["api_keys", "api_webhook_endpoints", "api_webhook_endpoints", "api_webhook_endpoints"]);
  const [llaveLl, endpoint, deLlave, deLlaves] = g.consultas.map((c) => c.llamadas);
  assertEquals(columnasDe(llaveLl), COLUMNAS_LLAVE);
  for (const ll of [endpoint, deLlave, deLlaves]) assertEquals(columnasDe(ll), COLUMNAS_FILA);
  assert(tiene(llaveLl, "eq", "id", LLAVE), "la llave, por su id");
  assert(tiene(endpoint, "eq", "id", EP), "el endpoint, por su id");
  assert(tiene(deLlave, "eq", "api_key_id", LLAVE), "el de la llave, por api_key_id");
  for (const ll of [llaveLl, endpoint, deLlave]) {
    assert(tiene(ll, "maybeSingle") && !tiene(ll, "single"), "con .single(), 0 filas es un error (PGRST116): 'no existe' pasaría a 503");
  }
  const v = clienteGrabador({ data: true });
  await crearDatos(v.cliente, AGENCIA).llaveVigente(LLAVE);
  assertEquals(v.consultas.map((c) => c.tabla), ["rpc:api_key_vigente"], "persona Y agencia de la llave");
});

Deno.test("crearDatos: las escrituras que el módulo lee después PIDEN la fila (sin .select, supabase-js devuelve data null)", async () => {
  const g = clienteGrabador({ data: null });
  const d = crearDatos(g.cliente, AGENCIA);
  await d.crearEndpoint({ id: EP }); await d.actualizarEndpoint(EP, {}, ["active"]); await d.reservarPrueba(EP, 0); await d.borrarEndpoint(EP);
  const [alta, cambio, turno, baja] = g.consultas.map((c) => c.llamadas);
  for (const ll of [alta, cambio, turno]) assertEquals(columnasDe(ll), COLUMNAS_FILA);
  assert(tiene(alta, "single"), "el alta devuelve UNA fila");
  assert(tiene(baja, "select", "id"), "sin .select, delete devuelve data null y todo borrado sería 404");
  const fila1 = { id: EP } as unknown as FilaEndpoint;
  assertEquals(await crearDatos(clienteGrabador({ data: { id: EP } }).cliente, AGENCIA).crearEndpoint({ id: EP }), { ok: true, valor: fila1 });
  const conFila = crearDatos(clienteGrabador({ data: [{ id: EP }] }).cliente, AGENCIA);
  assertEquals(await conFila.actualizarEndpoint(EP, { status: "paused" }, ["active"]), { ok: true, valor: fila1 });
  assertEquals(await conFila.borrarEndpoint(EP), true);
  assertEquals(await crearDatos(clienteGrabador({ data: [] }).cliente, AGENCIA).borrarEndpoint(EP), false, "0 filas borradas = no estaba");
});

Deno.test("crearDatos: la entrega se anota y se cierra con lo que se le pasa (si no, la prueba queda pending y la base no activa)", async () => {
  const g = clienteGrabador({ data: null });
  const d = crearDatos(g.cliente, AGENCIA);
  await d.crearEntrega({ id: EP, event_type: "webhook.test" });
  await d.cerrarEntrega(EP, { attempts: 1, state: "delivered", delivered_at: "now" });
  assert(tiene(g.consultas[0].llamadas, "insert", { id: EP, event_type: "webhook.test", tenant_id: AGENCIA }));
  assert(tiene(g.consultas[1].llamadas, "update", { attempts: 1, state: "delivered", delivered_at: "now" }), JSON.stringify(g.consultas[1].llamadas));
});

Deno.test("crearDatos: con las lecturas bien y las ESCRITURAS fallando, nada de lo que trae la base sale (ni en la respuesta ni en el log)", async () => {
  const MARCA = "MARCA-7c1e";
  const { base, id } = await enEstado("active");
  const ep = fila(base, id);
  const esEscritura = (ll: Llamada[]) => ll.some((l) => l[0] === "insert" || l[0] === "update" || l[0] === "delete");
  const g = clienteGrabador((tabla, ll) => {
    if (esEscritura(ll)) {
      // El turno pasa (para llegar a la entrega); el resto de las escrituras falla.
      if (tabla === "api_webhook_endpoints" && tiene(ll, "update", { last_test_at: "now" })) return { data: [ep] };
      return { error: { code: "XX000", message: MARCA, details: `${MARCA} ${URL_OK}`, hint: MARCA } };
    }
    if (tabla === "api_keys") return { data: llave() };
    if (tabla === "rpc:api_key_vigente") return { data: true };
    if (tabla === "tenants") return { count: 1 };
    if (tabla === "api_webhook_endpoints") return { data: tiene(ll, "eq", "api_key_id", LLAVE) ? null : ep };
    return { data: [] };
  });
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  const estados: number[] = [];
  try {
    const ctx = contexto(baseFalsa(), { datos: crearDatos(g.cliente, AGENCIA) });
    for (const accion of ["webhook_create", "webhook_test", "webhook_pause", "webhook_delete"]) {
      const r = await servirWebhook(accion, { id, key_id: LLAVE, url: URL_OK }, { ...ctx, callerId: DUENA });
      estados.push(r.estado);
      const texto = JSON.stringify(r.cuerpo);
      assert(!texto.includes(MARCA) && !texto.includes("secreto123"), accion);
    }
  } finally {
    console.error = original;
  }
  assertEquals(estados, [500, 500, 500, 500]);
  assertEquals(logs, [
    "[manage-api-keys] webhooks alta: XX000",
    "[manage-api-keys] webhooks entrega: XX000",
    "[manage-api-keys] webhooks cambio: XX000",
    "[manage-api-keys] webhooks baja: XX000",
  ]);
});

// ─── estructura ──────────────────────────────────────────────────────────────

const FUENTE = Deno.readTextFileSync(new URL("./webhooks.ts", import.meta.url));
const CODIGO = FUENTE.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");

Deno.test("estructura: cada consulta a api_keys y api_webhook_* va atada a la agencia (con .eq, no .neq; o dentro del insert)", () => {
  const sentencias: string[] = [];
  for (const tabla of ['from("api_keys")', 'from("api_webhook_endpoints")', 'from("api_webhook_deliveries")']) {
    let i = CODIGO.indexOf(tabla);
    while (i !== -1) {
      const fin = CODIGO.indexOf(";", i);
      sentencias.push(CODIGO.slice(i, fin === -1 ? undefined : fin));
      i = CODIGO.indexOf(tabla, i + 1);
    }
  }
  // 1 a api_keys, 7 a endpoints y 3 a entregas: si baja, se rompió la búsqueda.
  assertEquals(sentencias.length, 11, "cambió la cantidad de consultas: revisá que la nueva filtre por agencia");
  const sueltas = sentencias.filter((s) => !/\.eq\("tenant_id", tenantId\)/.test(s) && !/\.insert\(\{ \.\.\.fila, tenant_id: tenantId \}\)/.test(s));
  assertEquals(sueltas.map((s) => s.split("\n")[0].trim()), [], "hay consultas de webhooks sin filtrar por agencia");
  const raras = [...CODIGO.matchAll(/tenant_id[^\n]*/g)].map((m) => m[0]).filter((l) => !/^tenant_id", tenantId\)/.test(l) && !/^tenant_id: tenantId \}\)/.test(l));
  assertEquals(raras, [], "tenant_id usado de otra forma");
});

Deno.test("estructura: UN solo log en el módulo, y lleva dónde + un código (de la base o el nombre del error)", () => {
  assertEquals([...CODIGO.matchAll(/\bconsole\b/g)].length, 1, "un solo console (anotarFalla)");
  assert(CODIGO.includes("console.error(`[manage-api-keys] webhooks ${donde}: ${codigo}`);"));
  // Y a anotarFalla solo le llega un código: el de la base o el nombre del error.
  const codigos = [...CODIGO.matchAll(/(?<!function )anotarFalla\(\w+, ([^;]*)\);/g)].map((m) => m[1]).sort();
  assertEquals(codigos, ['"secreto ilegible"', '(e as Error)?.name || "sin nombre"', 'e.code || "sin código"']);
  // Y el `donde` de falla/leido/escrito es siempre un texto fijo (además, el tipo Donde).
  const sueltos = [...CODIGO.matchAll(/\b(?:falla|leido|escrito)\((?!"[a-z ]+",|donde, e\))/g)].map((x) => x[0]);
  assertEquals(sueltos, [], "un `donde` que no es un texto fijo");
  assert(!/\.details\b/.test(CODIGO), "error.details trae la fila entera (con la URL y el secreto cifrado)");
  assert(!/\.message\b/.test(CODIGO), "error.message no se devuelve ni se loguea");
  assert(!/\.hint\b/.test(CODIGO));
});

Deno.test("estructura: la rama de webhooks de index.ts no loguea nada ni arma respuestas propias", () => {
  const index = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
  const desde = index.indexOf("// === WEBHOOKS");
  assert(desde > 0);
  const rama = index.slice(desde, index.indexOf("\n    }\n", desde));
  assert(!/console/.test(rama), rama);
  assertEquals([...rama.matchAll(/json\(/g)].length, 1, "una sola respuesta: la del módulo");
  assert(rama.includes("return json(req, r.cuerpo, r.estado);"));
  assert(!/\btry\b|\bcatch\b/.test(rama), "sin un catch propio que arme otra respuesta");
});

Deno.test("estructura: todos los textos salen por los mensajes (nada escrito a mano)", () => {
  assertEquals([...CODIGO.matchAll(/\b(error|message|notice):(?!\s*(?:msg\(|m\(|mensajeDePrueba\(|aviso\b|null\b|ErrorDe\b))/g)].map((x) => x[0]), [], "hay un texto que no sale de los mensajes");
  assertEquals([...CODIGO.matchAll(/\baviso\s*=(?!=)(?!\s*m\()/g)].map((x) => x[0]), [], "el aviso sale siempre de m(…)");
  // Que las dos guardas de arriba de verdad cazan algo:
  assert(/\b(error|message|notice):(?!\s*(?:msg\(|m\(|mensajeDePrueba\(|aviso\b|null\b|ErrorDe\b))/.test('cuerpo: { error: x ? m("a") : "a mano" }'));
  assert(/\baviso\s*=(?!=)(?!\s*m\()/.test('aviso = "a mano"'));
});
