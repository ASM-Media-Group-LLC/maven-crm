// ── Cowork por agencia (fase 0, entrega 3b, parte 2) ────────────────────────
//
// cowork-session hace casi todo con service_role, que salta la RLS. Hasta hoy
// bastaba con mandar el id de una sesión, sala, meet o pedido ajeno: muchas
// acciones no miraban de quién era. Esta guarda corre ANTES de cualquier acción
// y resuelve cada id del pedido a su sesión:
//
//   · si alguna sesión no es de la agencia de quien llama, la respuesta es la
//     misma que si no existiera (no se confirma que existe);
//   · si el pedido nombra una sesión y además una sala, un meet o un pedido de
//     OTRA sesión, se rechaza. Esto cierra huecos que existían con una sola
//     agencia: un anfitrión pedía token de cualquier sala por su id
//     (join_room / preview_room / monitor_room), y un pedido de pantalla
//     apuntaba a una sala ajena.
//
// La base hace lo mismo por su lado (20261001213000_cowork_por_agencia: nadie
// queda dentro de una sesión de otra agencia). Las dos capas a propósito: la
// edge contesta bien (404/400 en vez de un 500 del trigger) y la base no
// depende de que la edge no se equivoque.
//
// Tiene que andar ANTES y DESPUÉS de aplicar esa migración: la edge se
// despliega al mergear y la migración se aplica a mano. Por eso se lee la
// sesión con select("*"): con la migración trae tenant_id; sin ella, la agencia
// de la sesión es la de quien la creó (que es lo que la migración guarda).

// deno-lint-ignore no-explicit-any
export type Base = { from(tabla: string): any };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** La agencia de una persona (una persona, una agencia). null = sin agencia. */
export async function agenciaDePersona(db: Base, uid: string): Promise<string | null> {
  const { data, error } = await db.from("tenant_members").select("tenant_id").eq("user_id", uid).limit(1).maybeSingle();
  if (error) throw new Error(`No se pudo leer la agencia de ${uid}: ${error.message}`);
  return data?.tenant_id ?? null;
}

/** La agencia de una sesión. undefined = la sesión no existe. */
export async function agenciaDeSesion(db: Base, sessionId: string): Promise<string | null | undefined> {
  if (!esUuid(sessionId)) return undefined;
  const { data, error } = await db.from("cowork_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la sesión ${sessionId}: ${error.message}`);
  if (!data) return undefined;
  if ("tenant_id" in data) return data.tenant_id ?? null;
  return data.created_by ? await agenciaDePersona(db, data.created_by) : null;
}

// Las acciones que reciben el id de un pedido de pantalla; las demás que
// reciben requestId hablan de un pedido de anfitrión.
const PEDIDOS_DE_PANTALLA = new Set(["approveScreenShare", "claimScreenShareToken"]);
const PEDIDOS_DE_ANFITRION = new Set(["joinOneOnOne", "ackHostRequest", "resolveHostRequest"]);

export interface IdsDelPedido {
  sessionId?: string;
  roomIds: string[];
  meetId?: string;
  pedidoDeAnfitrion?: string;
  pedidoDePantalla?: string;
}

/** Los ids que nombra el cuerpo del pedido. roomId "hub" es el Supervisor Hub
 *  de la sesión (no es una fila de cowork_rooms). */
export function idsDelPedido(action: string, body: Record<string, unknown>): IdsDelPedido {
  const ids: IdsDelPedido = { roomIds: [] };
  if (typeof body.sessionId === "string") ids.sessionId = body.sessionId;
  // En joinSession la sala viene de la URL de invitación (?room=) y la acción ya
  // ignora una que no sea de la sesión (entra sin asignarla): no se rechaza la
  // entrada por un enlace mal armado. La agencia se mira igual, por la sesión.
  if (typeof body.roomId === "string" && body.roomId !== "hub" && action !== "joinSession") ids.roomIds.push(body.roomId);
  if (Array.isArray(body.roomIds)) for (const r of body.roomIds) if (typeof r === "string") ids.roomIds.push(r);
  if (typeof body.meetId === "string") ids.meetId = body.meetId;
  if (typeof body.requestId === "string") {
    if (PEDIDOS_DE_PANTALLA.has(action)) ids.pedidoDePantalla = body.requestId;
    else if (PEDIDOS_DE_ANFITRION.has(action)) ids.pedidoDeAnfitrion = body.requestId;
  }
  return ids;
}

export type Veredicto = { ok: true } | { ok: false; status: number; error: string };

export const NO_ENCONTRADA = "Sesión no encontrada";
export const DE_OTRA_SESION = "Eso no es de esta sesión";

/** ¿Puede quien llama tocar lo que nombra el pedido? */
export async function revisarPedido(db: Base, miAgencia: string | null, action: string, body: Record<string, unknown>): Promise<Veredicto> {
  const ids = idsDelPedido(action, body);
  const nombradas = new Set<string>();   // sesiones a las que pertenece lo que nombra el pedido (salvo sessionId)

  const sesionesDe = async (tabla: string, idsDeTabla: string[]) => {
    const validos = idsDeTabla.filter(esUuid);
    if (!validos.length) return;
    const { data, error } = await db.from(tabla).select("id, session_id").in("id", validos);
    if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
    for (const f of data ?? []) if (f.session_id) nombradas.add(f.session_id);
  };
  await sesionesDe("cowork_rooms", ids.roomIds);
  if (ids.meetId) await sesionesDe("cowork_meets", [ids.meetId]);
  if (ids.pedidoDeAnfitrion) await sesionesDe("cowork_host_requests", [ids.pedidoDeAnfitrion]);
  if (ids.pedidoDePantalla) await sesionesDe("cowork_screenshare_requests", [ids.pedidoDePantalla]);

  if (ids.sessionId !== undefined) {
    if (!esUuid(ids.sessionId)) return { ok: false, status: 404, error: NO_ENCONTRADA };
    if ([...nombradas].some((s) => s !== ids.sessionId)) return { ok: false, status: 400, error: DE_OTRA_SESION };
    nombradas.add(ids.sessionId);
  }

  for (const s of nombradas) {
    const agencia = await agenciaDeSesion(db, s);
    if (agencia === undefined) continue;   // no existe: la acción contesta su propio «no encontrado»
    if (!miAgencia || agencia !== miAgencia) return { ok: false, status: 404, error: NO_ENCONTRADA };
  }
  return { ok: true };
}

/** El tope de una pausa en la tabla, para la agencia de la sesión. Con la
 *  migración hay una fila por (agencia, tipo); sin ella, una por tipo. */
export async function topeDeLaTabla(db: Base, kind: string, agenciaSesion: string | null | undefined): Promise<{ minutos: number; label: string } | null> {
  const { data, error } = await db.from("cowork_break_limits").select("*").eq("kind", kind);
  if (error || !data?.length) return null;
  // deno-lint-ignore no-explicit-any
  const fila = (data as any[]).find((f) => !("tenant_id" in f) || f.tenant_id === agenciaSesion);
  return fila ? { minutos: fila.minutos, label: fila.label } : null;
}
