// Tests de los textos del API pública en español e inglés, por COMPORTAMIENTO.
//
// Lo que tiene que ser cierto, y por qué importa:
//  * sin Accept-Language, o si no pide inglés, sale en español BYTE A BYTE igual que
//    antes: las integraciones vivas (kashgrupo1) no pueden ver ni una coma distinta;
//  * la negociación sigue la RFC 9110 / RFC 4647: q=0 es "no", gana el q más alto,
//    el `*` vale para el idioma que nadie nombró, empate el explícito y después el
//    primero; basura u otros idiomas → español; rechazar el español → inglés;
//  * msg() nunca tira, ni con una clave que no existe (arma el cuerpo de un error);
//  * ningún texto en inglés tiene rastros de español;
//  * el idioma llega de verdad a cada handler (Contexto.idioma), no solo al router.
//
// Las guardas que LEEN el código (que index.ts no devuelva texto suelto, que
// mensajes.ts sea puro) están en aislamiento.test.ts, junto a las demás.

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type Clave, idiomaDelPedido, MENSAJES, msg, varyConIdioma } from "./mensajes.ts";
import { AISLAMIENTO_POR_RECURSO, decidir } from "./aislamiento.ts";
import { type Contexto, servirComoUsuario, servirMe, servirMessenger } from "./recursos-como-usuario.ts";

const pedido = (h?: string) =>
  new Request("https://x/functions/v1/public-api/", { headers: h === undefined ? {} : { "Accept-Language": h } });

// ─── Negociación ─────────────────────────────────────────────────────────────

Deno.test("Accept-Language: se elige según la RFC 9110", () => {
  const casos: [string | undefined, "es" | "en"][] = [
    [undefined, "es"],
    ["", "es"],
    ["en", "en"],
    ["en-US", "en"],
    ["EN", "en"],
    ["EN-gb;q=0.9, es;q=0.8", "en"],
    ["es-CO, en;q=0.9", "es"],
    ["fr, en;q=0.5", "en"],
    ["fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7", "en"],
    ["en;q=0", "es"],
    ["en;q=0.000", "es"],
    ["en;q=0, es;q=0.1", "es"],
    ["es;q=0, en;q=0.1", "en"],
    ["es;q=0.5, en;q=0.6", "en"],
    ["es;q=0.6, en;q=0.5", "es"],
    // Empate: el primero de la lista.
    ["es;q=0.5, en;q=0.5", "es"],
    ["en;q=0.5, es;q=0.5", "en"],
    ["en-US, es", "en"],
    // Espacios y mayúsculas en el parámetro.
    ["  en-GB ; Q = 0.8 , es ; q=0.7", "en"],
    ["es-419,es;q=0.9,en;q=0.8", "es"],
    // El comodín: vale, con su q, para el idioma que ningún rango nombra.
    ["*", "es"],
    ["*;q=1, en;q=0.1", "es"],
    ["*;q=0.5, en;q=0.4", "es"],
    ["*;q=0.4, en;q=0.5", "en"],
    ["en;q=0, *", "es"],
    ["es;q=0, *", "en"],
    ["es;q=0.1, *;q=0.5", "en"],
    ["fr, *;q=0.5", "es"],
    // Con empate, el nombrado le gana al que entra por el comodín.
    ["*, en", "en"],
    ["en, *", "en"],
    ["es, *", "es"],
    ["*;q=0.3, *;q=0.9, en;q=0.5", "es"],
    // Nada aceptable: inglés solo si rechaza el español y no el inglés.
    ["fr, es;q=0", "en"],
    ["es;q=0", "en"],
    ["es-CO;q=0, es;q=0", "en"],
    // Rechazar una variante no es rechazar el español (ni el inglés).
    ["es-CO;q=0", "es"],
    ["es;q=0, en-US;q=0", "en"],
    ["en;q=0, es;q=0", "es"],
    ["es;q=0, en;q=0", "es"],
    ["*;q=0", "es"],
    ["fr, *;q=0", "es"],
    ["es;q=0, *;q=0", "es"],
    ["en, *;q=0", "en"],
    ["es, *;q=0", "es"],
    // Varios rangos del mismo idioma: cuenta el mayor.
    ["en;q=0, en-US;q=0.5, es;q=0.4", "en"],
    ["es;q=0.2, es-CO;q=0.9, en;q=0.8", "es"],
    ["fr, de;q=0.5", "es"],
    ["english", "es"],
    ["en_US", "es"],
    ["en-", "es"],
    ["garbage;;;q", "es"],
    ["en;q=2", "es"],
    ["en;q=abc", "es"],
    ["en;q=0.5000", "es"],
    [";q=1", "es"],
    [",,,", "es"],
    ["én", "es"],
  ];
  for (const [cabecera, esperado] of casos) {
    assertEquals(idiomaDelPedido(pedido(cabecera)), esperado, `Accept-Language: ${JSON.stringify(cabecera)}`);
  }
});

// ─── El diccionario ──────────────────────────────────────────────────────────

const CLAVES = Object.keys(MENSAJES) as Clave[];
type Entrada = { es: string; en: string; vars?: readonly string[]; soloEnEs?: readonly string[] };
const entrada = (k: Clave) => MENSAJES[k] as Entrada;

// Letras, signos y palabras que delatan un texto en español.
const RASTRO_DE_ESPANOL = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
const PALABRAS_EN_ESPANOL =
  /\b(que|para|tiene|Usa|Falta|Pendiente|desconocid[oa]|invalid[oa]|pedidos|llave|agencia|encontrad[oa]|no es|los dos|Reintenta)\b/;

Deno.test("cada clave tiene texto en español y en inglés, y el inglés no tiene nada de español", () => {
  assert(CLAVES.length >= 30, `se esperaban al menos 30 textos, hay ${CLAVES.length}`);
  for (const k of CLAVES) {
    const e = entrada(k);
    assert(e.es.trim().length > 0, `${k}: sin texto en español`);
    assert(e.en.trim().length > 0, `${k}: sin texto en inglés`);
    assert(!RASTRO_DE_ESPANOL.test(e.en), `${k}: el inglés tiene acentos, ñ, ¿ o ¡: ${e.en}`);
    assert(!PALABRAS_EN_ESPANOL.test(e.en), `${k}: el inglés tiene palabras en español: ${e.en}`);
    assert(e.en !== e.es, `${k}: el inglés es el mismo texto que el español`);
  }
});

Deno.test("las variables declaradas están en los textos, y las marcas sueltas son rutas", () => {
  // {id} y {message_id} en "/messenger/conversations/{id}/messages/{message_id}" son
  // parte de la ruta, no variables.
  const LITERALES = new Set(["id", "message_id"]);
  for (const k of CLAVES) {
    const e = entrada(k);
    const vars = e.vars ?? [];
    const soloEnEs = e.soloEnEs ?? [];
    for (const v of soloEnEs) assert(vars.includes(v), `${k}: soloEnEs nombra ${v}, que no es una variable`);
    for (const v of vars) {
      assert(e.es.includes(`{${v}}`), `${k}: el español no usa {${v}}`);
      if (!soloEnEs.includes(v)) assert(e.en.includes(`{${v}}`), `${k}: el inglés no usa {${v}}`);
      else assert(!e.en.includes(`{${v}}`), `${k}: {${v}} es soloEnEs pero el inglés lo muestra`);
    }
    for (const texto of [e.es, e.en]) {
      for (const [, marca] of texto.matchAll(/\{([A-Za-z_]+)\}/g)) {
        assert(vars.includes(marca) || LITERALES.has(marca), `${k}: {${marca}} no está declarada en vars`);
      }
    }
  }
});

Deno.test("msg: reemplaza TODAS las variables, en un solo pase", () => {
  for (const k of CLAVES) {
    const e = entrada(k);
    const vars = e.vars ?? [];
    const valores = Object.fromEntries(vars.map((v) => [v, `<${v}-valor>`]));
    for (const idioma of ["es", "en"] as const) {
      // deno-lint-ignore no-explicit-any
      const texto = (msg as any)(idioma, k, valores) as string;
      for (const v of vars) {
        assert(!texto.includes(`{${v}}`), `${k}/${idioma}: quedó {${v}} sin reemplazar`);
        if (idioma === "es" || !(e.soloEnEs ?? []).includes(v)) {
          assert(texto.includes(`<${v}-valor>`), `${k}/${idioma}: no aparece el valor de ${v}`);
        }
      }
    }
  }
  // El valor no se vuelve a interpretar, y un número sale como número.
  assertEquals(
    msg("en", "limite_por_minuto", { n: 60, s: "{n}" }),
    "This API key has reached its limit of 60 requests per minute. Please try again in {n} s.",
  );
  assertEquals(msg("es", "ip_no_permitida", { ip: "{ip}" }), "IP {ip} no está en la whitelist de esta API key");
  // Un idioma que no existe (p. ej. un Contexto armado a mano sin idioma) sale en español.
  // deno-lint-ignore no-explicit-any
  assertEquals(msg(undefined as any, "llave_invalida"), "API key inválida");
  // La IP que no se conoce, en inglés, se lee como frase.
  assertEquals(
    msg("en", "ip_no_permitida", { ip: msg("en", "ip_desconocida") }),
    "IP (unknown) is not in this API key's IP allowlist",
  );
});

Deno.test("msg: NUNCA tira, ni con una clave mal escrita (arma el cuerpo de un error)", () => {
  // Si tirara, en index.ts la excepción escaparía de Deno.serve: un 500 sin CORS ni
  // JSON. El tipo y la guarda de aislamiento.test.ts ya lo frenan antes; esto es la red.
  // deno-lint-ignore no-explicit-any
  const suelto = msg as any;
  for (const idioma of ["es", "en", undefined]) {
    assertEquals(suelto(idioma, "creadora_no_encontradx"), "creadora_no_encontradx");
    // Heredadas de Object.prototype: no son textos.
    for (const heredada of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      assertEquals(suelto(idioma, heredada), heredada);
    }
  }
  // Una variable que falta (o un tercer argumento que no es un objeto) deja su marca:
  // ni tira ni pone "undefined".
  assertEquals(suelto("es", "falta_scope"), "Falta el scope {scope}");
  assertEquals(suelto("en", "falta_scope", null), "Missing scope {scope}");
  assertEquals(suelto("en", "falta_scope", "creators:read"), "Missing scope {scope}");
  assertEquals(suelto("en", "falta_scope", 7), "Missing scope {scope}");
});

// ─── Español neutro ──────────────────────────────────────────────────────────
// La misma lista de formas concretas que frontend/src/test/i18n/sinVoseo.test.ts (la
// guarda del frontend no mira las edge functions). Si falla, se corrige el texto.
const VOSEO = [
  "vos", "sos", "acá", "podés", "tenés", "querés", "sabés", "hacés", "ponés", "decís", "venís", "seguís",
  "usás", "necesitás", "mandás", "guardás", "llevás", "quedás", "pensás", "entrás", "pertenecés",
  "creá", "usá", "probá", "volvé", "recargá", "registrá", "borrá", "arrastrá", "soltá", "vaciá", "elegí", "hacé",
  "poné", "tené", "mandá", "pegá", "agregá", "adjuntá", "guardá", "cambiá", "copiá", "confirmá", "revisá",
  "intentá", "reintentá", "esperá", "actualizá", "completá", "ingresá", "invitá", "tocá", "apretá", "abrí",
  "cerrá", "subí", "leé", "dejá", "buscá", "activá", "asigná", "reanudá", "verificá", "rechazá", "usalo",
  "pedile", "avisale", "decile", "fijate", "acordate", "asegurate", "hacelo", "dejalo", "borralo", "revocala",
];
const PATRON_VOSEO = new RegExp(`(?<![\\p{L}])(${VOSEO.join("|")})(?![\\p{L}])`, "iu");

Deno.test("el español del diccionario es neutro (sin voseo)", () => {
  const malas = CLAVES.filter((k) => PATRON_VOSEO.test(entrada(k).es)).map((k) => `${k}: ${entrada(k).es}`);
  assertEquals(malas, [], "textos con voseo: pasarlos a tú neutro (reintenta, puedes, aquí…)");
  // La guarda puede fallar: con un texto que vosea, salta.
  assert(PATRON_VOSEO.test("Reintentá en unos segundos") && PATRON_VOSEO.test("no pertenecés a ninguna agencia"));
  assert(!PATRON_VOSEO.test("Reintenta en unos segundos") && !PATRON_VOSEO.test("te escribí"));
});

// ─── Por defecto, EXACTAMENTE lo de antes ────────────────────────────────────
// Cada texto en español, copiado del código ANTES de este cambio. Si hay que
// cambiar uno, es a conciencia: las integraciones vivas lo ven.

const ANTES: Record<Clave, [Record<string, string | number> | undefined, string]> = {
  falta_llave: [undefined, "Falta la API key (Authorization: Bearer mvk_live_...)"],
  llave_invalida: [undefined, "API key inválida"],
  llave_revocada: [undefined, "API key revocada"],
  llave_vencida: [undefined, "API key vencida"],
  ip_no_permitida: [{ ip: "203.0.113.7" }, "IP 203.0.113.7 no está en la whitelist de esta API key"],
  ip_desconocida: [undefined, "desconocida"],
  llave_sin_agencia: [undefined, "Esta API key no pertenece a ninguna agencia"],
  persona_no_vigente: [undefined, "La persona como la que actúa esta API key ya no está activa en esta agencia de Maven"],
  no_disponible: [undefined, "El servicio no está disponible en este momento. Reintenta en unos segundos."],
  limite_por_minuto: [{ n: 60, s: 17 }, "Esta API key llegó a su límite de 60 pedidos por minuto. Reintenta en 17 s."],
  limite_por_hora: [
    { n: 1000, hora: "2026-09-25T19:00:00+00:00" },
    "Esta API key llegó a su límite de 1000 pedidos por hora. Se reinicia a las 2026-09-25T19:00:00+00:00.",
  ],
  falta_scope: [{ scope: "creators:read" }, "Falta el scope creators:read"],
  recurso_desconocido: [{ recurso: "x" }, "Recurso desconocido: x"],
  creadora_no_encontrada: [undefined, "Creadora no encontrada"],
  contacto_no_encontrado: [undefined, "Contacto no encontrado"],
  empleado_no_encontrado: [undefined, "Empleado no encontrado"],
  argos_rutas: [undefined, "Usa /argos/notas o /argos/screens"],
  kind_invalido: [{ opciones: "modelo | agencia | ex_creadora" }, "kind invalido. Usa: modelo | agencia | ex_creadora"],
  sales_sub_recurso_desconocido: [{ sub: "x" }, "Sub-recurso de sales desconocido: x"],
  cowork_rutas: [undefined, "Usa /cowork/time, /cowork/time/segments, /cowork/breaks o /cowork/meets"],
  recurso_sin_aislamiento: [
    { pendiente: "creators no tiene tenant_id" },
    "Este recurso todavía no separa datos por agencia, así que se desactiva mientras Maven tenga más de una, " +
    "para no exponer datos de otras. Pendiente: creators no tiene tenant_id.",
  ],
  aislamiento_no_verificado: [undefined, "No se pudo verificar el aislamiento entre agencias. Reintenta en unos segundos."],
  me_sub_recurso_desconocido: [{ sub: "x" }, "Sub-recurso de me desconocido: x"],
  messenger_llave_sin_reglas: [undefined, "Las llaves con Messenger necesitan IPs fijas y fecha de vencimiento"],
  // Cambió a conciencia el 01/10 (PR 4: las rutas de la escritura). Ninguna key de prod
  // tenía Messenger: nadie leía el texto de antes.
  messenger_rutas: [
    undefined,
    "Usa /messenger/conversations, /messenger/conversations/{id}, /messenger/conversations/{id}/messages, " +
    "/messenger/conversations/{id}/messages/{message_id}, /messenger/feed o /messenger/people",
  ],
  conversacion_no_encontrada: [undefined, "Conversación no encontrada"],
  id_de_conversacion_invalido: [undefined, "El id de la conversación no es válido"],
  limit_invalido: [undefined, "limit tiene que ser un número entre 1 y 100"],
  offset_invalido: [undefined, "offset tiene que ser un número de 0 en adelante"],
  include_invalido: [undefined, "include solo acepta: rich"],
  before_y_after: [undefined, "Usa before O after, no los dos"],
  cursor_invalido: [undefined, "El cursor no es válido"],
  thread_root_id_invalido: [undefined, "thread_root_id no es válido"],
  after_y_since: [undefined, "Usa after O since, no los dos"],
  exclude_own_invalido: [undefined, "exclude_own tiene que ser true o false"],
  since_invalido: [undefined, "since tiene que ser una fecha ISO 8601"],
  since_muy_viejo: [undefined, "since no puede tener más de 72 horas: para lo anterior, lee cada conversación con /messages"],
  // La escritura (PR 4, 01/10): el texto con el que nacen.
  metodo_no_permitido: [{ permitidos: "PATCH, DELETE" }, "Método no permitido en esta ruta. Se aceptan: PATCH, DELETE"],
  cuerpo_muy_grande: [undefined, "El cuerpo del pedido pasa de 64 KB"],
  tipo_de_contenido: [undefined, "El cuerpo tiene que ser JSON en UTF-8 (Content-Type: application/json)"],
  cuerpo_mal_codificado: [undefined, "El cuerpo no es UTF-8 válido"],
  cuerpo_json_invalido: [undefined, "El cuerpo no es JSON válido"],
  cuerpo_no_es_objeto: [undefined, "El cuerpo tiene que ser un objeto JSON"],
  campo_desconocido: [{ campos: "reply_to" }, "Campos que este pedido no acepta: reply_to"],
  campo_invalido: [{ campo: "text" }, "text falta o no tiene el tipo correcto"],
  tipo_de_conversacion: [undefined, "type tiene que ser \"direct\": por API solo se abren chats directos"],
  falta_idempotencia: [undefined, "Falta la cabecera Idempotency-Key: de 8 a 100 caracteres ASCII visibles, distinta en cada mensaje"],
  idempotencia_invalida: [undefined, "La Idempotency-Key tiene que tener de 8 a 100 caracteres ASCII visibles, sin espacios"],
  id_de_mensaje_invalido: [undefined, "El id del mensaje no es válido"],
  q_invalido: [undefined, "q tiene que ser un texto de hasta 100 caracteres, sin caracteres nulos"],
  texto_invalido: [undefined, "El texto tiene que tener de 1 a 4.000 caracteres, al menos uno visible, y sin caracteres de control, invisibles ni de dirección del texto (solo texto plano)"],
  cita_invalida: [undefined, "reply_to_id tiene que ser un mensaje no borrado de esta conversación; con thread: true, uno que no sea a su vez una respuesta en hilo"],
  conversacion_muy_grande: [undefined, "Por API solo se escribe en conversaciones de hasta 50 personas"],
  consigo_mismo: [undefined, "No se puede abrir un chat con la misma persona de la API key"],
  demasiadas_conversaciones: [undefined, "La persona de esta API key ya está en demasiadas conversaciones para abrir otra por API"],
  persona_no_encontrada: [undefined, "A esa persona no se le puede escribir por API: no existe, no está en esta agencia o no está activa"],
  mensaje_no_encontrado: [undefined, "Ese mensaje no existe en esta conversación"],
  mensaje_de_otra_persona: [undefined, "Ese mensaje es de otra persona"],
  mensaje_escrito_a_mano: [undefined, "Ese mensaje no lo mandó una integración: se escribió en Maven"],
  mensaje_de_otra_integracion: [undefined, "Ese mensaje lo mandó otra integración"],
  mensaje_ya_borrado: [undefined, "Ese mensaje está borrado"],
  idempotencia_reusada: [undefined, "Esa Idempotency-Key ya se usó con otro pedido en las últimas 72 horas"],
  escritura_llave_no_valida: [undefined, "La API key ya no es válida para escribir: está revocada o venció"],
  escritura_prohibida: [undefined, "Esta API key no puede hacer esta escritura"],
  no_puede_escribir_aqui: [undefined, "En esta conversación solo escriben sus administradores"],
  tope_de_escritura: [{ limite: "key_messages_minute", s: 42 }, "Se alcanzó el tope key_messages_minute. Reintenta en 42 s."],
  escritura_en_curso: [undefined, "Esta API key ya tiene otro pedido en curso: las escrituras van una a la vez. Reintenta en 1 s."],
  ronda_de_integraciones: [undefined, "Los últimos 20 mensajes de esta conversación son de integraciones: hace falta que escriba una persona antes de seguir"],
  escritura_apagada: [undefined, "La escritura del Messenger por API está apagada en este momento"],
  escritura_en_pausa: [undefined, "La escritura del Messenger por API está en pausa porque la base está bajo carga. Reintenta más tarde."],
  resultado_incierto: [undefined, "No se sabe si la escritura se hizo: puede haberse hecho. Reintenta el mismo pedido (en los POST, con la misma Idempotency-Key)."],
  // El equipo de la plataforma conectada (11/11): el texto con el que nacen. equipo_rutas
  // cambió a propósito el mismo día, al sumar las lecturas (GET /equipo, horas, notas), y
  // otra vez el 13/11 al sumar GET /equipo/argos.
  equipo_rutas: [undefined, "Usa GET /equipo, POST /equipo/sync, GET /equipo/horas, GET /equipo/notas o GET /equipo/argos"],
  equipo_personas_invalidas: [undefined, "personas tiene que ser una lista de 1 a 1000 personas"],
  equipo_roles_invalidos: [undefined, "roles tiene que ser una lista de hasta 50 roles (nombres, o objetos con nombre)"],
  equipo_rango_invalido: [undefined, "desde y hasta van como AAAA-MM-DD, con desde <= hasta y hasta 93 días; no se aceptan otros parámetros"],
};

Deno.test("en español, cada texto es byte a byte el de antes", () => {
  assertEquals(Object.keys(ANTES).sort(), [...CLAVES].sort(), "hay textos sin su versión de antes (o sobra una)");
  for (const k of CLAVES) {
    const [vars, antes] = ANTES[k];
    // deno-lint-ignore no-explicit-any
    assertEquals((msg as any)("es", k, vars), antes, `${k} cambió en español`);
  }
});

// ─── Vary ────────────────────────────────────────────────────────────────────

Deno.test("Vary: suma Accept-Language sin pisar Origin (CORS) y sin repetirlo", () => {
  assertEquals(varyConIdioma("Origin"), "Origin, Accept-Language");
  assertEquals(varyConIdioma(undefined), "Accept-Language");
  assertEquals(varyConIdioma(""), "Accept-Language");
  assertEquals(varyConIdioma("Origin, accept-language"), "Origin, accept-language");
  assertEquals(varyConIdioma("Origin,Accept-Encoding"), "Origin, Accept-Encoding, Accept-Language");
});

// ─── El idioma llega de verdad hasta el cliente ─────────────────────────────

Deno.test("decidir: por defecto, el 403 de siempre; en inglés, sin la nota interna en español", () => {
  const v = decidir("sales", 2);
  assert(!v.ok && v.estado === 403);
  assertEquals(
    v.motivo,
    "Este recurso todavía no separa datos por agencia, así que se desactiva mientras Maven tenga más de una, " +
      "para no exponer datos de otras. Pendiente: creator_daily_earnings.tenant_id tiene DEFAULT fijo y los " +
      "importadores BLU no lo escriben; además sus índices únicos no incluyen la agencia.",
  );
  const en = decidir("sales", 2, AISLAMIENTO_POR_RECURSO, "en");
  assert(!en.ok && en.estado === 403 && en.error === "resource_unavailable", "el inglés cambió el estado o el código");
  assertEquals(en.motivo, MENSAJES.recurso_sin_aislamiento.en);
  const e404 = decidir("nada", 1, AISLAMIENTO_POR_RECURSO, "en");
  assert(!e404.ok && e404.estado === 404 && e404.error === "not_found");
  assertEquals(e404.motivo, "Unknown resource: nada");
  const e503 = decidir("sales", null, AISLAMIENTO_POR_RECURSO, "en");
  assert(!e503.ok && e503.estado === 503 && e503.error === "temporarily_unavailable");
  assertEquals(e503.motivo, MENSAJES.aislamiento_no_verificado.en);
  // Todos los recursos reales: en inglés, ni una letra de español.
  for (const recurso of Object.keys(AISLAMIENTO_POR_RECURSO)) {
    const r = decidir(recurso, 2, AISLAMIENTO_POR_RECURSO, "en");
    if (!r.ok) assert(!RASTRO_DE_ESPANOL.test(r.motivo), `${recurso}: el 403 en inglés tiene español: ${r.motivo}`);
  }
});

const CONV = "16750574-1111-4222-8333-944455556666";
const CTX: Contexto = {
  agenciaDeLaLlave: "30869615-f579-4981-8a1f-dbebc61eae2d",
  actuaComo: "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35",
  scopes: ["messenger:read"],
  ruta: [],
  consulta: {},
  llave: { conWhitelist: true, venceEl: "2026-12-01T00:00:00Z" },
  baseDeArchivos: "https://proyecto.supabase.co",
  cupo: { limite: 1000, restantes: 999, reinicio: "2026-09-25T19:00:00+00:00" },
  idioma: "es",
  metodo: "GET",
  cuerpo: null,
  idempotencia: null,
};
const explota = new Proxy({}, { get: () => { throw new Error("tocó la base"); } }) as SupabaseClient;

/** [ruta, consulta, clave que tiene que salir]: todos los 400/403/404 que se
 *  responden sin tocar la base. */
const RECHAZOS: [string[], Record<string, string>, Clave][] = [
  [["conversations"], { limit: "0" }, "limit_invalido"],
  [["conversations"], { offset: "-1" }, "offset_invalido"],
  [["conversations", "no-uuid"], {}, "id_de_conversacion_invalido"],
  [["conversations", "no-uuid", "messages"], {}, "id_de_conversacion_invalido"],
  [["conversations", CONV, "messages"], { limit: "999" }, "limit_invalido"],
  [["conversations", CONV, "messages"], { include: "x" }, "include_invalido"],
  [["conversations", CONV, "messages"], { before: "a", after: "b" }, "before_y_after"],
  [["conversations", CONV, "messages"], { before: "zz" }, "cursor_invalido"],
  [["conversations", CONV, "messages"], { thread_root_id: "x" }, "thread_root_id_invalido"],
  [["feed"], { limit: "0" }, "limit_invalido"],
  [["feed"], { include: "x" }, "include_invalido"],
  [["feed"], { after: "a", since: "b" }, "after_y_since"],
  [["feed"], { exclude_own: "si" }, "exclude_own_invalido"],
  [["feed"], { after: "zz" }, "cursor_invalido"],
  [["feed"], { since: "ayer" }, "since_invalido"],
  [["feed"], { since: "2020-01-01T00:00:00Z" }, "since_muy_viejo"],
  [["nada"], {}, "messenger_rutas"],
];

Deno.test("Messenger: cada rechazo sale en el idioma del Contexto (y en español, el de antes)", async () => {
  for (const [ruta, consulta, clave] of RECHAZOS) {
    for (const idioma of ["es", "en"] as const) {
      const r = await servirMessenger(explota, { ...CTX, ruta, consulta, idioma });
      assert(!r.ok && r.estado !== 503, `${ruta.join("/")} no fue un rechazo`);
      assertEquals(r.mensaje, MENSAJES[clave][idioma], `${ruta.join("/")} ${JSON.stringify(consulta)} en ${idioma}`);
    }
    // El código y el estado no dependen del idioma.
    const es = await servirMessenger(explota, { ...CTX, ruta, consulta, idioma: "es" });
    const en = await servirMessenger(explota, { ...CTX, ruta, consulta, idioma: "en" });
    assert(!es.ok && !en.ok && es.estado === en.estado && es.estado !== 503 && en.estado !== 503);
    assertEquals(es.error, en.error);
  }
  // Los mismos textos, contra lo que respondía ANTES de este cambio.
  const antes = await servirMessenger(explota, { ...CTX, ruta: ["conversations", CONV, "messages"], consulta: { before: "a", after: "b" } });
  assert(!antes.ok && antes.estado === 400);
  assertEquals(antes.mensaje, "Usa before O after, no los dos");
});

Deno.test("Messenger: la llave sin reglas (403) y la conversación que no ve (404), en los dos idiomas", async () => {
  for (const idioma of ["es", "en"] as const) {
    const r = await servirMessenger(explota, { ...CTX, ruta: ["conversations"], llave: { conWhitelist: false, venceEl: null }, idioma });
    assert(!r.ok && r.estado === 403 && r.error === "forbidden");
    assertEquals(r.mensaje, MENSAJES.messenger_llave_sin_reglas[idioma]);

    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    const noVe = { from: () => q } as unknown as SupabaseClient;
    const n = await servirMessenger(noVe, { ...CTX, ruta: ["conversations", CONV], idioma });
    assert(!n.ok && n.estado === 404 && n.error === "not_found");
    assertEquals(n.mensaje, idioma === "es" ? "Conversación no encontrada" : "Conversation not found");
  }
});

Deno.test("/me y el scope: el 404 y el 403 salen en el idioma del Contexto", async () => {
  const es = await servirMe(explota, { ...CTX, ruta: ["x"] });
  assert(!es.ok && es.estado === 404);
  assertEquals(es.mensaje, "Sub-recurso de me desconocido: x");
  const en = await servirMe(explota, { ...CTX, ruta: ["x"], idioma: "en" });
  assert(!en.ok && en.estado === 404 && en.error === "not_found");
  assertEquals(en.mensaje, "Unknown /me sub-resource: x");

  const sinScopeEs = await servirComoUsuario("messenger", explota, { ...CTX, scopes: [] });
  assert(!sinScopeEs.ok && sinScopeEs.estado === 403);
  assertEquals(sinScopeEs.mensaje, "Falta el scope messenger:read");
  const sinScopeEn = await servirComoUsuario("messenger", explota, { ...CTX, scopes: [], idioma: "en" });
  assert(!sinScopeEn.ok && sinScopeEn.estado === 403 && sinScopeEn.error === "forbidden");
  assertEquals(sinScopeEn.mensaje, "Missing scope messenger:read");
});

// ─── Tipos (no corre: lo verifica `deno check`, en la guarda de CI) ─────────

function _soloTipos() {
  // @ts-expect-error una clave que no existe no compila
  msg("es", "clave_que_no_existe");
  // @ts-expect-error a una clave con variables le faltan
  msg("es", "falta_scope");
  // @ts-expect-error una variable con otro nombre
  msg("es", "falta_scope", { alcance: "x" });
  // @ts-expect-error a una clave sin variables no se le pasan
  msg("es", "llave_invalida", { x: 1 });
  // @ts-expect-error un idioma que no existe
  msg("fr", "llave_invalida");
  msg("en", "falta_scope", { scope: "x" });
}
void _soloTipos;
