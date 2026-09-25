// Piezas PURAS del Messenger por API: cursores, saneado de mensajes, tipo de cada
// mensaje y adjuntos. Sin base, sin red, sin clientes y sin imports: el test lo
// verifica, porque es el único archivo del que recursos-como-usuario.ts puede
// importar valores.
//
// Las reglas copian las de la pantalla del Messenger para que el API muestre lo
// mismo que la app:
//  * el tipo de mensaje, de MessageBubble.tsx (isImage, isGif, isVideo, nota de voz);
//  * quién ve la lista de miembros, de puedeVerLaListaDeMiembros (pages/messenger/utils.ts);
//  * qué conversación directa se esconde, de useChat.ts (la vacía, para quien no la creó).

/** El rol de admin DEL GRUPO (chat_participants.role), no de Maven. Es la única vez
 *  que la palabra aparece en lo como_usuario, y el test lo controla. */
export const ROL_ADMIN_DE_GRUPO = "admin";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope de página: con la RLS por fila, cada mensaje cuesta ~5-6 bloques de lectura;
 *  100 mantiene cualquier pedido por debajo de ~1.100 (medido en prod el 25/09). */
export const PAGINA_MAX = 100;

export function limiteDePagina(valor: string | undefined, porDefecto: number): number | null {
  if (valor === undefined || valor === "") return porDefecto;
  if (!/^\d{1,4}$/.test(valor)) return null;
  const n = Number(valor);
  if (n < 1 || n > PAGINA_MAX) return null;
  return n;
}

export function offsetDePagina(valor: string | undefined): number | null {
  if (valor === undefined || valor === "") return 0;
  if (!/^\d{1,6}$/.test(valor)) return null;
  return Number(valor);
}

// ─── Cursor ────────────────────────────────────────────────────────────────────
// Un cursor es (created_at, id) EXACTOS: el created_at como texto tal cual lo da la
// base (con microsegundos). Nunca pasa por un Date de JS, que lo recorta a
// milisegundos y hace saltear o repetir mensajes del mismo instante.

export type Cursor = { t: string; i: string };

const MARCA_DE_TIEMPO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

function aBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function codificarCursor(c: Cursor): string {
  return aBase64Url(JSON.stringify({ t: c.t, i: c.i }));
}

/** null si el cursor está roto o fue alterado: el llamador responde 400. */
export function decodificarCursor(s: string): Cursor | null {
  const texto = deBase64Url(s);
  if (texto === null) return null;
  let o: unknown;
  try {
    o = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const { t, i } = o as Record<string, unknown>;
  if (typeof t !== "string" || typeof i !== "string") return null;
  if (!MARCA_DE_TIEMPO.test(t) || !UUID.test(i)) return null;
  return { t, i };
}

/** Clave para ordenar marcas de tiempo de la base SIN perder los microsegundos
 *  (Postgres saca la fracción sin ceros al final: .12345 vs .1235). Todas salen en
 *  la misma zona (+00:00): se compara fecha y fracción rellenada a 6 dígitos. */
export function claveDeTiempo(t: string): string {
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(.*)$/);
  if (!m) return t;
  return `${m[1]}T${m[2]}.${(m[3] ?? "").padEnd(6, "0")}`;
}

export function compararMensajes(a: { created_at: string; id: string }, b: { created_at: string; id: string }): number {
  const ka = claveDeTiempo(a.created_at), kb = claveDeTiempo(b.created_at);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Filtro PostgREST "después del cursor" (orden ascendente por created_at, id). */
export function filtroDespues(c: Cursor): string {
  return `created_at.gt."${c.t}",and(created_at.eq."${c.t}",id.gt.${c.i})`;
}

/** Filtro PostgREST "antes del cursor" (orden descendente por created_at, id). */
export function filtroAntes(c: Cursor): string {
  return `created_at.lt."${c.t}",and(created_at.eq."${c.t}",id.lt.${c.i})`;
}

// ─── Mensajes ──────────────────────────────────────────────────────────────────

export type FilaDeMensaje = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: string;
  file_url: string | null;
  file_name: string | null;
  reply_to_id: string | null;
  album_id: string | null;
  is_thread_reply: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  content_rich?: unknown;
};

export type Persona = { id: string; name: string | null; avatar_url: string | null };

export type Tipo = "text" | "system" | "image" | "gif" | "video" | "voice_note" | "audio" | "file";

/** El mismo criterio que MessageBubble.tsx, en el mismo orden. */
export function tipoDeMensaje(m: Pick<FilaDeMensaje, "type" | "file_url" | "file_name">): Tipo {
  if (m.type === "system") return "system";
  const url = m.file_url ?? "";
  const nombre = (m.file_name ?? "").toLowerCase();
  if (!url) return "text";
  if (m.type === "image") return "image";
  if (/\.gif(\?|$)/i.test(url) || nombre.startsWith("gif") || /(giphy|tenor)\.com/i.test(url)) return "gif";
  const esNotaDeVoz = m.type === "file" && nombre.startsWith("voice-note");
  if (esNotaDeVoz) return "voice_note";
  // Como en la pantalla: un audio que no es nota de voz se dibuja como audio solo si
  // es un archivo; y nunca como video (los .webm de audio también matchean video).
  const esAudio = /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i.test(url);
  if (esAudio) return m.type === "file" ? "audio" : "file";
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  return "file";
}

/** De dónde sale el adjunto. Solo https; lo demás no se entrega. Los archivos de
 *  Maven viven en el bucket PÚBLICO chat-files: el link es permanente y funciona
 *  sin la llave (lo dicen los docs). */
export function adjunto(fileUrl: string | null, fileName: string | null, baseMaven: string) {
  if (!fileUrl || !/^https:\/\//i.test(fileUrl)) return null;
  const prefijo = `${baseMaven.replace(/\/+$/, "")}/storage/v1/object/public/chat-files/`;
  const deMaven = fileUrl.startsWith(prefijo);
  let ruta: string | null = null;
  if (deMaven) {
    try {
      ruta = decodeURIComponent(fileUrl.slice(prefijo.length).split("?")[0]);
    } catch {
      ruta = null;
    }
  }
  return { url: fileUrl, name: fileName ?? null, hosted_by: deMaven ? "maven" : "external", storage_path: ruta };
}

/** El mensaje tal como sale por el API. ⚠️ Si está borrado, texto, texto rico y
 *  adjunto van en null SIEMPRE, aunque la fila todavía los tenga: el borrado de la
 *  app deja content_rich (39 filas el 25/09) y hay 8 viejas con archivo. */
export function mensajeParaApi(
  m: FilaDeMensaje,
  remitente: Persona | undefined,
  opciones: { conRico: boolean; baseMaven: string },
) {
  const borrado = m.is_deleted === true;
  return {
    object: "message",
    id: m.id,
    conversation_id: m.conversation_id,
    sender: { id: m.sender_id, name: remitente?.name ?? null, avatar_url: remitente?.avatar_url ?? null },
    kind: borrado ? null : tipoDeMensaje(m),
    text: borrado ? null : (m.content ?? null),
    ...(opciones.conRico ? { rich: borrado ? null : (m.content_rich ?? null) } : {}),
    attachment: borrado ? null : adjunto(m.file_url, m.file_name, opciones.baseMaven),
    album_id: m.album_id ?? null,
    reply_to_id: m.reply_to_id ?? null,
    is_thread_reply: m.is_thread_reply === true,
    is_edited: m.is_edited === true,
    is_deleted: borrado,
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

/** Vista previa para la bandeja: 200 caracteres, nada si está borrado. */
export function vistaPrevia(m: FilaDeMensaje) {
  const borrado = m.is_deleted === true;
  const texto = borrado ? null : (m.content ?? null);
  return {
    id: m.id,
    sender_id: m.sender_id,
    kind: borrado ? null : tipoDeMensaje(m),
    text_preview: texto === null ? null : texto.slice(0, 200),
    is_deleted: borrado,
    is_thread_reply: m.is_thread_reply === true,
    created_at: m.created_at,
  };
}

/** ¿Puede ver quiénes están en el grupo? Copia de puedeVerLaListaDeMiembros. */
export function puedeVerMiembros(tipo: string, visibilidad: string | null, miRol: string | null): boolean {
  if (tipo !== "group") return true;
  if (visibilidad !== "admins") return true;
  return miRol === ROL_ADMIN_DE_GRUPO;
}

/** ¿Se muestra en la bandeja? La app esconde la conversación directa vacía a quien
 *  no la creó (hasta que alguien escribe). */
export function visibleEnBandeja(tipo: string, creadaPor: string, persona: string, tieneMensajes: boolean): boolean {
  return !(tipo === "direct" && creadaPor !== persona && !tieneMensajes);
}

/** Orden de la bandeja: última actividad, desc; empate por id para que sea estable. */
export function compararPorActividad(
  a: { last_activity_at: string; id: string },
  b: { last_activity_at: string; id: string },
): number {
  if (a.last_activity_at !== b.last_activity_at) {
    // Mismo formato de texto que da la base: ISO con zona. Comparar como fecha.
    const d = Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at);
    if (d !== 0 && !Number.isNaN(d)) return d;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Parte una lista en tandas (URLs de PostgREST con `in.(...)` no pueden ser eternas). */
export function enTandas<T>(xs: T[], tamano = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += tamano) out.push(xs.slice(i, i + tamano));
  return out;
}
