// Piezas PURAS de la escritura del Messenger por API (diseño §1 y §5.2): qué método
// y qué scopes pide cada ruta, cómo se lee el cuerpo de un pedido, la Idempotency-Key
// y la tabla de errores de la base → HTTP. Sin base, sin red, sin clientes y sin
// imports: el test lo verifica, igual que con messenger-formato.ts, porque es uno de
// los archivos de los que recursos-como-usuario.ts puede importar valores.
//
// ⚠️ La pared es la BASE (migración 20261001200000_api_messenger_escritura.sql): ahí
// se validan la key, el texto, la cita, los topes y la marca «vino por API». Aquí solo
// se rechaza lo que ni siquiera puede llegar a la base (un cuerpo que no es JSON, un
// campo que no existe, un texto que Postgres no puede guardar) y se traduce la
// respuesta de la base. Lo que la base decide no se repite aquí.
//
// Los textos para personas NO viven aquí: esto devuelve códigos de máquina y
// recursos-como-usuario.ts los convierte con mensajes.ts (es/en).

// ─── Métodos y rutas ─────────────────────────────────────────────────────────

export type Metodo = "GET" | "POST" | "PATCH" | "DELETE";
export const METODOS: readonly Metodo[] = ["GET", "POST", "PATCH", "DELETE"];

export function esMetodo(m: string): m is Metodo {
  return (METODOS as readonly string[]).includes(m);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Accion =
  | "me"
  | "bandeja" | "conversacion" | "mensajes" | "feed" | "personas"
  | "abrir" | "enviar" | "editar" | "borrar";

/** Las rutas del Messenger: el camino (null = un id) y qué hace cada método. */
const RUTAS_MESSENGER: readonly { camino: readonly (string | null)[]; metodos: Partial<Record<Metodo, Accion>> }[] = [
  { camino: ["conversations"], metodos: { GET: "bandeja", POST: "abrir" } },
  { camino: ["conversations", null], metodos: { GET: "conversacion" } },
  { camino: ["conversations", null, "messages"], metodos: { GET: "mensajes", POST: "enviar" } },
  { camino: ["conversations", null, "messages", null], metodos: { PATCH: "editar", DELETE: "borrar" } },
  { camino: ["feed"], metodos: { GET: "feed" } },
  { camino: ["people"], metodos: { GET: "personas" } },
];

/** Lo que pide messenger:write además de messenger:read: escribir y el directorio
 *  (que solo sirve para abrir chats: una key de solo lectura no recibe la lista
 *  entera ni puede deducir, comparándola en el tiempo, a quién bloquearon). */
const ACCIONES_DE_ESCRITURA: ReadonlySet<Accion> = new Set(["abrir", "enviar", "editar", "borrar", "personas"]);

export type RutaResuelta =
  | { ok: true; accion: Accion; lectura: boolean; escritura: boolean }
  | { ok: false; estado: 404 }
  | { ok: false; estado: 405; permitidos: Metodo[] };

/** Qué hace (método, ruta) en un recurso como_usuario y qué scopes pide: `lectura`
 *  (el scope de lectura del recurso) y `escritura` (además, el de escritura). Una
 *  ruta que existe con otro método da 405 con los métodos que sí acepta; una que no
 *  existe, 404. /me solo se lee. Sin tocar la base: corre antes que nada. */
export function scopesDeLaRuta(recurso: string, metodo: Metodo, ruta: readonly string[]): RutaResuelta {
  if (recurso === "me") {
    return metodo === "GET" ? { ok: true, accion: "me", lectura: false, escritura: false } : { ok: false, estado: 405, permitidos: ["GET"] };
  }
  if (recurso !== "messenger") return { ok: false, estado: 404 };
  const r = RUTAS_MESSENGER.find((x) =>
    x.camino.length === ruta.length && x.camino.every((parte, i) => parte === null ? ruta[i] !== "" : parte === ruta[i])
  );
  if (!r) return { ok: false, estado: 404 };
  const accion = r.metodos[metodo];
  if (!accion) return { ok: false, estado: 405, permitidos: METODOS.filter((m) => r.metodos[m] !== undefined) };
  return { ok: true, accion, lectura: true, escritura: ACCIONES_DE_ESCRITURA.has(accion) };
}

// ─── El cuerpo ───────────────────────────────────────────────────────────────

/** Un valor JSON. Sin `unknown` ni funciones: es lo que viaja en el Contexto. */
export type ValorJson = string | number | boolean | null | ValorJson[] | { [clave: string]: ValorJson };
export type ObjetoJson = { [clave: string]: ValorJson };

/** El cuerpo de un POST/PATCH ya decodificado: tiene que ser un objeto JSON. */
export function leerCuerpoDeEscritura(texto: string): { ok: true; cuerpo: ObjetoJson } | { ok: false; problema: "json_invalido" | "no_es_objeto" } {
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return { ok: false, problema: "json_invalido" };
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return { ok: false, problema: "no_es_objeto" };
  return { ok: true, cuerpo: v as ObjetoJson };
}

/** Los campos del cuerpo, por el nombre con el que viajan en el JSON. */
export type CampoDeEscritura = "type" | "user_id" | "text" | "reply_to_id" | "thread";

/** Los campos que no están en la lista (ordenados). Un campo de más es un 400, no se
 *  ignora: si un cliente manda `reply_to` en vez de `reply_to_id`, mandaría sin cita
 *  creyendo que citó (la lección de `refs`/`references`). */
export function sobran(cuerpo: ObjetoJson, permitidos: readonly CampoDeEscritura[]): string[] {
  return Object.keys(cuerpo).filter((k) => !(permitidos as readonly string[]).includes(k)).sort();
}

/** Lo que pide cada escritura, con las claves que viajan en el JSON. Todas las claves
 *  son obligatorias (el valor puede ser null): un dato, un nombre. */
export type CuerpoDeEscritura =
  | { accion: "abrir"; type: "direct"; user_id: string; text: string }
  | { accion: "enviar"; text: string; reply_to_id: string | null; thread: boolean }
  | { accion: "editar"; text: string };

export type ProblemaDeCuerpo =
  | { tipo: "sin_cuerpo" }
  | { tipo: "campo_desconocido"; campos: string[] }
  | { tipo: "campo_invalido"; campo: CampoDeEscritura }
  | { tipo: "tipo_de_conversacion" }
  | { tipo: "texto_invalido" };

const CAMPOS: Record<"abrir" | "enviar" | "editar", readonly CampoDeEscritura[]> = {
  abrir: ["type", "user_id", "text"],
  enviar: ["text", "reply_to_id", "thread"],
  editar: ["text"],
};

/** Un texto que Postgres puede guardar: sin un UTF-16 roto (un sustituto suelto
 *  como "\ud800") ni NUL. Lo demás (largo, controles, dirección) lo decide la base,
 *  que normaliza antes de medir. Sin esto, la base respondería un error de sintaxis
 *  y saldría como un 503 que el cliente reintentaría para siempre. */
export function textoGuardable(t: string): boolean {
  return t.isWellFormed() && !t.includes("\u0000");
}

/** Lee y valida el cuerpo de una escritura. Sin tocar la base. */
export function leerEscritura(
  accion: "abrir" | "enviar" | "editar",
  cuerpo: ObjetoJson | null,
): { ok: true; pedido: CuerpoDeEscritura } | { ok: false; problema: ProblemaDeCuerpo } {
  if (cuerpo === null) return { ok: false, problema: { tipo: "sin_cuerpo" } };
  const extra = sobran(cuerpo, CAMPOS[accion]);
  if (extra.length) return { ok: false, problema: { tipo: "campo_desconocido", campos: extra } };
  const text = cuerpo.text;
  if (typeof text !== "string") return { ok: false, problema: { tipo: "campo_invalido", campo: "text" } };
  if (!textoGuardable(text)) return { ok: false, problema: { tipo: "texto_invalido" } };
  if (accion === "editar") return { ok: true, pedido: { accion, text } };
  if (accion === "abrir") {
    if (cuerpo.type === undefined || cuerpo.type === null) return { ok: false, problema: { tipo: "campo_invalido", campo: "type" } };
    if (cuerpo.type !== "direct") return { ok: false, problema: { tipo: "tipo_de_conversacion" } };
    const userId = cuerpo.user_id;
    if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, problema: { tipo: "campo_invalido", campo: "user_id" } };
    return { ok: true, pedido: { accion, type: "direct", user_id: userId.toLowerCase(), text } };
  }
  const cita = cuerpo.reply_to_id ?? null;
  if (cita !== null && (typeof cita !== "string" || !UUID.test(cita))) {
    return { ok: false, problema: { tipo: "campo_invalido", campo: "reply_to_id" } };
  }
  const hilo = cuerpo.thread ?? false;
  if (typeof hilo !== "boolean") return { ok: false, problema: { tipo: "campo_invalido", campo: "thread" } };
  return { ok: true, pedido: { accion, text, reply_to_id: cita === null ? null : cita.toLowerCase(), thread: hilo } };
}

// ─── La Idempotency-Key ──────────────────────────────────────────────────────

/** La cabecera Idempotency-Key: de 8 a 100 caracteres ASCII visibles, sin espacios
 *  (la misma regla que la base, api_idem_clave). Sin cabecera, null: si hace falta
 *  lo decide el handler (los dos POST la exigen). */
export function leerIdempotencia(valor: string | null): { ok: true; valor: string | null } | { ok: false } {
  if (valor === null) return { ok: true, valor: null };
  if (!/^[!-~]{8,100}$/.test(valor)) return { ok: false };
  return { ok: true, valor };
}

// ─── Lo que devuelven las RPC ────────────────────────────────────────────────

/** El mensaje como lo arma la base (api_mensaje_json), con la forma de FilaDeMensaje
 *  de messenger-formato.ts. Por API no hay adjuntos ni álbumes: van en null. */
export type FilaDeRpc = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: string;
  file_url: null;
  file_name: null;
  reply_to_id: string | null;
  album_id: null;
  is_thread_reply: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  api_key_id: string | null;
  api_display_name: string | null;
};

const texto = (v: unknown): v is string => typeof v === "string";
const textoONulo = (v: unknown): v is string | null => v === null || typeof v === "string";

/** null si la base devolvió otra forma (un contrato roto entre la RPC y el edge). */
export function filaDesdeRpc(v: unknown): FilaDeRpc | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  if (!texto(m.id) || !texto(m.conversation_id) || !texto(m.sender_id) || !texto(m.type)) return null;
  if (!textoONulo(m.content) || !textoONulo(m.reply_to_id) || !textoONulo(m.api_key_id) || !textoONulo(m.api_display_name)) return null;
  if (typeof m.is_thread_reply !== "boolean" || typeof m.is_edited !== "boolean" || typeof m.is_deleted !== "boolean") return null;
  if (!texto(m.created_at) || !texto(m.updated_at)) return null;
  return {
    id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, content: m.content, type: m.type,
    file_url: null, file_name: null, reply_to_id: m.reply_to_id, album_id: null,
    is_thread_reply: m.is_thread_reply, is_edited: m.is_edited, is_deleted: m.is_deleted,
    created_at: m.created_at, updated_at: m.updated_at, api_key_id: m.api_key_id, api_display_name: m.api_display_name,
  };
}

// ─── Errores de la base → HTTP (diseño §1.8) ─────────────────────────────────

/** Los códigos de máquina de un rechazo (el `error` de la respuesta). */
export type CodigoDeRechazo =
  | "unauthorized"
  | "forbidden" | "not_allowed_in_conversation" | "not_your_message" | "not_an_api_message" | "other_integration_message"
  | "not_found" | "conversation_not_found" | "person_not_found"
  | "idempotency_key_reused" | "message_deleted"
  | "invalid_text" | "invalid_reply" | "conversation_too_large" | "cannot_message_self" | "too_many_conversations"
  | "invalid_idempotency_key";

export type ErrorDeEscritura =
  /** Culpa del pedido o de la key: no se reintenta igual. */
  | { tipo: "rechazo"; estado: 400 | 401 | 403 | 404 | 409 | 422; error: CodigoDeRechazo }
  /** Un tope (de la base, de A o el candado por key). */
  | { tipo: "tope"; estado: 429; limite: string; reintentarEnSeg: number }
  /** La escritura está apagada (interruptor, varias agencias, sin fila de cupo) o
   *  en pausa por presión. */
  | { tipo: "pausa"; estado: 503; motivo: string; reintentarEnSeg: number }
  /** Falló sin dejar nada: la transacción volvió atrás entera. Reintentar es seguro. */
  | { tipo: "reintentable"; estado: 503; reintentarEnSeg: number }
  /** No se sabe si se hizo (la llamada se cortó sin respuesta): lección #1868. */
  | { tipo: "incierto"; estado: 503; reintentarEnSeg: number }
  /** A (MV409 directo_duplicado): otra sesión abrió el mismo directo a la vez. No es
   *  un error para el cliente: se vuelve a pedir y la base usa el canónico. */
  | { tipo: "directo_duplicado" }
  /** Cualquier otra cosa: un fallo nuestro (503 genérico, el detalle al log). */
  | { tipo: "otro"; estado: 503; detalle: string };

/** Los `error` del detail de cada SQLSTATE propio, y a qué estado van. */
const RECHAZOS: Record<string, { estado: 401 | 403 | 404 | 409 | 422; codigos: readonly CodigoDeRechazo[] }> = {
  MV401: { estado: 401, codigos: ["unauthorized"] },
  MV403: { estado: 403, codigos: ["forbidden", "not_allowed_in_conversation", "not_your_message", "not_an_api_message", "other_integration_message"] },
  MV404: { estado: 404, codigos: ["not_found", "conversation_not_found", "person_not_found"] },
  MV409: { estado: 409, codigos: ["idempotency_key_reused", "message_deleted"] },
  MV422: { estado: 422, codigos: ["invalid_text", "invalid_reply", "conversation_too_large", "cannot_message_self", "too_many_conversations"] },
};

/** Los rechazos de la migración A, que no llevan detail: se reconocen por el
 *  prefijo del mensaje, que es lo que ya compara la app. Por API nunca hay archivo:
 *  si llegara, es un mensaje que no es texto plano (como `solo_texto` de la B). */
const DE_LA_A: Record<string, Record<string, CodigoDeRechazo>> = {
  MV422: { chat_cita_ajena: "invalid_reply", chat_archivo_externo: "invalid_text" },
};

/** Errores que no dejan nada: la transacción volvió atrás entera (candado que no
 *  llegó, plazo de la sentencia, único que se escapó, deadlock, serialización). */
const SIN_EFECTO = new Set(["55P03", "57014", "23505", "40P01", "40001"]);

/** Cuánto esperar con el interruptor apagado o con varias agencias (no se arregla en
 *  segundos) y con la base bajo presión. */
export const ESPERA_APAGADA_SEG = 300;
export const ESPERA_PRESION_SEG = 60;
export const ESPERA_REINTENTABLE_SEG = 2;
export const ESPERA_INCIERTO_SEG = 5;

function detalleJson(d: unknown): Record<string, unknown> | null {
  if (typeof d !== "string" || !d.startsWith("{")) return null;
  try {
    const v = JSON.parse(d);
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** El error de una llamada a la base (el `error` de supabase-js: code, message,
 *  details), traducido. Total: cualquier forma da algo. */
export function clasificarErrorDeEscritura(e: unknown): ErrorDeEscritura {
  const err = (e && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof err.code === "string" ? err.code : "";
  const mensaje = typeof err.message === "string" ? err.message : "";
  // Sin código: la llamada no llegó a tener respuesta de PostgREST (red, plazo, un
  // corte del proxy). La escritura pudo haberse hecho.
  if (!code) return { tipo: "incierto", estado: 503, reintentarEnSeg: ESPERA_INCIERTO_SEG };
  const detalle = detalleJson(err.details);
  const otro = (): ErrorDeEscritura => ({ tipo: "otro", estado: 503, detalle: `${code}: ${mensaje} ${String(err.details ?? "")}`.trim() });

  if (Object.hasOwn(RECHAZOS, code)) {
    const r = RECHAZOS[code];
    const dicho = detalle?.error;
    if (typeof dicho === "string" && (r.codigos as readonly string[]).includes(dicho)) {
      return { tipo: "rechazo", estado: r.estado, error: dicho as CodigoDeRechazo };
    }
    if (code === "MV422" && dicho === "invalid_idempotency_key") return { tipo: "rechazo", estado: 400, error: "invalid_idempotency_key" };
    if (code === "MV409" && mensaje.startsWith("directo_duplicado")) return { tipo: "directo_duplicado" };
    const deA = DE_LA_A[code];
    if (deA) {
      const prefijo = Object.keys(deA).find((p) => mensaje.startsWith(p + ":") || mensaje === p);
      if (prefijo) return { tipo: "rechazo", estado: r.estado, error: deA[prefijo] };
    }
    return otro();
  }
  if (code === "MV429") {
    const limite = detalle?.limite;
    const espera = detalle?.reintentar_en;
    if (typeof limite !== "string" || !/^[a-z_]{1,64}$/.test(limite) || typeof espera !== "number" || !Number.isFinite(espera)) return otro();
    return { tipo: "tope", estado: 429, limite, reintentarEnSeg: Math.min(Math.max(Math.ceil(espera), 1), 86_400) };
  }
  if (code === "MV503") {
    const motivo = typeof detalle?.motivo === "string" ? detalle.motivo : "desconocido";
    return { tipo: "pausa", estado: 503, motivo, reintentarEnSeg: motivo === "presion" ? ESPERA_PRESION_SEG : ESPERA_APAGADA_SEG };
  }
  // La RLS (WITH CHECK de la política INSERT): un grupo de anuncios sin ser admin del
  // grupo. Un 42501 que NO es de la RLS (un permiso de función que falta) es un
  // fallo nuestro: no puede verse como "no tienes permiso".
  if (code === "42501") {
    return /row-level security/i.test(mensaje) ? { tipo: "rechazo", estado: 403, error: "not_allowed_in_conversation" } : otro();
  }
  if (SIN_EFECTO.has(code)) return { tipo: "reintentable", estado: 503, reintentarEnSeg: ESPERA_REINTENTABLE_SEG };
  return otro();
}
