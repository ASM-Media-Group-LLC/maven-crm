// Los textos que el API pública le muestra a quien la llama, en español y en inglés.
//
// POR QUÉ. Las integraciones las arma gente que no siempre lee español (el pedido de
// Álvaro): el `message` de cada error tiene que poder leerse en inglés. Lo que NO
// cambia nunca, en ningún idioma: el código de máquina (`error: "unauthorized"`…),
// el estado HTTP, las cabeceras, los nombres de campo y los datos. Un cliente que
// decide por `error` sigue funcionando igual; solo cambia el texto para personas.
//
// CÓMO SE ELIGE. Por la cabecera Accept-Language del pedido (RFC 9110 §12.5.4). Sin
// cabecera, o si no pide inglés, sale en ESPAÑOL, byte a byte igual que antes: las
// integraciones vivas (kashgrupo1) no ven ningún cambio.
//
// ⚠️ PURO: no importa nada, no toca la base ni la red. recursos-como-usuario.ts lo
// importa, y ese archivo solo puede importar valores de piezas puras (el test lo
// verifica en los dos lados).
//
// ⚠️ SOLO lo que ve el cliente. Lo que va únicamente al log (`detalle`, el `donde`
// de noDisponible) queda en español y no pasa por acá.

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
 *  Gana, de los rangos ACEPTABLES (q > 0) que son "en"/"en-*" o "es"/"es-*", el de
 *  mayor q; con empate, el primero de la lista. `q=0` quiere decir "esto NO". Un
 *  elemento mal formado se ignora. Si ninguno sirve (sin cabecera, "*", otros
 *  idiomas, basura), español: es lo que el API respondió siempre. */
export function idiomaDelPedido(req: Request): Idioma {
  const cabecera = req.headers.get("accept-language");
  if (!cabecera) return "es";
  let elegido: Idioma | null = null;
  let mejor = 0;
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
    if (!valido || q <= 0) continue;
    const idioma = idiomaDeRango(rango);
    // Estrictamente mayor: con empate se queda el que vino antes.
    if (idioma !== null && q > mejor) {
      elegido = idioma;
      mejor = q;
    }
  }
  return elegido ?? "es";
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
  ip_desconocida: { es: "desconocida", en: "unknown" },
  llave_sin_agencia: {
    es: "Esta API key no pertenece a ninguna agencia",
    en: "This API key does not belong to any agency",
  },
  persona_no_vigente: {
    es: "La persona como la que actúa esta API key ya no está activa en esta agencia de Maven",
    en: "The user this API key acts as is no longer active in this Maven agency",
  },
  no_disponible: {
    es: "El servicio no está disponible en este momento. Reintentá en unos segundos.",
    en: "The service is temporarily unavailable. Retry in a few seconds.",
  },
  limite_por_minuto: {
    es: "Esta API key llegó a su límite de {n} pedidos por minuto. Reintentá en {s} s.",
    en: "This API key has reached its limit of {n} requests per minute. Retry in {s} s.",
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
    en: "Unknown sales sub-resource: {sub}",
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
    es: "No se pudo verificar el aislamiento entre agencias. Reintentá en unos segundos.",
    en: "Could not verify isolation between agencies. Retry in a few seconds.",
  },

  // --- Lo que actúa como la persona de la llave (recursos-como-usuario.ts) ---
  me_sub_recurso_desconocido: {
    es: "Sub-recurso de me desconocido: {sub}",
    en: "Unknown me sub-resource: {sub}",
    vars: ["sub"],
  },
  messenger_llave_sin_reglas: {
    es: "Las llaves con Messenger necesitan IPs fijas y fecha de vencimiento",
    en: "API keys with Messenger access require an IP allowlist and an expiration date",
  },
  messenger_rutas: {
    es: "Usá /messenger/conversations, /messenger/conversations/{id}, " +
      "/messenger/conversations/{id}/messages o /messenger/feed",
    en: "Use /messenger/conversations, /messenger/conversations/{id}, " +
      "/messenger/conversations/{id}/messages or /messenger/feed",
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
  before_y_after: { es: "Usá before O after, no los dos", en: "Use before OR after, not both" },
  cursor_invalido: { es: "El cursor no es válido", en: "Invalid cursor" },
  thread_root_id_invalido: { es: "thread_root_id no es válido", en: "Invalid thread_root_id" },
  after_y_since: { es: "Usá after O since, no los dos", en: "Use after OR since, not both" },
  exclude_own_invalido: { es: "exclude_own tiene que ser true o false", en: "exclude_own must be true or false" },
  since_invalido: { es: "since tiene que ser una fecha ISO 8601", en: "since must be an ISO 8601 date" },
  since_muy_viejo: {
    es: "since no puede tener más de 72 horas: para lo anterior, leé cada conversación con /messages",
    en: "since cannot be more than 72 hours ago; for older messages, read each conversation with /messages",
  },
} as const satisfies Record<string, Entrada>;

export type Clave = keyof typeof MENSAJES;

type VarsDe<K extends Clave> = (typeof MENSAJES)[K] extends { readonly vars: readonly (infer V)[] } ? V & string : never;

/** Las claves que no llevan variables. */
export type ClaveSinVars = { [K in Clave]: [VarsDe<K>] extends [never] ? K : never }[Clave];

/** El texto de `clave` en `idioma`, con sus variables puestas. Una clave que no
 *  existe, una variable que falta o una que sobra no compilan. Cualquier idioma que
 *  no sea "en" sale en español. Un solo pase: el valor de una variable nunca se
 *  vuelve a interpretar (una IP con "{s}" adentro queda tal cual). */
export function msg<K extends Clave>(
  idioma: Idioma,
  clave: K,
  ...vars: [VarsDe<K>] extends [never] ? [] : [Record<VarsDe<K>, string | number>]
): string {
  const entrada: Entrada = MENSAJES[clave];
  const texto = idioma === "en" ? entrada.en : entrada.es;
  const declaradas = entrada.vars ?? [];
  if (declaradas.length === 0) return texto;
  const valores = (vars[0] ?? {}) as Record<string, string | number>;
  return texto.replace(/\{([A-Za-z_]+)\}/g, (marca, nombre: string) =>
    declaradas.includes(nombre) && Object.hasOwn(valores, nombre) ? String(valores[nombre]) : marca
  );
}
