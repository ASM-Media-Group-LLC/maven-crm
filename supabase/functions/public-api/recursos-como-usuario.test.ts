// Tests de lo que actúa como usuario, con un cliente falso. Lo que importa: NUNCA
// se responde con datos si la base no reconoce la sesión como alguien de la agencia
// de la llave, y eso se verifica antes de cualquier handler.

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Contexto,
  type Handler,
  crearServidorComoUsuario,
  RECURSOS_COMO_USUARIO,
  SCOPE_REQUERIDO,
  servirComoUsuario,
  servirMe,
} from "./recursos-como-usuario.ts";

const AGENCIA = "30869615-f579-4981-8a1f-dbebc61eae2d";
const OTRA_AGENCIA = "0e8f6c1a-2b3d-4e5f-8a9b-1c2d3e4f5a6b";
const PERSONA = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";

const CTX: Contexto = {
  agenciaDeLaLlave: AGENCIA,
  actuaComo: PERSONA,
  scopes: [],
  ruta: [],
  consulta: {},
  llave: { conWhitelist: false, venceEl: null },
  baseDeArchivos: "https://proyecto.supabase.co",
  cupo: { limite: 1000, restantes: 999, reinicio: "2026-09-24T23:00:00+00:00" },
  idioma: "es",
  metodo: "GET",
  cuerpo: null,
  idempotencia: null,
};

type Resp = { data: unknown; error: { message: string } | null };

/** Cliente falso: lo que "la base" responde a current_tenant_id() y al perfil.
 *  Cuenta las lecturas de perfil para probar que no se tocan datos si la sesión no
 *  es la que tiene que ser. */
function clienteFalso(agencia: Resp, perfil: Resp) {
  const lecturas = { perfil: 0 };
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: () => { lecturas.perfil++; return Promise.resolve(perfil); },
  };
  const cliente = {
    rpc: (nombre: string) => {
      // /me pregunta además si la key escribe (null: no escribe).
      if (nombre === "api_mi_llave") return Promise.resolve(ok(null));
      assertEquals(nombre, "current_tenant_id");
      return Promise.resolve(agencia);
    },
    from: (tabla: string) => {
      assertEquals(tabla, "profiles");
      return consulta;
    },
  } as unknown as SupabaseClient;
  return { cliente, lecturas };
}

const ok = (data: unknown): Resp => ({ data, error: null });
const PERFIL = ok({ id: PERSONA, full_name: "Persona de prueba", avatar_url: null });

Deno.test("/me: la sesión es de la agencia de la llave → responde quién es", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), PERFIL);
  const r = await servirComoUsuario("me", cliente, CTX);
  assert(r.ok);
  const c = r.cuerpo as Record<string, any>;
  assertEquals(c.agency_id, AGENCIA);
  assertEquals(c.acts_as, { id: PERSONA, name: "Persona de prueba", avatar_url: null });
  assertEquals(c.rate_limit.remaining, 999);
  // Una key que no escribe: null, sin error (así /me anda para todas).
  assertEquals(c.messenger_write, null);
});

Deno.test("si la base ve OTRA agencia o a nadie, 503 para TODO handler y sin leer datos", async () => {
  // Otra agencia: la persona se mudó, o está en dos y la base elige la otra. Nadie
  // (null): auth.uid() no reconoció el `sub`. En los dos casos ningún handler corre.
  // Con TODOS los scopes y una llave en regla: lo único que falla es la agencia.
  const conTodo: Contexto = {
    ...CTX,
    scopes: Object.values(SCOPE_REQUERIDO).flatMap((s) => [s.lectura, s.escritura]).filter((s): s is string => !!s),
    llave: { conWhitelist: true, venceEl: "2026-12-01T00:00:00Z" },
  };
  for (const recurso of Object.keys(RECURSOS_COMO_USUARIO)) {
    for (const agencia of [OTRA_AGENCIA, null]) {
      const { cliente, lecturas } = clienteFalso(ok(agencia), PERFIL);
      const r = await servirComoUsuario(recurso, cliente, conTodo);
      assert(!r.ok && r.estado === 503, `${recurso} con agencia=${agencia} respondió`);
      assertEquals(lecturas.perfil, 0, `${recurso} leyó datos con una sesión ajena`);
    }
  }
  // Y cada escritura, con el pedido en regla: ni la RPC de escritura se llama.
  const CONV_ = "16750574-1111-4222-8333-944455556666", MSG_ = "a0000000-0000-4000-8000-000000000009";
  const escrituras: [Contexto["metodo"], string[], Contexto["cuerpo"]][] = [
    ["POST", ["conversations"], { type: "direct", user_id: OTRA_AGENCIA, text: "hola" }],
    ["POST", ["conversations", CONV_, "messages"], { text: "hola" }],
    ["PATCH", ["conversations", CONV_, "messages", MSG_], { text: "hola" }],
    ["DELETE", ["conversations", CONV_, "messages", MSG_], null],
    ["GET", ["people"], null],
  ];
  for (const [metodo, ruta, cuerpo] of escrituras) {
    for (const agencia of [OTRA_AGENCIA, null]) {
      const llamadas: string[] = [];
      const cliente = {
        rpc: (n: string) => { llamadas.push(n); return Promise.resolve(n === "current_tenant_id" ? ok(agencia) : ok({})); },
        from: (t: string) => { llamadas.push(t); throw new Error("leyó datos"); },
      } as unknown as SupabaseClient;
      const r = await servirComoUsuario("messenger", cliente, { ...conTodo, metodo, ruta, cuerpo, idempotencia: "pedido-0001" });
      assert(!r.ok && r.estado === 503, `${metodo} /${ruta.join("/")} con agencia=${agencia} respondió`);
      assertEquals(llamadas, ["current_tenant_id"], `${metodo} /${ruta.join("/")} siguió con una sesión ajena`);
    }
  }
});

Deno.test("si la base rechaza la sesión (secreto equivocado), 503", async () => {
  const rechazo: Resp = { data: null, error: { message: "JWSError JWSInvalidSignature" } };
  for (const [agencia, perfil] of [[rechazo, PERFIL], [ok(AGENCIA), rechazo]] as const) {
    const { cliente } = clienteFalso(agencia, perfil);
    const r = await servirComoUsuario("me", cliente, CTX);
    assert(!r.ok && r.estado === 503);
  }
});

Deno.test("un recurso sin handler, o heredado de Object.prototype, da 503 sin tocar la base", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  for (const r of ["no_existe", "constructor", "toString", "__proto__"]) {
    const v = await servirComoUsuario(r, explota, CTX);
    assert(!v.ok && v.estado === 503, `"${r}" pasó`);
  }
});

Deno.test("/me: si la persona no ve su propio perfil, 503", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), ok(null));
  const r = await servirComoUsuario("me", cliente, CTX);
  assert(!r.ok && r.estado === 503);
});

Deno.test("/me/loquesea: 404 sin tocar datos", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  const r = await servirMe(explota, { ...CTX, ruta: ["loquesea"] });
  assert(!r.ok && r.estado === 404);
});

// ─── El scope, antes de tocar la base ───────────────────────────────────────

const PRIVADO: Handler = () => Promise.resolve({ ok: true, estado: 200, cuerpo: { secreto: true } });
const conPrivado = crearServidorComoUsuario({ privado: PRIVADO }, { privado: { lectura: "privado:read", escritura: null } });

Deno.test("sin el scope del recurso: 403 y NI UNA consulta a la base", async () => {
  // Con la llave de hoy (actúa como el CEO) y sin esto, cualquier recurso nuevo le
  // quedaba abierto a las 3 llaves aunque no tuvieran su permiso.
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  for (const scopes of [[], ["creators:read"], ["privado:reads"], ["PRIVADO:READ"]]) {
    const r = await conPrivado("privado", explota, { ...CTX, scopes });
    assert(!r.ok && r.estado === 403, `con scopes=${JSON.stringify(scopes)} pasó`);
  }
});

Deno.test("con el scope: sigue y verifica la agencia antes del handler", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), PERFIL);
  const r = await conPrivado("privado", cliente, { ...CTX, scopes: ["privado:read"] });
  assert(r.ok);
  const otra = clienteFalso(ok(OTRA_AGENCIA), PERFIL).cliente;
  const r2 = await conPrivado("privado", otra, { ...CTX, scopes: ["privado:read"] });
  assert(!r2.ok && r2.estado === 503, "con el scope pero otra agencia, pasó");
});

Deno.test("un recurso con handler pero sin scope declarado: 503, no se sirve", async () => {
  const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;
  const r = await crearServidorComoUsuario({ privado: PRIVADO }, {})("privado", explota, { ...CTX, scopes: ["privado:read"] });
  assert(!r.ok && r.estado === 503);
});

Deno.test("/me no pide scope (cualquier llave puede preguntar quién es)", async () => {
  const { cliente } = clienteFalso(ok(AGENCIA), PERFIL);
  const r = await servirComoUsuario("me", cliente, { ...CTX, scopes: [] });
  assert(r.ok);
});

Deno.test("la entrada de producción no acepta mapas inyectados (3 argumentos)", () => {
  assertEquals(servirComoUsuario.length, 3);
});

// ─── La escritura (diseño §5.6): por comportamiento, con un cliente que anota ──

const CONV = "16750574-1111-4222-8333-944455556666";
const MSG = "a0000000-0000-4000-8000-000000000009";
const OTRO = "5a2d9c11-7e3b-4f60-9a8b-0c1d2e3f4a5b";
const LEE_Y_ESCRIBE = ["messenger:read", "messenger:write"];
const LLAVE_OK = { conWhitelist: true, venceEl: "2026-12-01T00:00:00Z" };
const ESCRITURAS = ["api_messenger_enviar", "api_messenger_abrir_directo", "api_messenger_editar", "api_messenger_borrar"];

type Llamada = { rpc?: string; tabla?: string; args?: unknown };
type Respuesta = { data: unknown; error: unknown };

/** Un cliente que anota toda llamada y responde lo que diga `responder` (por defecto:
 *  la agencia de la llave, y la base vacía). */
function anotador(responder: (ll: Llamada) => Respuesta = () => ok(null)) {
  const llamadas: Llamada[] = [];
  const cadena = (ll: Llamada): unknown => {
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return (res: (v: Respuesta) => unknown) => Promise.resolve(responder(ll)).then(res);
        if (prop === "maybeSingle") return () => Promise.resolve(responder(ll));
        return () => b;
      },
    });
    return b;
  };
  const cliente = {
    rpc: (nombre: string, args?: unknown) => {
      const ll: Llamada = { rpc: nombre, args };
      llamadas.push(ll);
      if (nombre === "current_tenant_id") return Promise.resolve(ok(AGENCIA));
      return Promise.resolve(responder(ll));
    },
    from: (tabla: string) => {
      const ll: Llamada = { tabla };
      llamadas.push(ll);
      return cadena(ll);
    },
  } as unknown as SupabaseClient;
  return { cliente, llamadas };
}

const escribir = (metodo: Contexto["metodo"], ruta: string[], cuerpo: Contexto["cuerpo"] = null, extra: Partial<Contexto> = {}): Contexto => ({
  ...CTX, scopes: LEE_Y_ESCRIBE, llave: LLAVE_OK, metodo, ruta, cuerpo, idempotencia: metodo === "POST" ? "pedido-0001" : null, ...extra,
});

const MENSAJE_DE_LA_BASE = {
  id: MSG, conversation_id: CONV, sender_id: PERSONA, content: "hola", type: "text", reply_to_id: null,
  is_thread_reply: false, is_edited: false, is_deleted: false, created_at: "2026-10-01T15:00:00.123456+00:00",
  updated_at: "2026-10-01T15:00:00.123456+00:00", api_key_id: "7b2e4c1d-8a9f-4b3c-9d2e-1f0a3b4c5d6e", api_display_name: "BLU",
};

Deno.test("(a) rutas de escritura con GET: 405 con Allow y NI UNA llamada; las de lectura no llaman a una RPC de escritura", async () => {
  const { cliente, llamadas } = anotador();
  const r = await servirComoUsuario("messenger", cliente, escribir("GET", ["conversations", CONV, "messages", MSG]));
  assert(!r.ok && r.estado === 405, JSON.stringify(r));
  assertEquals((r as { permitidos: string[] }).permitidos, ["PATCH", "DELETE"]);
  assertEquals(llamadas, [], "un GET a una ruta de escritura tocó la base");
  // GET de las rutas que también se escriben (POST): leen, nunca escriben.
  for (const ruta of [["conversations"], ["conversations", CONV, "messages"]]) {
    const a = anotador((ll) => ll.tabla === "chat_conversations" ? ok({ id: CONV }) : ok([]));
    await servirComoUsuario("messenger", a.cliente, escribir("GET", ruta));
    const rpcs = a.llamadas.map((l) => l.rpc).filter(Boolean);
    assertEquals(rpcs.filter((n) => ESCRITURAS.includes(n!)), [], `GET /${ruta.join("/")} llamó a una RPC de escritura`);
  }
  // Una ruta conocida con un método que no tiene: 405 con lo que sí acepta.
  for (const [metodo, ruta, permitidos] of [
    ["PATCH", ["conversations"], ["GET", "POST"]],
    ["DELETE", ["conversations", CONV], ["GET"]],
    ["POST", ["feed"], ["GET"]],
    ["POST", ["people"], ["GET"]],
  ] as const) {
    const a = anotador();
    const x = await servirComoUsuario("messenger", a.cliente, escribir(metodo, [...ruta], {}));
    assert(!x.ok && x.estado === 405, `${metodo} /${ruta.join("/")}`);
    assertEquals((x as { permitidos: string[] }).permitidos, [...permitidos]);
    assertEquals(a.llamadas, [], `${metodo} /${ruta.join("/")} tocó la base`);
  }
});

Deno.test("(b) POST, PATCH, DELETE y GET /people sin messenger:write: 403 SIN current_tenant_id", async () => {
  const casos: [Contexto["metodo"], string[], Contexto["cuerpo"]][] = [
    ["POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola" }],
    ["POST", ["conversations", CONV, "messages"], { text: "hola" }],
    ["PATCH", ["conversations", CONV, "messages", MSG], { text: "hola" }],
    ["DELETE", ["conversations", CONV, "messages", MSG], null],
    ["GET", ["people"], null],
  ];
  for (const [metodo, ruta, cuerpo] of casos) {
    for (const scopes of [["messenger:read"], ["messenger:read", "messenger:writes"], ["creators:read", "messenger:write"]]) {
      const { cliente, llamadas } = anotador();
      const r = await servirComoUsuario("messenger", cliente, escribir(metodo, ruta, cuerpo, { scopes }));
      assert(!r.ok && r.estado === 403, `${metodo} /${ruta.join("/")} con ${scopes} → ${JSON.stringify(r)}`);
      assertEquals(llamadas, [], `${metodo} /${ruta.join("/")} con ${scopes} tocó la base`);
    }
  }
  // El texto dice cuál falta: el de lectura si falta ese, el de escritura si no.
  const sinLectura = await servirComoUsuario("messenger", anotador().cliente, escribir("POST", ["conversations"], {}, { scopes: ["messenger:write"] }));
  assert(!sinLectura.ok && sinLectura.estado === 403 && "mensaje" in sinLectura && sinLectura.mensaje === "Falta el scope messenger:read");
  const sinEscritura = await servirComoUsuario("messenger", anotador().cliente, escribir("GET", ["people"], null, { scopes: ["messenger:read"] }));
  assert(!sinEscritura.ok && "mensaje" in sinEscritura && sinEscritura.mensaje === "Falta el scope messenger:write");
});

Deno.test("(c) POST /me (y cualquier no-GET): 405 Allow GET, sin tocar la base", async () => {
  for (const metodo of ["POST", "PATCH", "DELETE"] as const) {
    for (const ruta of [[], ["x"]]) {
      const { cliente, llamadas } = anotador();
      const r = await servirComoUsuario("me", cliente, { ...CTX, metodo, ruta });
      assert(!r.ok && r.estado === 405, `${metodo} /me/${ruta.join("/")}`);
      assertEquals((r as { permitidos: string[] }).permitidos, ["GET"]);
      assertEquals(llamadas, []);
    }
  }
});

Deno.test("(f) un campo de más (o mal), un id roto o sin Idempotency-Key: 400 SIN tocar la base", async () => {
  const casos: [Contexto, number, string][] = [
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola", reply_to: MSG }), 400, "unknown_field"],
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola", references: [MSG] }), 400, "unknown_field"],
    [escribir("POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola", name: "x" }), 400, "unknown_field"],
    [escribir("PATCH", ["conversations", CONV, "messages", MSG], { text: "hola", is_edited: false }), 400, "unknown_field"],
    [escribir("POST", ["conversations", CONV, "messages"], { text: 7 }), 400, "invalid_field"],
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola", thread: "si" }), 400, "invalid_field"],
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola", reply_to_id: "x" }), 400, "invalid_field"],
    [escribir("POST", ["conversations"], { type: "group", user_id: OTRO, text: "hola" }), 400, "invalid_field"],
    [escribir("POST", ["conversations"], { user_id: OTRO, text: "hola" }), 400, "invalid_field"],
    [escribir("POST", ["conversations"], { type: "direct", user_id: "ana", text: "hola" }), 400, "invalid_field"],
    [escribir("POST", ["conversations", CONV, "messages"], null), 400, "invalid_json"],
    [escribir("POST", ["conversations", "no-uuid", "messages"], { text: "hola" }), 400, "bad_request"],
    [escribir("PATCH", ["conversations", CONV, "messages", "no-uuid"], { text: "hola" }), 400, "bad_request"],
    [escribir("DELETE", ["conversations", "x", "messages", MSG]), 400, "bad_request"],
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }, { idempotencia: null }), 400, "idempotency_key_required"],
    [escribir("POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola" }, { idempotencia: null }), 400, "idempotency_key_required"],
    // Un texto que Postgres no puede guardar (UTF-16 roto, NUL): 422 aquí, no un 503.
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola \ud800" }), 422, "invalid_text"],
    [escribir("POST", ["conversations", CONV, "messages"], { text: "ho\u0000la" }), 422, "invalid_text"],
  ];
  for (const [ctx, estado, error] of casos) {
    const { cliente, llamadas } = anotador();
    const r = await servirComoUsuario("messenger", cliente, ctx);
    assert(!r.ok && r.estado === estado && "error" in r && r.error === error, `${ctx.metodo} ${JSON.stringify(ctx.cuerpo)} → ${JSON.stringify(r)}`);
    assertEquals(llamadas, [], `${ctx.metodo} ${JSON.stringify(ctx.cuerpo)} tocó la base`);
  }
  // El que está bien SÍ llega a la base (la línea base de lo de arriba).
  const { cliente, llamadas } = anotador(() => ok({ repetido: false, conversation_id: CONV, message: MENSAJE_DE_LA_BASE }));
  const r = await servirComoUsuario("messenger", cliente, escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }));
  assert(r.ok && r.estado === 201, JSON.stringify(r));
  assert(llamadas.some((l) => l.rpc === "api_messenger_enviar"));
});

Deno.test("cada escritura llama a SU RPC una vez, con los parámetros con nombre y la Idempotency-Key", async () => {
  const casos: [Contexto, string, Record<string, unknown>][] = [
    [escribir("POST", ["conversations", CONV.toUpperCase(), "messages"], { text: "hola", reply_to_id: MSG.toUpperCase(), thread: true }),
      "api_messenger_enviar", { _conversacion: CONV, _texto: "hola", _responde_a: MSG, _en_hilo: true, _idem: "pedido-0001" }],
    [escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }),
      "api_messenger_enviar", { _conversacion: CONV, _texto: "hola", _responde_a: null, _en_hilo: false, _idem: "pedido-0001" }],
    [escribir("POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola" }),
      "api_messenger_abrir_directo", { _con: OTRO, _texto: "hola", _idem: "pedido-0001" }],
    [escribir("PATCH", ["conversations", CONV, "messages", MSG], { text: "nuevo" }),
      "api_messenger_editar", { _conversacion: CONV, _mensaje: MSG, _texto: "nuevo" }],
    [escribir("DELETE", ["conversations", CONV, "messages", MSG]),
      "api_messenger_borrar", { _conversacion: CONV, _mensaje: MSG }],
  ];
  for (const [ctx, rpc, args] of casos) {
    const { cliente, llamadas } = anotador(() => ({ data: null, error: { code: "MV503", message: "x", details: '{"motivo": "interruptor"}' } }));
    await servirComoUsuario("messenger", cliente, ctx);
    const deEscritura = llamadas.filter((l) => l.rpc && ESCRITURAS.includes(l.rpc));
    assertEquals(deEscritura.map((l) => l.rpc), [rpc], `${ctx.metodo} /${ctx.ruta.join("/")}`);
    assertEquals(deEscritura[0].args, args);
    // Antes, la agencia de la sesión; nada más.
    assertEquals(llamadas.map((l) => l.rpc ?? l.tabla), ["current_tenant_id", rpc]);
  }
});

/** El error de supabase-js para cada respuesta de la base, y lo que tiene que salir. */
const DE_LA_BASE: [string, { code?: string; message: string; details?: string }, number, string, Record<string, unknown>?][] = [
  ["MV401", { code: "MV401", message: "api_llave_invalida: …", details: '{"error": "unauthorized"}' }, 401, "unauthorized"],
  ["MV403 forbidden", { code: "MV403", message: "api_persona_no_vigente: …", details: '{"error": "forbidden"}' }, 403, "forbidden"],
  ["42501 (anuncios)", { code: "42501", message: 'new row violates row-level security policy for table "chat_messages"' }, 403, "not_allowed_in_conversation"],
  ["MV403 not_your_message", { code: "MV403", message: "api_no_es_tuyo: …", details: '{"error": "not_your_message"}' }, 403, "not_your_message"],
  ["MV403 not_an_api_message", { code: "MV403", message: "x", details: '{"error": "not_an_api_message"}' }, 403, "not_an_api_message"],
  ["MV403 other_integration_message", { code: "MV403", message: "x", details: '{"error": "other_integration_message"}' }, 403, "other_integration_message"],
  ["MV404 not_found", { code: "MV404", message: "x", details: '{"error": "not_found"}' }, 404, "not_found"],
  ["MV404 conversation_not_found", { code: "MV404", message: "x", details: '{"error": "conversation_not_found"}' }, 404, "conversation_not_found"],
  ["MV404 person_not_found", { code: "MV404", message: "x", details: '{"error": "person_not_found"}' }, 404, "person_not_found"],
  ["MV409 idempotency_key_reused", { code: "MV409", message: "x", details: '{"error": "idempotency_key_reused"}' }, 409, "idempotency_key_reused"],
  ["MV409 message_deleted", { code: "MV409", message: "x", details: '{"error": "message_deleted"}' }, 409, "message_deleted"],
  ["MV422 invalid_text", { code: "MV422", message: "x", details: '{"error": "invalid_text"}' }, 422, "invalid_text"],
  ["MV422 invalid_reply", { code: "MV422", message: "x", details: '{"error": "invalid_reply"}' }, 422, "invalid_reply"],
  ["MV422 chat_cita_ajena (A)", { code: "MV422", message: "chat_cita_ajena: la cita tiene que ser un mensaje de la misma conversación" }, 422, "invalid_reply"],
  ["MV422 chat_archivo_externo (A)", { code: "MV422", message: "chat_archivo_externo: …" }, 422, "invalid_text"],
  ["MV422 conversation_too_large", { code: "MV422", message: "x", details: '{"error": "conversation_too_large"}' }, 422, "conversation_too_large"],
  ["MV422 cannot_message_self", { code: "MV422", message: "x", details: '{"error": "cannot_message_self"}' }, 422, "cannot_message_self"],
  ["MV422 too_many_conversations", { code: "MV422", message: "x", details: '{"error": "too_many_conversations"}' }, 422, "too_many_conversations"],
  ["MV422 invalid_idempotency_key", { code: "MV422", message: "x", details: '{"error": "invalid_idempotency_key"}' }, 400, "invalid_idempotency_key"],
  ["MV429 key_messages_minute", { code: "MV429", message: "api_tope", details: '{"limite" : "key_messages_minute", "reintentar_en" : 17}' }, 429, "rate_limited", { limite: "key_messages_minute", reintentarEnSeg: 17 }],
  ["MV429 concurrent_write", { code: "MV429", message: "x", details: '{"limite": "concurrent_write", "reintentar_en": 1}' }, 429, "rate_limited", { limite: "concurrent_write", reintentarEnSeg: 1 }],
  ["MV429 conversation_loop", { code: "MV429", message: "x", details: '{"limite": "conversation_loop", "reintentar_en": 3600}' }, 429, "rate_limited", { limite: "conversation_loop", reintentarEnSeg: 3600 }],
  ["MV429 chat_tope_directos (A)", { code: "MV429", message: "chat_tope_directos: …", details: '{"limite" : "person_new_directs_day", "reintentar_en" : 5000}' }, 429, "rate_limited", { limite: "person_new_directs_day", reintentarEnSeg: 5000 }],
  ["MV503 interruptor", { code: "MV503", message: "x", details: '{"motivo": "interruptor"}' }, 503, "writes_paused", { reintentarEnSeg: 300 }],
  ["MV503 varias_agencias", { code: "MV503", message: "x", details: '{"motivo": "varias_agencias"}' }, 503, "writes_paused", { reintentarEnSeg: 300 }],
  ["MV503 presion", { code: "MV503", message: "x", details: '{"motivo": "presion", "senales": []}' }, 503, "writes_paused", { reintentarEnSeg: 60 }],
  ["55P03", { code: "55P03", message: "canceling statement due to lock timeout" }, 503, "temporarily_unavailable", { reintentarEnSeg: 2 }],
  ["57014", { code: "57014", message: "canceling statement due to statement timeout" }, 503, "temporarily_unavailable", { reintentarEnSeg: 2 }],
  ["23505", { code: "23505", message: "duplicate key" }, 503, "temporarily_unavailable", { reintentarEnSeg: 2 }],
  ["sin código (red, plazo)", { message: "AbortError: fetchSinReintentos" }, 503, "outcome_unknown", { reintentarEnSeg: 5 }],
];

Deno.test("(d) cada respuesta de la base sale con su estado, su código, su texto y su Retry-After (§1.8)", async () => {
  for (const [nombre, error, estado, codigo, extra] of DE_LA_BASE) {
    for (const idioma of ["es", "en"] as const) {
      const { cliente } = anotador(() => ({ data: null, error }));
      const r = await servirComoUsuario("messenger", cliente, escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }, { idioma }));
      assert(!r.ok && r.estado === estado && "error" in r && r.error === codigo, `${nombre} → ${JSON.stringify(r)}`);
      assert(r.mensaje.length > 5 && !r.mensaje.includes("{"), `${nombre}: texto ${r.mensaje}`);
      for (const [k, v] of Object.entries(extra ?? {})) assertEquals((r as Record<string, unknown>)[k], v, `${nombre}: ${k}`);
    }
  }
  // Lo demás (un permiso de función que falta, una RPC que no existe, un código que la
  // tabla no conoce) es un fallo NUESTRO: 503 genérico con el detalle al log.
  for (const error of [
    { code: "42501", message: "permission denied for function api_messenger_enviar" },
    { code: "PGRST202", message: "Could not find the function" },
    { code: "MV422", message: "x", details: '{"error": "display_name_taken"}' },
    { code: "MV429", message: "x", details: "no es json" },
    { code: "P0001", message: "directo_lleno: un chat directo es de dos personas" },
  ]) {
    const { cliente } = anotador(() => ({ data: null, error }));
    const r = await servirComoUsuario("messenger", cliente, escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }));
    assert(!r.ok && r.estado === 503 && "detalle" in r, `${JSON.stringify(error)} → ${JSON.stringify(r)}`);
  }
});

Deno.test("una excepción en la llamada (no un error) es un resultado INCIERTO, nunca un 500", async () => {
  const tira = {
    rpc: (n: string) => n === "current_tenant_id" ? Promise.resolve(ok(AGENCIA)) : Promise.reject(new TypeError("fetch failed")),
    from: () => { throw new Error("no se lee"); },
  } as unknown as SupabaseClient;
  const r = await servirComoUsuario("messenger", tira, escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }));
  assert(!r.ok && r.estado === 503 && "error" in r && r.error === "outcome_unknown", JSON.stringify(r));
});

Deno.test("(e) mandar: 201 la primera vez, 200 con idempotent_replay en la repetición; con via_api", async () => {
  for (const repetido of [false, true]) {
    const { cliente } = anotador((ll) =>
      ll.rpc === "api_messenger_enviar"
        ? ok({ repetido, conversation_id: CONV, message: MENSAJE_DE_LA_BASE })
        : ll.tabla === "profiles" ? ok([{ id: PERSONA, full_name: "Alvaro Diaz", avatar_url: null }]) : ok(null)
    );
    const r = await servirComoUsuario("messenger", cliente, escribir("POST", ["conversations", CONV, "messages"], { text: "hola" }));
    assert(r.ok, JSON.stringify(r));
    assertEquals(r.estado, repetido ? 200 : 201);
    const c = r.cuerpo as Record<string, any>;
    assertEquals(c.object, "message");
    assertEquals(c.idempotent_replay, repetido);
    assertEquals(c.data.id, MSG);
    assertEquals(c.data.text, "hola");
    assertEquals(c.data.sender, { id: PERSONA, name: "Alvaro Diaz", avatar_url: null });
    assertEquals(c.data.via_api, { display_name: "BLU" });
    assert(!("api_key_id" in c.data), "el id de la key no sale");
  }
});

Deno.test("abrir: 201 si se creó, 200 si se reutilizó o se repitió; directo_duplicado se vuelve a pedir UNA vez", async () => {
  for (const [created, repetido, estado] of [[true, false, 201], [false, false, 200], [true, true, 200]] as const) {
    const { cliente } = anotador((ll) =>
      ll.rpc === "api_messenger_abrir_directo" ? ok({ repetido, conversation_id: CONV, created, message: MENSAJE_DE_LA_BASE }) : ok([])
    );
    const r = await servirComoUsuario("messenger", cliente, escribir("POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola" }));
    assert(r.ok && r.estado === estado, `created=${created} repetido=${repetido} → ${JSON.stringify(r)}`);
    const c = r.cuerpo as Record<string, any>;
    assertEquals(c.object, "conversation_message");
    assertEquals(c.conversation, { id: CONV, type: "direct", created });
    assertEquals(c.idempotent_replay, repetido);
    assertEquals(c.message.via_api, { display_name: "BLU" });
  }
  // La carrera con la app: el primer intento da directo_duplicado, el segundo anda.
  let intentos = 0;
  const carrera = anotador((ll) => {
    if (ll.rpc !== "api_messenger_abrir_directo") return ok([]);
    intentos++;
    return intentos === 1
      ? { data: null, error: { code: "MV409", message: "directo_duplicado: ya hay un chat directo entre esas dos personas" } }
      : ok({ repetido: false, conversation_id: CONV, created: false, message: MENSAJE_DE_LA_BASE });
  });
  const r = await servirComoUsuario("messenger", carrera.cliente, escribir("POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola" }));
  assert(r.ok && r.estado === 200, JSON.stringify(r));
  assertEquals(intentos, 2);
  // Si vuelve a pasar, no se insiste más: 503 (no un bucle).
  let veces = 0;
  const siempre = anotador((ll) => {
    if (ll.rpc === "api_messenger_abrir_directo") veces++;
    return { data: null, error: { code: "MV409", message: "directo_duplicado: x" } };
  });
  const r2 = await servirComoUsuario("messenger", siempre.cliente, escribir("POST", ["conversations"], { type: "direct", user_id: OTRO, text: "hola" }));
  assert(!r2.ok && r2.estado === 503, JSON.stringify(r2));
  assertEquals(veces, 2);
});

Deno.test("editar y borrar: lo que devuelve la base, tal cual", async () => {
  const ed = anotador((ll) => ll.rpc === "api_messenger_editar" ? ok({ cambiado: false, message: MENSAJE_DE_LA_BASE }) : ok([]));
  const r = await servirComoUsuario("messenger", ed.cliente, escribir("PATCH", ["conversations", CONV, "messages", MSG], { text: "hola" }));
  assert(r.ok && r.estado === 200);
  assertEquals((r.cuerpo as Record<string, any>).changed, false);
  assertEquals((r.cuerpo as Record<string, any>).data.via_api, { display_name: "BLU" });
  for (const ya of [false, true]) {
    const bo = anotador((ll) => ll.rpc === "api_messenger_borrar" ? ok({ id: MSG, already_deleted: ya }) : ok(null));
    const b = await servirComoUsuario("messenger", bo.cliente, escribir("DELETE", ["conversations", CONV, "messages", MSG]));
    assert(b.ok && b.estado === 200);
    assertEquals(b.cuerpo, { object: "message_deleted", id: MSG, already_deleted: ya });
  }
  // Una forma que no es la del contrato: 503 (no se inventa una respuesta).
  const raro = anotador(() => ok({ id: MSG }));
  const x = await servirComoUsuario("messenger", raro.cliente, escribir("DELETE", ["conversations", CONV, "messages", MSG]));
  assert(!x.ok && x.estado === 503 && "detalle" in x);
});

Deno.test("GET /people: limit+1 → has_more, cada persona como objeto, y los parámetros con nombre", async () => {
  const filas = Array.from({ length: 3 }, (_, i) => ({ id: `b0000000-0000-4000-8000-00000000000${i}`, name: `P${i}`, avatar_url: null }));
  const { cliente, llamadas } = anotador((ll) => ll.rpc === "messenger_directorio" ? ok(filas) : ok(null));
  const r = await servirComoUsuario("messenger", cliente, escribir("GET", ["people"], null, { consulta: { q: "ana", limit: "2", offset: "4" } }));
  assert(r.ok && r.estado === 200, JSON.stringify(r));
  const c = r.cuerpo as Record<string, any>;
  assertEquals([c.object, c.resource, c.limit, c.offset, c.has_more], ["list", "/messenger/people", 2, 4, true]);
  assertEquals(c.data, filas.slice(0, 2).map((f) => ({ object: "person", ...f })));
  assertEquals(llamadas.find((l) => l.rpc === "messenger_directorio")?.args, { _q: "ana", _limite: 2, _desde: 4 });
  for (const consulta of [{ limit: "0" }, { offset: "-1" }, { q: "x".repeat(101) }] as Record<string, string>[]) {
    const a = anotador();
    const x = await servirComoUsuario("messenger", a.cliente, escribir("GET", ["people"], null, { consulta }));
    assert(!x.ok && x.estado === 400, JSON.stringify(consulta));
    assert(!a.llamadas.some((l) => l.rpc === "messenger_directorio"));
  }
});

Deno.test("/me: con una key que escribe, messenger_write trae el nombre visible, los topes y lo que queda", async () => {
  const escritura = { display_name: "BLU", limits: { messages_per_hour: 1000 }, remaining: { messages_hour: 998 } };
  const { cliente } = anotador((ll) =>
    ll.rpc === "api_mi_llave" ? ok(escritura) : ll.tabla === "profiles" ? ok({ id: PERSONA, full_name: "Alvaro", avatar_url: null }) : ok(null)
  );
  const r = await servirComoUsuario("me", cliente, CTX);
  assert(r.ok, JSON.stringify(r));
  assertEquals((r.cuerpo as Record<string, any>).messenger_write, escritura);
  // Si api_mi_llave falla (la migración no está, la base no responde): 503, no un null
  // que diga "no escribe" sin saberlo.
  const rota = anotador((ll) =>
    ll.rpc === "api_mi_llave" ? { data: null, error: { code: "PGRST202", message: "no existe" } } : ok({ id: PERSONA, full_name: "A", avatar_url: null })
  );
  const x = await servirComoUsuario("me", rota.cliente, CTX);
  assert(!x.ok && x.estado === 503);
});
