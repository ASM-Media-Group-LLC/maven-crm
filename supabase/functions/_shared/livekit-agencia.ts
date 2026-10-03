// ── LiveKit, Meet, llamadas y grabaciones por agencia (fase 0, entrega 3c) ───
//
// Las edges de llamadas (livekit-token, livekit-moderate, meet-room, meet-guest,
// recordings) trabajan con service_role, que salta la RLS. Hasta hoy bastaba con
// saber el NOMBRE de una sala para pedir su token, ver quién está adentro,
// moderarla o grabarla, sin importar de qué agencia era (y una cuenta del
// registro público, sin agencia, podía todo eso). Esta guarda corre ANTES de
// cualquier acción y responde una sola pregunta: ¿esta sala es de la agencia de
// quien llama?
//
// La agencia de una sala sale de su NOMBRE, con las mismas reglas que la función
// de la base agencia_de_sala_livekit (20261003120000_meet_livekit_por_agencia,
// la autoridad): el banco supabase/tests/meet_por_agencia.ts corre esta guarda
// contra la base de verdad y comprueba que las dos digan lo mismo, antes y
// después de la migración. Las tres familias de salas que hay en Maven:
//
//   · cowork_…  (cowork-session): los 8 primeros caracteres del id de la sesión.
//     cowork_hub_<s>, cowork_<s>_<n>, cowork_meet_<s>_<m>, cowork_1on1_<s>_<r>.
//   · meet_…    (meet-room): la fila de meet_rooms con ese nombre.
//   · call-<id> (Messenger, useVideoCall/MessengerPage): la conversación <id>;
//     si ya no existe, las filas de calls con esa sala (una sola agencia).
//
// Cualquier otro nombre no es de ninguna agencia y se niega.
//
// Tiene que andar ANTES y DESPUÉS de aplicar la migración: las edges se
// despliegan al mergear y la migración se aplica a mano. Por eso se lee con
// select("*"): con la migración las filas traen tenant_id; sin ella, la agencia
// es la de quien creó la reunión, la sesión o la llamada (que es justo lo que la
// migración guarda al aplicarse, con una sola agencia).

// deno-lint-ignore no-explicit-any
export type Base = { from(tabla: string): any };
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Los mismos patrones que agencia_de_sala_livekit (minúsculas, como los pone Maven). */
const SALA_COWORK = /^cowork_(?:hub_|meet_|1on1_)?([0-9a-f]{8})/;
const SALA_LLAMADA = /^call-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export type Familia = "cowork" | "meet" | "llamada";

/** A qué familia pertenece un nombre de sala. null = a ninguna (se niega). */
export function familiaDeSala(sala: string): Familia | null {
  if (sala.startsWith("cowork_")) return "cowork";
  if (sala.startsWith("meet_")) return "meet";
  if (sala.startsWith("call-")) return "llamada";
  return null;
}

/** Un nombre de sala con forma razonable (lo que viene del cliente). */
export function salaValida(sala: unknown): sala is string {
  return typeof sala === "string" && sala.length > 0 && sala.length <= 200 && sala.trim() === sala;
}

async function leer(q: Promise<{ data: unknown; error: { message: string } | null }>, que: string) {
  const { data, error } = await q;
  if (error) throw new Error(`No se pudo leer ${que}: ${error.message}`);
  return data;
}

/** La agencia de una persona (una persona, una agencia). null = sin agencia. */
export async function agenciaDePersona(db: Base, uid: string | null | undefined): Promise<string | null> {
  if (!esUuid(uid)) return null;
  const f = await leer(db.from("tenant_members").select("tenant_id").eq("user_id", uid).limit(1).maybeSingle(), `la agencia de ${uid}`) as Fila | null;
  return f?.tenant_id ?? null;
}

/** La agencia de cada persona de la lista (las que no tienen, no aparecen). */
async function agenciasDe(db: Base, uids: string[]): Promise<Map<string, string>> {
  const validos = [...new Set(uids.filter(esUuid))];
  const m = new Map<string, string>();
  if (!validos.length) return m;
  const filas = await leer(db.from("tenant_members").select("user_id, tenant_id").in("user_id", validos), "las agencias") as Fila[] | null;
  for (const f of filas ?? []) if (f.tenant_id) m.set(f.user_id, f.tenant_id);
  return m;
}

/** La agencia de una fila que tiene tenant_id (con la migración) o, si todavía
 *  no lo tiene, la de la persona que la creó. */
async function agenciaDeFila(db: Base, fila: Fila, creador: string): Promise<string | null> {
  if ("tenant_id" in fila) return fila.tenant_id ?? null;
  return await agenciaDePersona(db, fila[creador]);
}

/** Si todas las filas dicen la misma agencia, esa; si no hay ninguna o hay
 *  más de una, no se sabe (igual que count(distinct …) = 1 en la base). */
async function unaSolaAgencia(db: Base, filas: Fila[], creador: string): Promise<string | null> {
  if (!filas.length) return null;
  let agencias: (string | null)[];
  if (filas.every((f) => "tenant_id" in f)) {
    agencias = filas.map((f) => f.tenant_id ?? null);
  } else {
    const de = await agenciasDe(db, filas.map((f) => f[creador]));
    agencias = filas.map((f) => de.get(f[creador]) ?? null);
  }
  const distintas = new Set(agencias.filter((a): a is string => !!a));
  return distintas.size === 1 ? [...distintas][0] : null;
}

/** La agencia de una sala de LiveKit por su nombre. null = no se sabe (se niega).
 *  Espejo de agencia_de_sala_livekit (la base es la autoridad). */
export async function agenciaDeSala(db: Base, sala: string): Promise<string | null> {
  if (!salaValida(sala)) return null;

  const cowork = SALA_COWORK.exec(sala);
  if (sala.startsWith("cowork_")) {
    if (!cowork) return null;
    // Los uuid que empiezan con esos 8 caracteres: el rango [p-0000…, p-ffff…].
    const p = cowork[1];
    const filas = await leer(
      db.from("cowork_sessions").select("*").gte("id", `${p}-0000-0000-0000-000000000000`).lte("id", `${p}-ffff-ffff-ffff-ffffffffffff`),
      `las sesiones de ${sala}`,
    ) as Fila[] | null;
    return await unaSolaAgencia(db, filas ?? [], "created_by");
  }

  if (sala.startsWith("meet_")) {
    const f = await leer(db.from("meet_rooms").select("*").eq("livekit_room_name", sala).maybeSingle(), `la reunión ${sala}`) as Fila | null;
    return f ? await agenciaDeFila(db, f, "created_by") : null;
  }

  if (sala.startsWith("call-")) {
    const llamada = SALA_LLAMADA.exec(sala);
    if (llamada) {
      const c = await leer(db.from("chat_conversations").select("*").eq("id", llamada[1]).maybeSingle(), `la conversación de ${sala}`) as Fila | null;
      if (c) {
        const a = await agenciaDeFila(db, c, "created_by");
        if (a) return a;
      }
    }
    // La conversación ya no existe (o la sala es de antes): las llamadas con esa sala.
    const filas = await leer(db.from("calls").select("*").eq("room_id", sala), `las llamadas de ${sala}`) as Fila[] | null;
    return await unaSolaAgencia(db, filas ?? [], "caller_id");
  }

  return null;
}

export type Veredicto =
  | { ok: true; familia: Familia; agencia: string }
  | { ok: false; status: number; error: string };

export const SIN_AGENCIA = "Tu cuenta no es de ninguna agencia";
export const SALA_NO_ENCONTRADA = "Sala no encontrada";
export const SALA_INVALIDA = "Sala inválida";

/** ¿Puede quien llama tocar esta sala? Una sala de otra agencia contesta lo
 *  mismo que una que no existe (no se confirma que exista). */
export async function revisarSala(db: Base, miAgencia: string | null, sala: unknown): Promise<Veredicto> {
  if (!salaValida(sala)) return { ok: false, status: 400, error: SALA_INVALIDA };
  if (!miAgencia) return { ok: false, status: 403, error: SIN_AGENCIA };
  const familia = familiaDeSala(sala);
  if (!familia) return { ok: false, status: 404, error: SALA_NO_ENCONTRADA };
  const agencia = await agenciaDeSala(db, sala);
  if (!agencia || agencia !== miAgencia) return { ok: false, status: 404, error: SALA_NO_ENCONTRADA };
  return { ok: true, familia, agencia };
}

/** La agencia de una reunión de Meet (fila de meet_rooms leída con select("*")). */
export async function agenciaDeReunion(db: Base, reunion: Fila): Promise<string | null> {
  return await agenciaDeFila(db, reunion, "created_by");
}

/** La agencia de una grabación: su tenant_id con la migración; sin ella, la de
 *  su sala, y si la sala ya no se puede resolver, la de quien grabó. */
export async function agenciaDeGrabacion(db: Base, grabacionId: string): Promise<string | null | undefined> {
  if (!esUuid(grabacionId)) return undefined;
  const f = await leer(db.from("meeting_recordings").select("*").eq("id", grabacionId).maybeSingle(), `la grabación ${grabacionId}`) as Fila | null;
  if (!f) return undefined;
  if ("tenant_id" in f) return f.tenant_id ?? null;
  return (await agenciaDeSala(db, f.room_name)) ?? (await agenciaDePersona(db, f.started_by));
}

/** De una lista de personas, las que son de esta agencia (sin repetir). */
export async function deLaAgencia(db: Base, agencia: string, uids: unknown[]): Promise<string[]> {
  const pedidos = [...new Set(uids.filter(esUuid).map((u) => u.toLowerCase()))].slice(0, 200);
  const de = await agenciasDe(db, pedidos);
  return pedidos.filter((u) => de.get(u) === agencia);
}

/** ¿Está esta persona en la sala? Las identidades de Maven son `<uuid>`,
 *  `<uuid>_<sufijo>` (livekit-token) o `<uuid>__<algo>` (cowork-session). */
export function estaEnLaSala(identidades: string[], uid: string): boolean {
  return identidades.some((i) => i === uid || i.startsWith(`${uid}_`));
}

/** A quiénes se comparte una grabación al pararla. Elige SOLO quien la inició
 *  (antes, cualquiera que la parara se agregaba a sí mismo o a cualquiera); y
 *  solo gente de la agencia de la grabación. Quien grabó queda siempre. */
export function destinatariosAlParar(opts: {
  quienPara: string;
  quienGrabo: string;
  pedidos: string[];
  deLaAgencia: string[];
}): { destinatarios: string[]; ignorados: number } {
  const { quienPara, quienGrabo, pedidos, deLaAgencia } = opts;
  if (quienPara !== quienGrabo) return { destinatarios: [quienGrabo], ignorados: pedidos.length };
  const permitidos = new Set(deLaAgencia);
  const validos = [...new Set(pedidos)].filter((u) => permitidos.has(u));
  return { destinatarios: [...new Set([...validos, quienGrabo])], ignorados: new Set(pedidos).size - validos.length };
}
