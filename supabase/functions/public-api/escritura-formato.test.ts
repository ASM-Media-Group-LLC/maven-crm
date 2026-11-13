// Las piezas puras de la escritura, por comportamiento: qué pide cada ruta, cómo se lee
// un cuerpo y la tabla de errores de la base → HTTP (diseño §1.8), contra los códigos
// que de verdad lanza la migración (se lee el archivo: si la base suma un código y el
// edge no lo traduce, esto falla).

import { assert, assertEquals } from "jsr:@std/assert";
import {
  type Accion,
  clasificarErrorDeEscritura,
  type ErrorDeEscritura,
  esMetodo,
  filaDesdeRpc,
  leerCuerpoDeEscritura,
  leerEscritura,
  leerIdempotencia,
  scopesDeLaRuta,
  sobran,
  textoGuardable,
} from "./escritura-formato.ts";
import { CODIGOS_DE_LA_BASE } from "../manage-api-keys/escritura.ts";

const CONV = "16750574-1111-4222-8333-944455556666";
const MSG = "a0000000-0000-4000-8000-000000000009";

// ─── Rutas y scopes ──────────────────────────────────────────────────────────

Deno.test("scopesDeLaRuta: cada (método, ruta) del Messenger, qué hace y qué scope pide", () => {
  const casos: [string, string[], Accion, boolean][] = [
    ["GET", ["conversations"], "bandeja", false],
    ["POST", ["conversations"], "abrir", true],
    ["GET", ["conversations", CONV], "conversacion", false],
    ["GET", ["conversations", CONV, "messages"], "mensajes", false],
    ["POST", ["conversations", CONV, "messages"], "enviar", true],
    ["PATCH", ["conversations", CONV, "messages", MSG], "editar", true],
    ["DELETE", ["conversations", CONV, "messages", MSG], "borrar", true],
    ["GET", ["feed"], "feed", false],
    // El directorio pide write aunque sea un GET (§1.2).
    ["GET", ["people"], "personas", true],
  ];
  for (const [metodo, ruta, accion, escritura] of casos) {
    assert(esMetodo(metodo));
    assertEquals(scopesDeLaRuta("messenger", metodo, ruta), { ok: true, accion, lectura: true, escritura }, `${metodo} /${ruta.join("/")}`);
  }
});

Deno.test("scopesDeLaRuta: otra ruta con un método que no tiene → 405 con los que sí; una que no existe → 404", () => {
  assertEquals(scopesDeLaRuta("messenger", "GET", ["conversations", CONV, "messages", MSG]), { ok: false, estado: 405, permitidos: ["PATCH", "DELETE"] });
  assertEquals(scopesDeLaRuta("messenger", "DELETE", ["conversations"]), { ok: false, estado: 405, permitidos: ["GET", "POST"] });
  assertEquals(scopesDeLaRuta("messenger", "POST", ["feed"]), { ok: false, estado: 405, permitidos: ["GET"] });
  assertEquals(scopesDeLaRuta("messenger", "PATCH", ["conversations", CONV]), { ok: false, estado: 405, permitidos: ["GET"] });
  for (const ruta of [[], ["chats"], ["conversations", CONV, "reactions"], ["conversations", CONV, "messages", MSG, "x"], ["people", "x"], ["conversations", ""]]) {
    assertEquals(scopesDeLaRuta("messenger", "GET", ruta), { ok: false, estado: 404 }, `/${ruta.join("/")}`);
  }
  // /me solo se lee; cualquier otro recurso no tiene rutas de escritura.
  assertEquals(scopesDeLaRuta("me", "GET", []), { ok: true, accion: "me", lectura: false, escritura: false });
  for (const m of ["POST", "PATCH", "DELETE"] as const) assertEquals(scopesDeLaRuta("me", m, []), { ok: false, estado: 405, permitidos: ["GET"] });
  assertEquals(scopesDeLaRuta("creators", "POST", []), { ok: false, estado: 404 });
  for (const m of ["PUT", "HEAD", "OPTIONS", "get", "TRACE"]) assert(!esMetodo(m), m);
});

Deno.test("scopesDeLaRuta: /equipo — leer el equipo, las horas, las notas y Argos (GET) y mandarlo (POST /sync)", () => {
  const casos: [string, string[], Accion, boolean][] = [
    ["GET", [], "equipo_ver", false],
    ["POST", ["sync"], "equipo_sync", true],
    ["GET", ["horas"], "equipo_horas", false],
    ["GET", ["notas"], "equipo_notas", false],
    ["GET", ["argos"], "equipo_argos", false],
  ];
  for (const [metodo, ruta, accion, escritura] of casos) {
    assert(esMetodo(metodo));
    assertEquals(scopesDeLaRuta("equipo", metodo, ruta), { ok: true, accion, lectura: true, escritura }, `${metodo} /equipo/${ruta.join("/")}`);
  }
  assertEquals(scopesDeLaRuta("equipo", "POST", []), { ok: false, estado: 405, permitidos: ["GET"] });
  assertEquals(scopesDeLaRuta("equipo", "GET", ["sync"]), { ok: false, estado: 405, permitidos: ["POST"] });
  assertEquals(scopesDeLaRuta("equipo", "DELETE", ["horas"]), { ok: false, estado: 405, permitidos: ["GET"] });
  assertEquals(scopesDeLaRuta("equipo", "POST", ["argos"]), { ok: false, estado: 405, permitidos: ["GET"] });
  for (const ruta of [["otra"], ["horas", "x"], [""], ["sync", "x"], ["argos", "x"]]) {
    assertEquals(scopesDeLaRuta("equipo", "GET", ruta), { ok: false, estado: 404 }, `/equipo/${ruta.join("/")}`);
  }
});

// ─── El cuerpo ───────────────────────────────────────────────────────────────

Deno.test("cuerpo: JSON inválido, o que no es un objeto, no pasa", () => {
  assertEquals(leerCuerpoDeEscritura("{"), { ok: false, problema: "json_invalido" });
  assertEquals(leerCuerpoDeEscritura(""), { ok: false, problema: "json_invalido" });
  for (const t of ["[]", "null", '"hola"', "7", "true"]) assertEquals(leerCuerpoDeEscritura(t), { ok: false, problema: "no_es_objeto" }, t);
  assertEquals(leerCuerpoDeEscritura('{"text":"hola"}'), { ok: true, cuerpo: { text: "hola" } });
});

Deno.test("sobran: un campo que no está en la lista es un error, no se ignora (refs/references)", () => {
  assertEquals(sobran({ text: "x", reply_to_id: null, thread: false }, ["text", "reply_to_id", "thread"]), []);
  assertEquals(sobran({ text: "x", reply_to: "y", references: [] }, ["text", "reply_to_id", "thread"]), ["references", "reply_to"]);
  assertEquals(sobran({ __proto__: 1, constructor: 2 } as never, ["text"]).length >= 1, true);
});

Deno.test("leerEscritura: lo que pide cada una, con las claves del JSON y los valores por defecto", () => {
  assertEquals(leerEscritura("enviar", { text: "hola" }), { ok: true, pedido: { accion: "enviar", text: "hola", reply_to_id: null, thread: false } });
  assertEquals(leerEscritura("enviar", { text: "hola", reply_to_id: MSG.toUpperCase(), thread: true }),
    { ok: true, pedido: { accion: "enviar", text: "hola", reply_to_id: MSG, thread: true } });
  assertEquals(leerEscritura("enviar", { text: "hola", reply_to_id: null, thread: null }),
    { ok: true, pedido: { accion: "enviar", text: "hola", reply_to_id: null, thread: false } });
  assertEquals(leerEscritura("abrir", { type: "direct", user_id: CONV, text: "hola" }),
    { ok: true, pedido: { accion: "abrir", type: "direct", user_id: CONV, text: "hola" } });
  assertEquals(leerEscritura("editar", { text: "nuevo" }), { ok: true, pedido: { accion: "editar", text: "nuevo" } });
  // El texto lo valida la base (largo, controles, dirección): aquí pasa tal cual.
  assertEquals(leerEscritura("editar", { text: "" }), { ok: true, pedido: { accion: "editar", text: "" } });
  assertEquals(leerEscritura("editar", { text: "‮al revés" }).ok, true);
  const malos: [Parameters<typeof leerEscritura>, string][] = [
    [["enviar", null], "sin_cuerpo"],
    [["enviar", {}], "campo_invalido:text"],
    [["enviar", { text: null }], "campo_invalido:text"],
    [["enviar", { text: ["hola"] }], "campo_invalido:text"],
    [["enviar", { text: "x", thread: 1 }], "campo_invalido:thread"],
    [["enviar", { text: "x", reply_to_id: 7 }], "campo_invalido:reply_to_id"],
    [["enviar", { text: "x", reply_to_id: "no-uuid" }], "campo_invalido:reply_to_id"],
    [["enviar", { text: "x", type: "direct" }], "campo_desconocido:type"],
    [["abrir", { user_id: CONV, text: "x" }], "campo_invalido:type"],
    [["abrir", { type: "group", user_id: CONV, text: "x" }], "tipo_de_conversacion"],
    [["abrir", { type: "direct", user_id: "ana", text: "x" }], "campo_invalido:user_id"],
    [["abrir", { type: "direct", text: "x" }], "campo_invalido:user_id"],
    [["abrir", { type: "direct", user_id: CONV, text: "x", reply_to_id: null }], "campo_desconocido:reply_to_id"],
    [["editar", { text: "x", reply_to_id: null }], "campo_desconocido:reply_to_id"],
    [["editar", { text: "ab\ud800c" }], "texto_invalido"],
    [["editar", { text: "a\u0000b" }], "texto_invalido"],
  ];
  for (const [args, esperado] of malos) {
    const r = leerEscritura(...args);
    assert(!r.ok, `${JSON.stringify(args)} pasó`);
    const p = r.problema;
    const dicho = p.tipo === "campo_invalido" ? `${p.tipo}:${p.campo}` : p.tipo === "campo_desconocido" ? `${p.tipo}:${p.campos.join(",")}` : p.tipo;
    assertEquals(dicho, esperado, JSON.stringify(args));
  }
  // Emojis, ZWJ y acentos sí se pueden guardar.
  assert(textoGuardable("👩‍👩‍👧 ñandú") && !textoGuardable("\udc00") && !textoGuardable("\u0000"));
});

Deno.test("Idempotency-Key: de 8 a 100 ASCII visibles sin espacios; sin cabecera, null", () => {
  assertEquals(leerIdempotencia(null), { ok: true, valor: null });
  for (const v of ["12345678", "a".repeat(100), "pedido-2026-10-01T10:00:00Z#1", "~!@#$%^&*()_+"]) assertEquals(leerIdempotencia(v), { ok: true, valor: v }, v);
  for (const v of ["", "1234567", "a".repeat(101), "con espacio", "tilde-é-12345", "tab\t12345678", "nueva\nlinea12"]) assertEquals(leerIdempotencia(v), { ok: false }, v);
});

Deno.test("filaDesdeRpc: la forma de api_mensaje_json, y otra forma es null", () => {
  const m = {
    id: MSG, conversation_id: CONV, sender_id: CONV, content: "hola", type: "text", reply_to_id: null, is_thread_reply: false,
    is_edited: false, is_deleted: false, created_at: "2026-10-01T10:00:00.1+00:00", updated_at: "2026-10-01T10:00:00.1+00:00",
    api_key_id: CONV, api_display_name: "BLU",
  };
  const f = filaDesdeRpc(m);
  assert(f);
  assertEquals([f.file_url, f.file_name, f.album_id, f.api_display_name], [null, null, null, "BLU"]);
  for (const roto of [null, [], "x", { ...m, id: 7 }, { ...m, is_deleted: "no" }, { ...m, api_key_id: undefined }, { ...m, created_at: null }]) {
    assertEquals(filaDesdeRpc(roto), null, JSON.stringify(roto));
  }
});

// ─── Errores de la base → HTTP (§1.8) ────────────────────────────────────────

const e = (code: string | undefined, details?: string, message = "x") => ({ code, details, message });
const como = (r: ErrorDeEscritura) => r.tipo === "rechazo" ? `${r.estado} ${r.error}` : r.tipo === "tope" ? `429 ${r.limite} ${r.reintentarEnSeg}` :
  r.tipo === "pausa" ? `503 pausa ${r.motivo} ${r.reintentarEnSeg}` : r.tipo === "reintentable" ? `503 reintentable ${r.reintentarEnSeg}` :
  r.tipo === "incierto" ? `503 incierto ${r.reintentarEnSeg}` : r.tipo;

Deno.test("§1.8: cada fila de la tabla", () => {
  const casos: [ReturnType<typeof e>, string][] = [
    [e("MV401", '{"error": "unauthorized"}'), "401 unauthorized"],
    [e("MV403", '{"error": "forbidden"}'), "403 forbidden"],
    [e("MV403", '{"error": "not_allowed_in_conversation"}'), "403 not_allowed_in_conversation"],
    [e("MV403", '{"error": "not_your_message"}'), "403 not_your_message"],
    [e("MV403", '{"error": "not_an_api_message"}'), "403 not_an_api_message"],
    [e("MV403", '{"error": "other_integration_message"}'), "403 other_integration_message"],
    [e("42501", undefined, 'new row violates row-level security policy for table "chat_messages"'), "403 not_allowed_in_conversation"],
    [e("MV404", '{"error": "not_found"}'), "404 not_found"],
    [e("MV404", '{"error": "conversation_not_found"}'), "404 conversation_not_found"],
    [e("MV404", '{"error": "person_not_found"}'), "404 person_not_found"],
    [e("MV409", '{"error": "idempotency_key_reused"}'), "409 idempotency_key_reused"],
    [e("MV409", '{"error": "message_deleted"}'), "409 message_deleted"],
    [e("MV422", '{"error": "invalid_text"}'), "422 invalid_text"],
    [e("MV422", '{"error": "invalid_reply"}'), "422 invalid_reply"],
    [e("MV422", '{"error": "conversation_too_large"}'), "422 conversation_too_large"],
    [e("MV422", '{"error": "cannot_message_self"}'), "422 cannot_message_self"],
    [e("MV422", '{"error": "too_many_conversations"}'), "422 too_many_conversations"],
    [e("MV422", '{"error": "invalid_idempotency_key"}'), "400 invalid_idempotency_key"],
    // PR 1 (migración A): sin detail; por el prefijo del mensaje, el que mira la app.
    [e("MV422", undefined, "chat_cita_ajena: la cita tiene que ser un mensaje de la misma conversación"), "422 invalid_reply"],
    [e("MV422", undefined, "chat_archivo_externo: el archivo de un mensaje tiene que estar en el almacenamiento de Maven"), "422 invalid_text"],
    [e("MV409", undefined, "directo_duplicado: ya hay un chat directo entre esas dos personas"), "directo_duplicado"],
    [e("MV429", '{"limite" : "person_new_directs_day", "reintentar_en" : 3600}', "chat_tope_directos: …"), "429 person_new_directs_day 3600"],
    [e("MV429", '{"limite" : "person_new_groups_day", "reintentar_en" : 12}', "chat_tope_grupos: …"), "429 person_new_groups_day 12"],
    // La B: los topes con nivel (key/agency/platform), por conversación, la ronda y el candado.
    [e("MV429", '{"limite" : "key_messages_minute", "reintentar_en" : 31}'), "429 key_messages_minute 31"],
    [e("MV429", '{"limite" : "agency_recipients_hour", "reintentar_en" : 900}'), "429 agency_recipients_hour 900"],
    [e("MV429", '{"limite" : "platform_new_chats_day", "reintentar_en" : 40000}'), "429 platform_new_chats_day 40000"],
    [e("MV429", '{"limite" : "key_edits_minute", "reintentar_en" : 0.2}'), "429 key_edits_minute 1"],
    [e("MV429", '{"limite" : "conversation_minute", "reintentar_en" : 59}'), "429 conversation_minute 59"],
    [e("MV429", '{"limite" : "conversation_day", "reintentar_en" : 80000}'), "429 conversation_day 80000"],
    [e("MV429", '{"limite": "conversation_loop", "reintentar_en": 3600}'), "429 conversation_loop 3600"],
    [e("MV429", '{"limite": "concurrent_write", "reintentar_en": 1}'), "429 concurrent_write 1"],
    [e("MV429", '{"limite": "x", "reintentar_en": 9999999}'), "429 x 86400"],
    [e("MV503", '{"motivo": "interruptor"}'), "503 pausa interruptor 300"],
    [e("MV503", '{"motivo": "varias_agencias"}'), "503 pausa varias_agencias 300"],
    [e("MV503", '{"motivo": "sin_cupo"}'), "503 pausa sin_cupo 300"],
    [e("MV503", '{"motivo": "presion", "senales": [{"senal": "cola_pg_net"}]}'), "503 pausa presion 60"],
    [e("MV503", undefined), "503 pausa desconocido 300"],
    [e("55P03"), "503 reintentable 2"],
    [e("57014"), "503 reintentable 2"],
    [e("23505"), "503 reintentable 2"],
    [e("40P01"), "503 reintentable 2"],
    [e("40001"), "503 reintentable 2"],
    // Sin código: la llamada no tuvo respuesta. Puede haberse hecho (lección #1868).
    [e(undefined, undefined, "AbortError: fetchSinReintentos"), "503 incierto 5"],
    [e("", undefined, "FetchError: x"), "503 incierto 5"],
  ];
  for (const [error, esperado] of casos) assertEquals(como(clasificarErrorDeEscritura(error)), esperado, JSON.stringify(error));
  for (const raro of [null, undefined, "boom", 7, {}, { message: "sin código" }]) {
    assertEquals(clasificarErrorDeEscritura(raro).tipo, "incierto", JSON.stringify(raro));
  }
});

Deno.test("§1.8: lo que la tabla no conoce es un fallo NUESTRO (503 genérico), nunca un 4xx inventado", () => {
  for (const error of [
    e("42501", undefined, "permission denied for function api_messenger_enviar"),
    e("PGRST202", undefined, "Could not find the function public.api_messenger_enviar"),
    e("P0001", undefined, "directo_lleno: un chat directo es de dos personas"),
    e("MV403", '{"error": "algo_nuevo"}'),
    e("MV422", '{"error": "display_name_taken"}'),
    e("MV409", undefined, "otra cosa"),
    e("MV429", "no es json"),
    e("MV429", '{"limite": "Con Mayúsculas", "reintentar_en": 1}'),
    e("MV429", '{"limite": "x"}'),
    e("22P02", undefined, "invalid input syntax for type uuid"),
  ]) {
    const r = clasificarErrorDeEscritura(error);
    assertEquals(r.tipo, "otro", JSON.stringify(error));
    if (r.tipo === "otro") assert(r.detalle.startsWith(String(error.code)), r.detalle);
  }
});

Deno.test("cada código que lanza la migración B lo traduce el edge (public-api o manage-api-keys)", () => {
  const sql = Deno.readTextFileSync(new URL("../../migrations/20261001200000_api_messenger_escritura.sql", import.meta.url))
    .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  // Los rechazos con {"error": …}, por SQLSTATE.
  const lanzados = [...sql.matchAll(/errcode = '(MV\d{3})',(?:(?!errcode|raise)[\s\S]){0,400}?detail = '\{"error": "([a-z_]+)"\}'/g)].map((m) => [m[1], m[2]] as const);
  assert(lanzados.length >= 40, `se esperaban 40+ rechazos con detail en la migración, hay ${lanzados.length}: se rompió la búsqueda`);
  const deLaLlave = new Set(CODIGOS_DE_LA_BASE);
  const sinTraducir = [...new Set(lanzados.map(([c, d]) => `${c} ${d}`))].filter((x) => {
    const [code, detalle] = x.split(" ");
    if (deLaLlave.has(detalle)) return code !== "MV422";
    return clasificarErrorDeEscritura(e(code, JSON.stringify({ error: detalle }))).tipo !== "rechazo";
  });
  assertEquals(sinTraducir, [], "códigos de la base que el edge no traduce");
  // Los MV503: cada motivo es una pausa.
  const motivos = [...new Set([...sql.matchAll(/'\{"motivo": "([a-z_]+)"\}'|'motivo', '([a-z_]+)'/g)].map((m) => m[1] ?? m[2]))];
  assertEquals(motivos.sort(), ["interruptor", "presion", "sin_cupo", "varias_agencias"]);
  for (const motivo of motivos) assertEquals(clasificarErrorDeEscritura(e("MV503", JSON.stringify({ motivo }))).tipo, "pausa");
  // Los MV429 fijos de la B (los otros se arman con el nivel y la ventana).
  const fijos = [...new Set([...sql.matchAll(/"limite": "([a-z_]+)"|'limite', '([a-z_]+)'/g)].map((m) => m[1] ?? m[2]))].sort();
  assertEquals(fijos, ["concurrent_write", "conversation_day", "conversation_loop", "conversation_minute"]);
  // Y la A: sus tres códigos, por el prefijo que lanza (el archivo real).
  const a = Deno.readTextFileSync(new URL("../../migrations/20260930230000_chat_agencia_y_huecos.sql", import.meta.url));
  for (const prefijo of ["chat_cita_ajena", "chat_archivo_externo", "directo_duplicado", "chat_tope_grupos", "chat_tope_directos"]) {
    assert(new RegExp(`message = '${prefijo}:`).test(a), `la A ya no lanza ${prefijo}`);
  }
});
