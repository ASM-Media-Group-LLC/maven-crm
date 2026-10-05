// Los textos que el API pública le muestra a quien la llama, en español y en inglés.
//
// POR QUÉ. Las integraciones las arma gente que no siempre lee español (el pedido de
// Álvaro): el `message` de cada error tiene que poder leerse en inglés. Lo que NO
// cambia nunca, en ningún idioma: el código de máquina (`error: "unauthorized"`…),
// el estado HTTP, las cabeceras, los nombres de campo y los datos. Un cliente que
// decide por `error` sigue funcionando igual; solo cambia el texto para personas.
//
// CÓMO SE ELIGE. Por la cabecera Accept-Language del pedido (RFC 9110 §12.5.4, con el
// comodín `*` como dice la RFC 4647). Sin cabecera, o si no prefiere el inglés, sale en
// ESPAÑOL, byte a byte igual que antes: las integraciones vivas (kashgrupo1) no ven
// ningún cambio.
//
// ⚠️ PURO: no importa nada, no toca la base ni la red. recursos-como-usuario.ts lo
// importa, y ese archivo solo puede importar valores de piezas puras (el test lo
// verifica en los dos lados).
//
// ⚠️ SOLO lo que ve el cliente. Lo que va únicamente al log (`detalle`, el `donde`
// de noDisponible) queda en español y no pasa por aquí.

export type Idioma = "es" | "en";

// ─── Negociación ───────────────────────────────────────────────────────────────

// language-range = 1*8ALPHA *("-" 1*8alphanum) / "*"   (RFC 4647 §2.1)
const RANGO = /^(?:[a-z]{1,8}(?:-[a-z0-9]{1,8})*|\*)$/i;
// qvalue = ("0" ["." 0*3DIGIT]) / ("1" ["." 0*3("0")])   (RFC 9110 §12.4.2)
const PESO = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

function idiomaDeRango(rango: string): Idioma | null {
  const r = rango.toLowerCase();
  if (r === "en" || r.startsWith("en-")) return "en";
  if (r === "es" || r.startsWith("es-")) return "es";
  return null;
}

/** El idioma de las respuestas a este pedido, según su Accept-Language.
 *
 *  Cada idioma que servimos toma su q de los rangos que lo nombran ("en"/"en-*",
 *  "es"/"es-*"; si hay varios, el mayor). El comodín `*` vale para el idioma que
 *  ningún rango nombra (RFC 9110 §12.5.4, RFC 4647 §2.1): un rango explícito siempre
 *  le gana al `*` para su idioma. `q=0` quiere decir "esto NO".
 *
 *  Gana el de mayor q entre los aceptables (q > 0). Con empate, el nombrado
 *  explícitamente le gana al que solo entró por `*`; entre dos explícitos, el que
 *  vino primero; si los dos entraron por `*`, español.
 *
 *  Si ninguno es aceptable: inglés solo si el pedido RECHAZA el español y no rechaza
 *  el inglés; si no, español, que es lo que el API respondió siempre (sin cabecera,
 *  otros idiomas, basura). Rechazar es `es;q=0`, o `*;q=0` sin nombrarlo: un rango
 *  que cubre lo que servimos ("es" a secas). `es-CO;q=0` rechaza una variante, no el
 *  español (RFC 4647 §3.3.1: "es-CO" no cubre "es"). Un elemento mal formado se
 *  ignora. */
export function idiomaDelPedido(req: Request): Idioma {
  const cabecera = req.headers.get("accept-language");
  if (!cabecera) return "es";
  // Por idioma: el mayor q de sus rangos explícitos y en qué posición vino.
  const explicito: Partial<Record<Idioma, { q: number; pos: number }>> = {};
  // Por idioma: si algún rango EXACTO ("es", no "es-CO") lo rechaza con q=0.
  const rechazoExacto: Partial<Record<Idioma, true>> = {};
  let comodin: { q: number; pos: number } | null = null;
  let pos = 0;
  for (const elemento of cabecera.split(",")) {
    const [rangoCrudo, ...parametros] = elemento.split(";");
    const rango = rangoCrudo.trim();
    if (!RANGO.test(rango)) continue;
    let q = 1;
    let valido = true;
    for (const p of parametros) {
      const igual = p.indexOf("=");
      if (igual === -1) { valido = false; break; }
      if (p.slice(0, igual).trim().toLowerCase() !== "q") continue;
      const valor = p.slice(igual + 1).trim();
      if (!PESO.test(valor)) { valido = false; break; }
      q = Number(valor);
    }
    if (!valido) continue;
    const aca = { q, pos: pos++ };
    if (rango === "*") {
      // Estrictamente mayor: con empate se queda el que vino antes.
      if (comodin === null || q > comodin.q) comodin = aca;
      continue;
    }
    const idioma = idiomaDeRango(rango);
    if (idioma === null) continue;
    if (q <= 0 && rango.toLowerCase() === idioma) rechazoExacto[idioma] = true;
    const previo = explicito[idioma];
    if (previo === undefined || q > previo.q) explicito[idioma] = aca;
  }

  // El peso de cada idioma: el explícito si lo hay; si no, el del comodín; si no, nada.
  const peso = (idioma: Idioma) => {
    const e = explicito[idioma];
    if (e !== undefined) return { ...e, porComodin: false };
    if (comodin !== null) return { ...comodin, porComodin: true };
    return null;
  };
  const es = peso("es");
  const en = peso("en");
  const aceptable = (p: typeof es): p is NonNullable<typeof es> => p !== null && p.q > 0;
  const rechazado = (idioma: Idioma, p: typeof es) =>
    p !== null && p.q <= 0 && (p.porComodin || rechazoExacto[idioma] === true);

  if (aceptable(en) && aceptable(es)) {
    if (en.q !== es.q) return en.q > es.q ? "en" : "es";
    if (en.porComodin !== es.porComodin) return en.porComodin ? "es" : "en";
    return en.pos < es.pos ? "en" : "es";
  }
  if (aceptable(en)) return "en";
  if (aceptable(es)) return "es";
  return rechazado("es", es) && !rechazado("en", en) ? "en" : "es";
}

/** El valor de Vary con Accept-Language sumado (sin pisar el Vary: Origin del CORS):
 *  la misma URL responde distinto según el idioma, y un caché no puede mezclarlas. */
export function varyConIdioma(actual: string | undefined): string {
  const partes = (actual ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!partes.some((p) => p.toLowerCase() === "accept-language")) partes.push("Accept-Language");
  return partes.join(", ");
}

// ─── Textos ────────────────────────────────────────────────────────────────────
//
// Cada entrada: el texto en español (el de siempre, sin tocar una coma) y en inglés.
// `vars` declara qué {marcas} se reemplazan; cualquier otra llave queda tal cual (así
// "/messenger/conversations/{id}" no es una variable). `soloEnEs`: variables cuyo
// VALOR está en español (notas internas), que el texto en inglés no muestra.

type Entrada = {
  readonly es: string;
  readonly en: string;
  readonly vars?: readonly string[];
  readonly soloEnEs?: readonly string[];
};

export const MENSAJES = {
  // --- La llave (index.ts) ---
  falta_llave: {
    es: "Falta la API key (Authorization: Bearer mvk_live_...)",
    en: "Missing API key (Authorization: Bearer mvk_live_...)",
  },
  llave_invalida: { es: "API key inválida", en: "Invalid API key" },
  llave_revocada: { es: "API key revocada", en: "This API key has been revoked" },
  llave_vencida: { es: "API key vencida", en: "This API key has expired" },
  ip_no_permitida: {
    es: "IP {ip} no está en la whitelist de esta API key",
    en: "IP {ip} is not in this API key's IP allowlist",
    vars: ["ip"],
  },
  // En inglés entre paréntesis: "IP (unknown) is not in…" se lee; "IP unknown is not…", no.
  ip_desconocida: { es: "desconocida", en: "(unknown)" },
  llave_sin_agencia: {
    es: "Esta API key no pertenece a ninguna agencia",
    en: "This API key does not belong to any agency",
  },
  persona_no_vigente: {
    es: "La persona como la que actúa esta API key ya no está activa en esta agencia de Maven",
    en: "The user this API key acts as is no longer active in this Maven agency",
  },
  no_disponible: {
    es: "El servicio no está disponible en este momento. Reintenta en unos segundos.",
    en: "The service is temporarily unavailable. Please try again in a few seconds.",
  },
  limite_por_minuto: {
    es: "Esta API key llegó a su límite de {n} pedidos por minuto. Reintenta en {s} s.",
    en: "This API key has reached its limit of {n} requests per minute. Please try again in {s} s.",
    vars: ["n", "s"],
  },
  limite_por_hora: {
    es: "Esta API key llegó a su límite de {n} pedidos por hora. Se reinicia a las {hora}.",
    en: "This API key has reached its limit of {n} requests per hour. It resets at {hora}.",
    vars: ["n", "hora"],
  },
  falta_scope: { es: "Falta el scope {scope}", en: "Missing scope {scope}", vars: ["scope"] },

  // --- Recursos de siempre (index.ts) ---
  recurso_desconocido: { es: "Recurso desconocido: {recurso}", en: "Unknown resource: {recurso}", vars: ["recurso"] },
  creadora_no_encontrada: { es: "Creadora no encontrada", en: "Creator not found" },
  contacto_no_encontrado: { es: "Contacto no encontrado", en: "Contact not found" },
  kind_invalido: { es: "kind invalido. Usa: {opciones}", en: "Invalid kind. Use: {opciones}", vars: ["opciones"] },
  sales_sub_recurso_desconocido: {
    es: "Sub-recurso de sales desconocido: {sub}",
    en: "Unknown /sales sub-resource: {sub}",
    vars: ["sub"],
  },
  cowork_rutas: {
    es: "Usa /cowork/time, /cowork/time/segments, /cowork/breaks o /cowork/meets",
    en: "Use /cowork/time, /cowork/time/segments, /cowork/breaks or /cowork/meets",
  },

  // --- La puerta de aislamiento (aislamiento.ts) ---
  // El `pendiente` es una nota interna en español (qué tabla falta arreglar): en
  // inglés se dice qué pasa y por qué, sin la nota.
  recurso_sin_aislamiento: {
    es: "Este recurso todavía no separa datos por agencia, así que se desactiva " +
      "mientras Maven tenga más de una, para no exponer datos de otras. Pendiente: {pendiente}.",
    en: "This resource does not separate data by agency yet, so it is disabled while " +
      "Maven has more than one agency, to avoid exposing other agencies' data.",
    vars: ["pendiente"],
    soloEnEs: ["pendiente"],
  },
  aislamiento_no_verificado: {
    es: "No se pudo verificar el aislamiento entre agencias. Reintenta en unos segundos.",
    en: "Could not verify isolation between agencies. Please try again in a few seconds.",
  },

  // --- Lo que actúa como la persona de la llave (recursos-como-usuario.ts) ---
  me_sub_recurso_desconocido: {
    es: "Sub-recurso de me desconocido: {sub}",
    en: "Unknown /me sub-resource: {sub}",
    vars: ["sub"],
  },
  messenger_llave_sin_reglas: {
    es: "Las llaves con Messenger necesitan IPs fijas y fecha de vencimiento",
    en: "API keys with Messenger access require an IP allowlist and an expiration date",
  },
  // Cambió el 01/10 (PR 4, la escritura): suma las rutas nuevas. Ninguna key de prod
  // tenía Messenger, así que nadie leía el texto de antes.
  messenger_rutas: {
    es: "Usa /messenger/conversations, /messenger/conversations/{id}, " +
      "/messenger/conversations/{id}/messages, /messenger/conversations/{id}/messages/{message_id}, " +
      "/messenger/feed o /messenger/people",
    en: "Use /messenger/conversations, /messenger/conversations/{id}, " +
      "/messenger/conversations/{id}/messages, /messenger/conversations/{id}/messages/{message_id}, " +
      "/messenger/feed or /messenger/people",
  },
  conversacion_no_encontrada: { es: "Conversación no encontrada", en: "Conversation not found" },
  id_de_conversacion_invalido: { es: "El id de la conversación no es válido", en: "Invalid conversation id" },
  limit_invalido: {
    es: "limit tiene que ser un número entre 1 y 100",
    en: "limit must be a number between 1 and 100",
  },
  offset_invalido: {
    es: "offset tiene que ser un número de 0 en adelante",
    en: "offset must be a number greater than or equal to 0",
  },
  include_invalido: { es: "include solo acepta: rich", en: "include only accepts: rich" },
  before_y_after: { es: "Usa before O after, no los dos", en: "Use before OR after, not both" },
  cursor_invalido: { es: "El cursor no es válido", en: "Invalid cursor" },
  thread_root_id_invalido: { es: "thread_root_id no es válido", en: "Invalid thread_root_id" },
  after_y_since: { es: "Usa after O since, no los dos", en: "Use after OR since, not both" },
  exclude_own_invalido: { es: "exclude_own tiene que ser true o false", en: "exclude_own must be true or false" },
  since_invalido: { es: "since tiene que ser una fecha ISO 8601", en: "since must be an ISO 8601 date" },
  since_muy_viejo: {
    es: "since no puede tener más de 72 horas: para lo anterior, lee cada conversación con /messages",
    en: "since cannot be more than 72 hours ago; for older messages, read each conversation with /messages",
  },

  // --- La escritura del Messenger (index.ts y recursos-como-usuario.ts; diseño §1) ---
  metodo_no_permitido: {
    es: "Método no permitido en esta ruta. Se aceptan: {permitidos}",
    en: "Method not allowed on this route. Allowed: {permitidos}",
    vars: ["permitidos"],
  },
  cuerpo_muy_grande: { es: "El cuerpo del pedido pasa de 64 KB", en: "The request body is larger than 64 KB" },
  tipo_de_contenido: {
    es: "El cuerpo tiene que ser JSON en UTF-8 (Content-Type: application/json)",
    en: "The body must be UTF-8 JSON (Content-Type: application/json)",
  },
  cuerpo_mal_codificado: { es: "El cuerpo no es UTF-8 válido", en: "The body is not valid UTF-8" },
  cuerpo_json_invalido: { es: "El cuerpo no es JSON válido", en: "The body is not valid JSON" },
  cuerpo_no_es_objeto: { es: "El cuerpo tiene que ser un objeto JSON", en: "The body must be a JSON object" },
  campo_desconocido: {
    es: "Campos que este pedido no acepta: {campos}",
    en: "Fields this request does not accept: {campos}",
    vars: ["campos"],
  },
  campo_invalido: {
    es: "{campo} falta o no tiene el tipo correcto",
    en: "{campo} is missing or has the wrong type",
    vars: ["campo"],
  },
  tipo_de_conversacion: {
    es: "type tiene que ser \"direct\": por API solo se abren chats directos",
    en: "type must be \"direct\": only direct chats can be opened through the API",
  },
  falta_idempotencia: {
    es: "Falta la cabecera Idempotency-Key: de 8 a 100 caracteres ASCII visibles, distinta en cada mensaje",
    en: "Missing Idempotency-Key header: 8 to 100 visible ASCII characters, different for each message",
  },
  idempotencia_invalida: {
    es: "La Idempotency-Key tiene que tener de 8 a 100 caracteres ASCII visibles, sin espacios",
    en: "The Idempotency-Key must be 8 to 100 visible ASCII characters, with no spaces",
  },
  id_de_mensaje_invalido: { es: "El id del mensaje no es válido", en: "Invalid message id" },
  q_invalido: {
    es: "q tiene que ser un texto de hasta 100 caracteres, sin caracteres nulos",
    en: "q must be text of at most 100 characters, with no null characters",
  },
  texto_invalido: {
    es: "El texto tiene que tener de 1 a 4.000 caracteres, al menos uno visible, y sin caracteres de control, invisibles ni de dirección del texto (solo texto plano)",
    en: "The text must be 1 to 4,000 characters of plain text, with at least one visible character and no control, invisible or text-direction characters",
  },
  cita_invalida: {
    es: "reply_to_id tiene que ser un mensaje no borrado de esta conversación; con thread: true, " +
      "uno que no sea a su vez una respuesta en hilo",
    en: "reply_to_id must be a non-deleted message in this conversation; with thread: true, " +
      "it cannot be a thread reply itself",
  },
  conversacion_muy_grande: {
    es: "Por API solo se escribe en conversaciones de hasta 50 personas",
    en: "Through the API you can only post in conversations of up to 50 people",
  },
  consigo_mismo: {
    es: "No se puede abrir un chat con la misma persona de la API key",
    en: "You cannot open a chat with the person this API key acts as",
  },
  demasiadas_conversaciones: {
    es: "La persona de esta API key ya está en demasiadas conversaciones para abrir otra por API",
    en: "The person this API key acts as is in too many conversations to open another one through the API",
  },
  persona_no_encontrada: {
    es: "A esa persona no se le puede escribir por API: no existe, no está en esta agencia o no está activa",
    en: "That person cannot be messaged through the API: they do not exist, are not in this agency or are not active",
  },
  mensaje_no_encontrado: { es: "Ese mensaje no existe en esta conversación", en: "That message does not exist in this conversation" },
  mensaje_de_otra_persona: { es: "Ese mensaje es de otra persona", en: "That message was sent by someone else" },
  mensaje_escrito_a_mano: {
    es: "Ese mensaje no lo mandó una integración: se escribió en Maven",
    en: "That message was not sent by an integration: it was written in Maven",
  },
  mensaje_de_otra_integracion: { es: "Ese mensaje lo mandó otra integración", en: "That message was sent by another integration" },
  mensaje_ya_borrado: { es: "Ese mensaje está borrado", en: "That message has been deleted" },
  idempotencia_reusada: {
    es: "Esa Idempotency-Key ya se usó con otro pedido en las últimas 72 horas",
    en: "That Idempotency-Key was already used with a different request in the last 72 hours",
  },
  escritura_llave_no_valida: {
    es: "La API key ya no es válida para escribir: está revocada o venció",
    en: "This API key is no longer valid for writing: it was revoked or it expired",
  },
  escritura_prohibida: { es: "Esta API key no puede hacer esta escritura", en: "This API key is not allowed to make this write" },
  no_puede_escribir_aqui: {
    es: "En esta conversación solo escriben sus administradores",
    en: "Only the admins of this conversation can post in it",
  },
  tope_de_escritura: {
    es: "Se alcanzó el tope {limite}. Reintenta en {s} s.",
    en: "The {limite} limit was reached. Please try again in {s} s.",
    vars: ["limite", "s"],
  },
  escritura_en_curso: {
    es: "Esta API key ya tiene otro pedido en curso: las escrituras van una a la vez. Reintenta en 1 s.",
    en: "This API key already has another request in progress: writes go one at a time. Please try again in 1 s.",
  },
  ronda_de_integraciones: {
    es: "Los últimos 20 mensajes de esta conversación son de integraciones: hace falta que escriba una persona antes de seguir",
    en: "The last 20 messages in this conversation came from integrations: a person needs to post before you can continue",
  },
  escritura_apagada: {
    es: "La escritura del Messenger por API está apagada en este momento",
    en: "Writing to the Messenger through the API is turned off right now",
  },
  escritura_en_pausa: {
    es: "La escritura del Messenger por API está en pausa porque la base está bajo carga. Reintenta más tarde.",
    en: "Writing to the Messenger through the API is paused because the database is under load. Please try again later.",
  },
  resultado_incierto: {
    es: "No se sabe si la escritura se hizo: puede haberse hecho. Reintenta el mismo pedido (en los POST, con la misma Idempotency-Key).",
    en: "It is unknown whether the write went through: it may have. Retry the same request (for POST, with the same Idempotency-Key).",
  },
} as const satisfies Record<string, Entrada>;

export type Clave = keyof typeof MENSAJES;

type VarsDe<K extends Clave> = (typeof MENSAJES)[K] extends { readonly vars: readonly (infer V)[] } ? V & string : never;

/** Las claves que no llevan variables. */
export type ClaveSinVars = { [K in Clave]: [VarsDe<K>] extends [never] ? K : never }[Clave];

/** El texto de `clave` en `idioma`, con sus variables puestas. Una clave que no
 *  existe, una variable que falta o una que sobra no compilan (`deno check`, que corre
 *  la guarda de CI) y además los rechaza la guarda que lee cada llamada
 *  (aislamiento.test.ts). Cualquier idioma que no sea "en" sale en español. Un solo
 *  pase: el valor de una variable nunca se vuelve a interpretar (una IP con "{s}"
 *  adentro queda tal cual).
 *
 *  NUNCA tira: esto arma el cuerpo de un error, y una excepción aquí escaparía de
 *  Deno.serve como un 500 sin CORS ni JSON (justo lo que noDisponible existe para
 *  evitar). Si igual llegara una clave que no existe (o heredada, como "constructor"),
 *  devuelve la clave misma; una variable que falta deja su {marca} tal cual. */
export function msg<K extends Clave>(
  idioma: Idioma,
  clave: K,
  ...vars: [VarsDe<K>] extends [never] ? [] : [Record<VarsDe<K>, string | number>]
): string {
  if (!Object.hasOwn(MENSAJES, clave)) return String(clave);
  const entrada: Entrada = MENSAJES[clave];
  const texto = idioma === "en" ? entrada.en : entrada.es;
  const declaradas = entrada.vars ?? [];
  if (declaradas.length === 0) return texto;
  const crudos: unknown = vars[0];
  const valores = (typeof crudos === "object" && crudos !== null ? crudos : {}) as Record<string, string | number>;
  return texto.replace(/\{([A-Za-z_]+)\}/g, (marca, nombre: string) =>
    declaradas.includes(nombre) && Object.hasOwn(valores, nombre) ? String(valores[nombre]) : marca
  );
}
