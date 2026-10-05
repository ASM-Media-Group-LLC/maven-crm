// creator-video — la lógica, sin red ni Deno.serve, para poder probarla con
// dobles (logica.test.ts). index.ts le pasa los puertos de verdad.
//
// QUIÉN PUEDE QUÉ (desde el 05/10/2026; antes bastaba con tener sesión):
//   · Ver (view_url): quien VE a esa creadora (se lee como la persona, con su
//     JWT: si la RLS de creators no la devuelve, 404) y además tiene el módulo
//     Creadores (has_permission, el mismo que pide la tabla de videos).
//   · Subir, confirmar y borrar: quien puede EDITAR a esa creadora: la política
//     de UPDATE de creators, la misma que hoy deja guardar la ficha (la pregunta
//     la RPC creator_video_puede_editar, como la persona), más el módulo.
// Todo pasa por puedeVerVideosDe / puedeEditarVideoDe: cuando exista el portal
// de creadoras, «es la cuenta de esa creadora» se suma AHÍ y en ningún otro lado.
//
// view_url y delete NUNCA usan el creator_id del cuerpo: el video se busca como
// la persona y la creadora es la de esa fila.

export interface FilaVideo {
  id: string;
  creator_id: string;
  storage_key: string;
}

/** Lo que se lee con el JWT de quien llama: la RLS decide. */
export interface ComoPersona {
  /** ¿La RLS de creators le devuelve esa creadora? */
  veCreadora(creatorId: string): Promise<boolean>;
  /** has_permission(yo, 'Creadores'): el módulo. */
  tieneModuloCreadores(): Promise<boolean>;
  /** RPC creator_video_puede_editar: la política de UPDATE de creators. */
  puedeEditarCreadora(creatorId: string): Promise<boolean>;
  /** El video, si la RLS de creator_onboarding_videos se lo deja ver. */
  video(videoId: string): Promise<FilaVideo | null>;
}

export interface Puertos {
  /** El id de la cuenta del token, o null si no es una sesión válida. */
  persona(token: string): Promise<{ id: string } | null>;
  comoPersona(token: string, userId: string): ComoPersona;
  // Con service_role, SOLO después de las comprobaciones de arriba:
  contarVideos(creatorId: string): Promise<number>;
  insertarVideo(fila: {
    creator_id: string;
    storage_key: string;
    titulo: string | null;
    size_bytes: number | null;
    uploaded_by: string;
  }): Promise<{ error: string | null }>;
  borrarFilaVideo(videoId: string): Promise<void>;
  firmar(metodo: "PUT" | "GET", llave: string, segundos: number): Promise<string>;
  borrarObjeto(llave: string): Promise<void>;
  /** Para crypto.randomUUID en los tests. */
  uuid?: () => string;
}

export type Veredicto = "ok" | "no_existe" | "sin_permiso";

/** ¿Puede ver los videos de esta creadora? Punto único. */
export async function puedeVerVideosDe(cp: ComoPersona, creatorId: string): Promise<Veredicto> {
  // PORTAL DE CREADORAS (futuro): aquí entra «o es la cuenta de esa creadora»,
  // antes de exigir el módulo (la creadora no tiene el módulo Creadores).
  if (!(await cp.veCreadora(creatorId))) return "no_existe";
  if (!(await cp.tieneModuloCreadores())) return "sin_permiso";
  return "ok";
}

/** ¿Puede subir, confirmar o borrar videos de esta creadora? Punto único. */
export async function puedeEditarVideoDe(cp: ComoPersona, creatorId: string): Promise<Veredicto> {
  // PORTAL DE CREADORAS (futuro): aquí entra «o es la cuenta de esa creadora»
  // (p. ej. cp.esCuentaDe(creatorId)), antes de exigir el módulo y la edición.
  if (!(await cp.veCreadora(creatorId))) return "no_existe";
  if (!(await cp.tieneModuloCreadores())) return "sin_permiso";
  if (!(await cp.puedeEditarCreadora(creatorId))) return "sin_permiso";
  return "ok";
}

/** Solo video, y solo lo que un <video> sabe reproducir. Un .exe con nombre
 *  de video no se sube: la lista es blanca, no negra. */
export const TIPOS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Tope duro. Un onboarding largo a 1080p ronda 1 GB; 2 GB deja aire sin
 *  volverlo un depósito de archivos. */
export const TOPE_BYTES = 2 * 1024 * 1024 * 1024;
export const TOPE_VIDEOS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** La llave que firma upload_url: «<creator_id>/<uuid>.<ext>», nada más. */
export function llaveValida(creatorId: string, key: unknown): key is string {
  if (typeof key !== "string") return false;
  const m = key.match(/^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(mp4|mov|webm)$/i);
  return !!m && m[1].toLowerCase() === creatorId.toLowerCase() && UUID.test(m[2]);
}

export interface Respuesta {
  status: number;
  body: Record<string, unknown>;
}
const r = (status: number, body: Record<string, unknown>): Respuesta => ({ status, body });

const NO_EXISTE_CREADORA = "Esa creadora no existe o no tienes acceso a ella";
const SIN_PERMISO_VER = "No tienes permiso para ver los videos de esta creadora";
const SIN_PERMISO_EDITAR = "No tienes permiso para cambiar los videos de esta creadora";

function negar(v: Veredicto, sinPermiso: string): Respuesta | null {
  if (v === "no_existe") return r(404, { error: NO_EXISTE_CREADORA });
  if (v === "sin_permiso") return r(403, { error: sinPermiso });
  return null;
}

/** Un pedido ya autenticado: token (sin «Bearer ») y el cuerpo en JSON. */
export async function manejar(token: string, body: Record<string, unknown>, p: Puertos): Promise<Respuesta> {
  const yo = token ? await p.persona(token) : null;
  if (!yo) return r(401, { error: "no autenticado" });
  const cp = p.comoPersona(token, yo.id);
  const action = body.action;

  // ── Ver y borrar: el video manda, no el cuerpo ─────────────────────────
  if (action === "view_url" || action === "delete") {
    const videoId = body.video_id;
    if (!esUuid(videoId)) return r(400, { error: "falta video_id" });
    const fila = await cp.video(videoId);
    if (!fila) return r(404, { error: "ese video no existe" });

    const veredicto = action === "view_url"
      ? await puedeVerVideosDe(cp, fila.creator_id)
      : await puedeEditarVideoDe(cp, fila.creator_id);
    const no = negar(veredicto, action === "view_url" ? SIN_PERMISO_VER : SIN_PERMISO_EDITAR);
    if (no) return no;
    // La llave tiene que ser de la creadora de la fila (las filas las escribe
    // solo esta edge, pero no se firma nada de otra carpeta).
    if (!fila.storage_key.startsWith(`${fila.creator_id}/`)) {
      return r(409, { error: "la llave de ese video no es de su creadora" });
    }

    if (action === "view_url") {
      // 2 h: alcanza para mirarlo entero sin que el link sirva para compartir.
      return r(200, { url: await p.firmar("GET", fila.storage_key, 7200) });
    }
    // Primero la fila y después el objeto: al revés, si falla el borrado en
    // R2 la ficha queda apuntando a un video que ya no se puede reproducir.
    await p.borrarFilaVideo(fila.id);
    try {
      await p.borrarObjeto(fila.storage_key);
    } catch { /* queda huérfano en R2; la ficha ya está limpia */ }
    return r(200, { ok: true });
  }

  if (action !== "upload_url" && action !== "confirm") {
    return r(400, { error: `acción desconocida: ${String(action)}` });
  }

  // ── Subir y confirmar: hay que poder editar a la creadora ──────────────
  const creatorId = body.creator_id;
  if (!esUuid(creatorId)) return r(400, { error: "falta creator_id" });
  const no = negar(await puedeEditarVideoDe(cp, creatorId), SIN_PERMISO_EDITAR);
  if (no) return no;

  if (action === "upload_url") {
    const contentType = typeof body.content_type === "string" ? body.content_type : "";
    const ext = TIPOS[contentType];
    if (!ext) return r(400, { error: "formato no admitido: sube un MP4, MOV o WEBM" });
    const size = body.size_bytes;
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      return r(400, { error: "falta el tamaño del archivo" });
    }
    if (size > TOPE_BYTES) return r(413, { error: "el video supera el límite de 2 GB" });

    // Se corta AQUÍ si ya hay 3, antes de firmar: dejar subir 800 MB para
    // rechazarlo al confirmar sería cruel.
    if ((await p.contarVideos(creatorId)) >= TOPE_VIDEOS) {
      return r(409, { error: "Esta creadora ya tiene 3 videos. Borra uno antes de subir otro." });
    }
    // Llave nueva SIEMPRE: si se reusara una, el navegador y el CDN seguirían
    // mostrando el anterior desde su caché.
    const llave = `${creatorId}/${(p.uuid ?? (() => crypto.randomUUID()))()}.${ext}`;
    return r(200, { url: await p.firmar("PUT", llave, 3600), key: llave });
  }

  // confirm — después de que el PUT terminó.
  // La llave TIENE que ser una de las que firma upload_url para esta creadora:
  // si no, alguien podría colgarle a una creadora el video de otra.
  if (!llaveValida(creatorId, body.key)) return r(400, { error: "esa llave no es de esta creadora" });
  const size = typeof body.size_bytes === "number" && Number.isFinite(body.size_bytes) && body.size_bytes > 0
    ? Math.round(body.size_bytes)
    : null;
  const titulo = typeof body.titulo === "string" && body.titulo.trim() ? body.titulo.trim().slice(0, 200) : null;
  const { error } = await p.insertarVideo({
    creator_id: creatorId,
    storage_key: body.key,
    titulo,
    size_bytes: size,
    uploaded_by: yo.id,
  });
  // El trigger del tope (y la llave única) llegan hasta aquí con su propio
  // mensaje: se pasa tal cual, que es más útil que un «error al guardar».
  if (error) return r(409, { error });
  return r(200, { ok: true });
}
