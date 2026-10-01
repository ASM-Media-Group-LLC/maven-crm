// Recursos del API pública que se sirven COMO la persona de la llave.
//
// ⚠️ LA REGLA DE ESTE ARCHIVO: aquí no existe service_role. Cada handler recibe
// SOLO el cliente con la sesión de esa persona (./como-usuario.ts) y todo lo que
// consulta pasa por la RLS y los triggers de la base, igual que en la app. Si un
// dato no se puede leer así, no se sirve desde aquí. El test lo verifica leyendo
// este archivo: solo puede importar TIPOS, cada handler tiene que estar definido
// aquí mismo, y no puede aparecer nada con "admin", service_role ni createClient.
//
// Cada recurso de aquí está declarado `como_usuario` en ./aislamiento.ts, y el test
// exige que las dos listas coincidan.
//
// Todo entra por `servirComoUsuario`, que ANTES de cualquier handler verifica, en
// este orden y sin tocar la base: (1) que el método sea uno que el recurso acepta;
// (2) que la llave tenga el scope de lectura del recurso; (3) que la ruta exista con
// ese método y, si escribe, que la llave tenga además el scope de escritura; (4) que
// una escritura traiga sus ids, su cuerpo y su Idempotency-Key en regla. Recién ahí,
// (5) que la base vea la sesión como alguien de la agencia de la llave. Un handler
// nuevo no puede olvidarse de ninguna porque no le tocan a él.
//
// ESCRIBIR (diseño de la escritura §1 y §5.4). Los handlers de escritura llaman a UNA
// RPC de la base cada uno (api_messenger_enviar, _abrir_directo, _editar, _borrar),
// todas SECURITY INVOKER: la RLS y los triggers se aplican como en la app, y la base
// valida la key del claim `mvk` en cada escritura, cobra los topes y pone la marca
// «vino por API». Aquí no se escribe nada con .insert/.update/.delete (el test lo
// verifica) y el error de la base se traduce con la tabla de ./escritura-formato.ts.
//
// IDIOMA. Todo `mensaje` (lo que ve el cliente) sale de ./mensajes.ts en el idioma de
// `ctx.idioma`. `detalle` va solo al log y queda en español.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
// Los ÚNICOS imports de valores permitidos: piezas puras, sin base ni red (el test
// lo verifica en los tres archivos).
import {
  compararMensajes,
  compararPorActividad,
  type Cursor,
  codificarCursor,
  decodificarCursor,
  enTandas,
  type FilaDeMensaje,
  filtroDespues,
  limiteDePagina,
  mensajeParaApi,
  offsetDePagina,
  type Persona,
  puedeVerMiembros,
  UUID,
  visibleEnBandeja,
  vistaPrevia,
} from "./messenger-formato.ts";
import {
  clasificarErrorDeEscritura,
  type ErrorDeEscritura,
  filaDesdeRpc,
  leerEscritura,
  type Metodo,
  type ObjetoJson,
  type ProblemaDeCuerpo,
  scopesDeLaRuta,
} from "./escritura-formato.ts";
import { type ClaveSinVars, type Idioma, msg } from "./mensajes.ts";

export type Contexto = {
  /** De qué agencia es la llave (api_keys.tenant_id). */
  agenciaDeLaLlave: string;
  /** Como quién actúa (api_keys.acts_as_user_id). */
  actuaComo: string;
  /** Los scopes de la llave. */
  scopes: string[];
  /** El camino después del recurso: /messenger/conversations/X → ["conversations", "X"]. */
  ruta: string[];
  /** Los parámetros de la URL, como texto. Cada handler valida los suyos. */
  consulta: Record<string, string>;
  /** Lo que se sabe de la llave misma. */
  llave: { conWhitelist: boolean; venceEl: string | null };
  /** La URL del proyecto: para reconocer los adjuntos guardados en Maven. */
  baseDeArchivos: string;
  /** Lo que queda del cupo de esta hora, para devolverlo en el cuerpo. */
  cupo: { limite: number; restantes: number; reinicio: string };
  /** En qué idioma van los `mensaje` (Accept-Language del pedido; ver ./mensajes.ts). */
  idioma: Idioma;
  /** El método HTTP del pedido. */
  metodo: Metodo;
  /** El cuerpo de un POST/PATCH ya leído (un objeto JSON); null en GET y DELETE. */
  cuerpo: ObjetoJson | null;
  /** La cabecera Idempotency-Key, ya validada; null si no vino. */
  idempotencia: string | null;
};

/** Un rechazo: el código de máquina y el texto para personas, en el idioma del pedido. */
type Rechazo = { ok: false; error: string; mensaje: string };

export type Resultado =
  | { ok: true; estado: 200 | 201; cuerpo: unknown }
  /** Culpa del que llama (400), la key (401), sin permiso (403), no existe o no la ve
   *  (404), choca con lo que ya hay (409) o la base no lo acepta (422). */
  | (Rechazo & { estado: 400 | 401 | 403 | 404 | 409 | 422 })
  /** La ruta existe, con otros métodos (van en la cabecera Allow). */
  | (Rechazo & { estado: 405; permitidos: Metodo[] })
  /** Un tope: cuál y cuándo reintentar (Retry-After). */
  | (Rechazo & { estado: 429; limite: string; reintentarEnSeg: number })
  /** La escritura está apagada o en pausa, falló sin dejar nada, o no se sabe si se
   *  hizo: el cliente ve cuál, y cuándo reintentar (Retry-After). */
  | (Rechazo & { estado: 503; reintentarEnSeg: number })
  /** Un fallo NUESTRO: se loguea `detalle` y el cliente ve un 503 genérico. */
  | { ok: false; estado: 503; detalle: string };

export type Handler = (yo: SupabaseClient, ctx: Contexto) => Promise<Resultado>;

/** GET /me — quién es esta llave. Sirve para probar en vivo que la sesión fabricada
 *  funciona: `servirComoUsuario` ya verificó que la base la ve como alguien de la
 *  agencia de la llave. */
export const servirMe: Handler = async (yo, ctx) => {
  const sub = ctx.ruta[0] ?? null;
  if (sub) return { ok: false, estado: 404, error: "not_found", mensaje: msg(ctx.idioma, "me_sub_recurso_desconocido", { sub }) };

  // api_mi_llave: null sin error para toda key sin messenger:write (así /me anda para
  // todas); con write, el nombre visible, los topes y lo que queda. Lee el claim `mvk`
  // del token: también prueba de punta a punta que la sesión es la de ESTA key.
  const [perfil, llave] = await Promise.all([
    yo.from("profiles").select("id, full_name, avatar_url").eq("id", ctx.actuaComo).maybeSingle(),
    yo.rpc("api_mi_llave"),
  ]);
  if (perfil.error) return { ok: false, estado: 503, detalle: `perfil: ${perfil.error.message}` };
  const p = perfil.data as { id: string; full_name: string | null; avatar_url: string | null } | null;
  if (!p) return { ok: false, estado: 503, detalle: "la sesión fabricada no ve el perfil de su propia persona" };
  if (llave.error) return { ok: false, estado: 503, detalle: `api_mi_llave: ${llave.error.message}` };
  const escritura = escrituraDeLaLlave(llave.data);
  if (escritura === undefined) return { ok: false, estado: 503, detalle: "api_mi_llave devolvió otra forma" };

  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "me",
      agency_id: ctx.agenciaDeLaLlave,
      // Todo lo que esta llave haga con permisos de usuario lo hace a nombre de esta
      // persona, con lo que esta persona puede ver y hacer en Maven. No cambia nunca.
      acts_as: { id: p.id, name: p.full_name ?? null, avatar_url: p.avatar_url ?? null },
      rate_limit: {
        limit_per_hour: ctx.cupo.limite,
        remaining: ctx.cupo.restantes,
        resets_at: ctx.cupo.reinicio,
      },
      // null para toda key que no escribe en el Messenger.
      messenger_write: escritura,
    },
  };
};

/** Lo que devuelve api_mi_llave: null, o {display_name, limits, remaining}. undefined
 *  si es otra cosa (un contrato roto: 503). */
function escrituraDeLaLlave(v: unknown) {
  if (v === null) return null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.display_name !== "string" && o.display_name !== null) return undefined;
  const objetoONulo = (x: unknown) => x === null || (typeof x === "object" && !Array.isArray(x));
  if (!objetoONulo(o.limits) || !objetoONulo(o.remaining)) return undefined;
  return { display_name: o.display_name, limits: o.limits, remaining: o.remaining };
}

// ─── Messenger (solo lectura) ─────────────────────────────────────────────────
//
// Todo con `yo`: la RLS del Messenger es 100% por participación, así que la llave
// ve exactamente las conversaciones de su persona, como en /messenger. Nada de
// escrituras: leer NO marca como leído ni como entregado (la app sí lo hace).
//
// ⚠️ CARGA. Con la RLS, cada fila de chat_messages cuesta una llamada a
// is_chat_participant. Una consulta a chat_messages SIN conversation_id recorre los
// mensajes de TODA la plataforma (82k+ bloques, hasta 1,3 s medido el 25/09). Por
// eso toda consulta a chat_messages va con la lista explícita de conversaciones,
// las páginas topan en 100 y el feed mira como mucho una hora por pedido.

// api_key_id y api_display_name: la marca «vino por API» (migración 20261001200000).
// ⚠️ Sin esa migración aplicada, toda lectura de mensajes da 503 (columna que no existe).
const COLS_MENSAJE =
  "id, conversation_id, sender_id, content, type, file_url, file_name, reply_to_id, album_id, " +
  "is_thread_reply, is_edited, is_deleted, created_at, updated_at, api_key_id, api_display_name";
const COLS_MENSAJE_RICO = COLS_MENSAJE + ", content_rich";
const COLS_CONVERSACION =
  "id, type, name, description, avatar_url, created_by, created_at, updated_at, " +
  "msg_permission, members_visibility, info_permission, add_permission, require_approval";
const COLS_BANDEJA = "id, type, name, avatar_url, created_by, created_at, updated_at";
const COLS_MI_PARTICIPACION = "conversation_id, role, joined_at, last_read_at, is_muted, notifications_mode";

/** Nadie tiene hoy más de 71 conversaciones; pasado esto se corta en vez de armar
 *  una bandeja carísima. */
const TOPE_CONVERSACIONES = 500;
/** El detalle del 503 cuando se pasa el tope. Exportado para que el despachador de
 *  webhooks lo reconozca como una falla PERMANENTE (sin compararlo con un texto
 *  copiado): con más conversaciones que esto, reintentar no lo arregla. */
export const DETALLE_TOPE_CONVERSACIONES = `más de ${TOPE_CONVERSACIONES} conversaciones`;
/** Grupos: tope de miembros que se devuelven (el mayor tiene 40). */
const TOPE_MIEMBROS = 200;
/** El feed mira como mucho esta ventana por pedido, por viejo que sea el cursor. */
const VENTANA_FEED_MS = 60 * 60 * 1000;
/** Margen para no adelantar el cursor por encima de un mensaje que todavía no se
 *  terminó de guardar (created_at es el inicio de la transacción). */
const ASENTAMIENTO_MS = 10 * 1000;
const FEED_SINCE_MAX_MS = 72 * 60 * 60 * 1000;
const FEED_POR_DEFECTO_MS = 15 * 60 * 1000;
const UUID_MAXIMO = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const UUID_MINIMO = "00000000-0000-0000-0000-000000000000";

const malPedido = (idioma: Idioma, clave: ClaveSinVars): Resultado => ({
  ok: false, estado: 400, error: "bad_request", mensaje: msg(idioma, clave),
});
const noEncontrada = (idioma: Idioma): Resultado => ({
  ok: false, estado: 404, error: "not_found", mensaje: msg(idioma, "conversacion_no_encontrada"),
});
const falla = (detalle: string): Resultado => ({ ok: false, estado: 503, detalle });

/** Nombre y foto de cada persona, SOLO para ids que salieron de filas que la
 *  sesión pudo leer (nunca ids que manda el cliente). */
async function personas(yo: SupabaseClient, ids: string[]): Promise<Map<string, Persona> | null> {
  const mapa = new Map<string, Persona>();
  for (const tanda of enTandas([...new Set(ids)])) {
    const { data, error } = await yo.from("profiles").select("id, full_name, avatar_url").in("id", tanda);
    if (error) return null;
    for (const p of (data ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
      mapa.set(p.id, { id: p.id, name: p.full_name ?? null, avatar_url: p.avatar_url ?? null });
    }
  }
  return mapa;
}

type MiParticipacion = {
  conversation_id: string; role: string; joined_at: string; last_read_at: string | null;
  is_muted: boolean; notifications_mode: string;
};

const yoEnLaConversacion = (p: MiParticipacion) => ({
  role: p.role, joined_at: p.joined_at, last_read_at: p.last_read_at,
  is_muted: p.is_muted, notifications_mode: p.notifications_mode,
});

async function misParticipaciones(yo: SupabaseClient, ctx: Contexto) {
  const { data, error } = await yo
    .from("chat_participants").select(COLS_MI_PARTICIPACION)
    .eq("user_id", ctx.actuaComo).limit(TOPE_CONVERSACIONES + 1);
  if (error) return { error: `participaciones: ${error.message}` };
  const filas = (data ?? []) as MiParticipacion[];
  if (filas.length > TOPE_CONVERSACIONES) return { error: DETALLE_TOPE_CONVERSACIONES };
  return { filas };
}

/** GET /messenger/conversations — la bandeja. */
async function bandeja(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const limit = limiteDePagina(ctx.consulta.limit, 50);
  if (limit === null) return malPedido(ctx.idioma, "limit_invalido");
  const offset = offsetDePagina(ctx.consulta.offset);
  if (offset === null) return malPedido(ctx.idioma, "offset_invalido");

  const mias = await misParticipaciones(yo, ctx);
  if ("error" in mias) return falla(mias.error ?? "participaciones");
  const participaciones = mias.filas;
  const ids = participaciones.map((p) => p.conversation_id);
  const vacia = { object: "list", resource: "/messenger/conversations", count: 0, limit, offset, has_more: false, data: [] };
  if (!ids.length) return { ok: true, estado: 200, cuerpo: vacia };

  const conversaciones: Record<string, unknown>[] = [];
  for (const tanda of enTandas(ids)) {
    const { data, error } = await yo.from("chat_conversations").select(COLS_BANDEJA).in("id", tanda);
    if (error) return falla(`conversaciones: ${error.message}`);
    conversaciones.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const [ultimos, noLeidos, fijadas, archivadas] = await Promise.all([
    yo.rpc("get_last_messages", { _user_id: ctx.actuaComo }),
    yo.rpc("messenger_unread_counts"),
    yo.from("chat_pinned").select("conversation_id, position").eq("user_id", ctx.actuaComo),
    yo.from("chat_archived").select("conversation_id").eq("user_id", ctx.actuaComo),
  ]);
  if (ultimos.error) return falla(`últimos mensajes: ${ultimos.error.message}`);
  if (fijadas.error) return falla(`fijadas: ${fijadas.error.message}`);
  if (archivadas.error) return falla(`archivadas: ${archivadas.error.message}`);

  const ultimoPor = new Map<string, FilaDeMensaje>();
  for (const m of (ultimos.data ?? []) as FilaDeMensaje[]) ultimoPor.set(m.conversation_id, m);
  // Si el conteo de no leídos no está (o falla), se dice "no se sabe" (null): NUNCA
  // se cae a get_unread_counts, que cuesta 7 a 30 veces más.
  const noLeidosPor = noLeidos.error ? null : new Map<string, number>();
  for (const f of (noLeidos.data ?? []) as { conversation_id: string; unread_count: number }[]) {
    noLeidosPor?.set(f.conversation_id, Number(f.unread_count));
  }
  const fijadaPor = new Map<string, number>();
  for (const f of (fijadas.data ?? []) as { conversation_id: string; position: number }[]) fijadaPor.set(f.conversation_id, f.position);
  const archivadasSet = new Set(((archivadas.data ?? []) as { conversation_id: string }[]).map((f) => f.conversation_id));

  // La otra persona de cada conversación directa.
  const directas = conversaciones.filter((c) => c.type === "direct").map((c) => c.id as string);
  const contraparte = new Map<string, string>();
  for (const tanda of enTandas(directas)) {
    const { data, error } = await yo
      .from("chat_participants").select("conversation_id, user_id")
      .in("conversation_id", tanda).neq("user_id", ctx.actuaComo);
    if (error) return falla(`contrapartes: ${error.message}`);
    for (const f of (data ?? []) as { conversation_id: string; user_id: string }[]) contraparte.set(f.conversation_id, f.user_id);
  }
  const gente = await personas(yo, [...contraparte.values()]);
  if (gente === null) return falla("perfiles de las contrapartes");

  const miaPor = new Map(participaciones.map((p) => [p.conversation_id, p]));
  const items = conversaciones
    .filter((c) => visibleEnBandeja(c.type as string, c.created_by as string, ctx.actuaComo, ultimoPor.has(c.id as string)))
    .map((c) => {
      const id = c.id as string;
      const ultimo = ultimoPor.get(id);
      const otro = contraparte.get(id);
      const n = noLeidosPor ? (noLeidosPor.get(id) ?? 0) : null;
      const mia = miaPor.get(id)!;
      return {
        object: "conversation",
        id,
        type: c.type,
        name: c.type === "group" ? (c.name ?? null) : null,
        avatar_url: c.type === "group" ? (c.avatar_url ?? null) : null,
        counterpart: c.type === "direct" && otro
          ? (gente.get(otro) ?? { id: otro, name: null, avatar_url: null })
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        last_activity_at: (ultimo?.created_at ?? c.updated_at) as string,
        last_message: ultimo ? vistaPrevia(ultimo) : null,
        unread_count: n === null ? null : Math.min(n, 100),
        unread_count_capped: n === null ? null : n > 100,
        me: yoEnLaConversacion(mia),
        is_pinned: fijadaPor.has(id),
        pin_position: fijadaPor.get(id) ?? null,
        is_archived: archivadasSet.has(id),
      };
    })
    .sort(compararPorActividad);

  const pagina = items.slice(offset, offset + limit);
  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "list", resource: "/messenger/conversations",
      count: items.length, limit, offset, has_more: offset + limit < items.length, data: pagina,
    },
  };
}

/** GET /messenger/conversations/{id} — una conversación y sus miembros. */
async function conversacion(yo: SupabaseClient, ctx: Contexto, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return malPedido(ctx.idioma, "id_de_conversacion_invalido");
  const [conv, mia] = await Promise.all([
    yo.from("chat_conversations").select(COLS_CONVERSACION).eq("id", id).maybeSingle(),
    yo.from("chat_participants").select(COLS_MI_PARTICIPACION).eq("conversation_id", id).eq("user_id", ctx.actuaComo).maybeSingle(),
  ]);
  if (conv.error) return falla(`conversación: ${conv.error.message}`);
  if (mia.error) return falla(`participación: ${mia.error.message}`);
  // Si no la ve (no es parte, o no existe) es 404 y no 403: no se confirma que exista.
  if (!conv.data || !mia.data) return noEncontrada(ctx.idioma);
  const c = conv.data as unknown as Record<string, unknown>;
  const yoAca = mia.data as MiParticipacion;

  // La app esconde la lista de miembros a quien no es admin del grupo cuando el
  // grupo lo pide; la base no lo impide, así que se hace aquí.
  const veMiembros = puedeVerMiembros(c.type as string, (c.members_visibility as string) ?? null, yoAca.role);
  let participantes: unknown[] | null = null;
  let truncada = false;
  if (veMiembros) {
    const { data, error } = await yo
      .from("chat_participants").select("user_id, role, joined_at")
      .eq("conversation_id", id).order("joined_at", { ascending: true }).limit(TOPE_MIEMBROS + 1);
    if (error) return falla(`miembros: ${error.message}`);
    let filas = (data ?? []) as { user_id: string; role: string; joined_at: string }[];
    truncada = filas.length > TOPE_MIEMBROS;
    filas = filas.slice(0, TOPE_MIEMBROS);
    const gente = await personas(yo, filas.map((f) => f.user_id));
    if (gente === null) return falla("perfiles de los miembros");
    // De los demás, solo quién es, su rol y desde cuándo está. Nunca cuándo leyó,
    // si silenció ni cómo le llegan las notificaciones.
    participantes = filas.map((f) => ({
      user: gente.get(f.user_id) ?? { id: f.user_id, name: null, avatar_url: null },
      role: f.role,
      joined_at: f.joined_at,
    }));
  }

  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "conversation",
      data: {
        id: c.id, type: c.type,
        name: c.name ?? null, description: c.description ?? null, avatar_url: c.avatar_url ?? null,
        // El creador es un miembro más: si la lista está escondida, también él (la
        // app no lo muestra en ningún lado).
        created_by: veMiembros ? c.created_by : null, created_at: c.created_at, updated_at: c.updated_at,
        settings: {
          msg_permission: c.msg_permission, members_visibility: c.members_visibility,
          info_permission: c.info_permission, add_permission: c.add_permission,
          require_approval: c.require_approval,
        },
        me: yoEnLaConversacion(yoAca),
        member_count: participantes ? participantes.length : null,
        participants: participantes,
        participants_hidden: !veMiembros,
        participants_truncated: truncada,
      },
    },
  };
}

function leerIncluir(v: string | undefined): { rico: boolean } | null {
  if (v === undefined || v === "") return { rico: false };
  if (v === "rich") return { rico: true };
  return null;
}

/** GET /messenger/conversations/{id}/messages — historia, con cursor. */
async function mensajes(yo: SupabaseClient, ctx: Contexto, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return malPedido(ctx.idioma, "id_de_conversacion_invalido");
  const limit = limiteDePagina(ctx.consulta.limit, 50);
  if (limit === null) return malPedido(ctx.idioma, "limit_invalido");
  const incluir = leerIncluir(ctx.consulta.include);
  if (incluir === null) return malPedido(ctx.idioma, "include_invalido");
  const { before, after, thread_root_id: hilo } = ctx.consulta;
  if (before && after) return malPedido(ctx.idioma, "before_y_after");
  let cursor: Cursor | null = null;
  if (before || after) {
    cursor = decodificarCursor((before ?? after)!);
    if (!cursor) return malPedido(ctx.idioma, "cursor_invalido");
  }
  if (hilo !== undefined && !UUID.test(hilo)) return malPedido(ctx.idioma, "thread_root_id_invalido");

  const conv = await yo.from("chat_conversations").select("id").eq("id", id).maybeSingle();
  if (conv.error) return falla(`conversación: ${conv.error.message}`);
  if (!conv.data) return noEncontrada(ctx.idioma);

  const ascendente = !!after;
  const consulta = () => {
    let q = yo.from("chat_messages").select(incluir.rico ? COLS_MENSAJE_RICO : COLS_MENSAJE).eq("conversation_id", id);
    if (hilo) q = q.eq("reply_to_id", hilo).eq("is_thread_reply", true);
    return q;
  };
  let filas: FilaDeMensaje[];
  if (!cursor) {
    const { data, error } = await consulta()
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (error) return falla(`mensajes: ${error.message}`);
    filas = (data ?? []) as unknown as FilaDeMensaje[];
  } else {
    // ⚠️ DOS consultas y no un or(): con "(created_at < t) o (= t y id < i)" el
    // planificador subestima las filas y lee y chequea con la RLS TODO un lado de la
    // conversación antes de ordenar (3.300+ bloques medidos el 25/09), en vez de cortar
    // en limit+1. Así cada una tiene un solo rango y el índice corta donde debe:
    //  * los empates del mismo instante (casi siempre 0-2: los álbumes se guardan
    //    juntos), desempatados por id;
    //  * el rango estricto, del otro lado del instante.
    // Van primero los empates (están más cerca del cursor) y después el rango.
    const empates = ascendente
      ? consulta().eq("created_at", cursor.t).gt("id", cursor.i).order("id", { ascending: true }).limit(limit + 1)
      : consulta().eq("created_at", cursor.t).lt("id", cursor.i).order("id", { ascending: false }).limit(limit + 1);
    const rango = ascendente
      ? consulta().gt("created_at", cursor.t).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(limit + 1)
      : consulta().lt("created_at", cursor.t).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    const [e, r] = await Promise.all([empates, rango]);
    if (e.error) return falla(`mensajes (empates): ${e.error.message}`);
    if (r.error) return falla(`mensajes: ${r.error.message}`);
    filas = [...((e.data ?? []) as unknown as FilaDeMensaje[]), ...((r.data ?? []) as unknown as FilaDeMensaje[])]
      .slice(0, limit + 1);
  }

  const hayMas = filas.length > limit;
  const pagina = filas.slice(0, limit);
  const gente = await personas(yo, pagina.map((m) => m.sender_id));
  if (gente === null) return falla("perfiles de los remitentes");
  const ultimo = pagina[pagina.length - 1];
  // Hacia atrás: hay cursor solo si quedan más viejos. Hacia adelante: siempre (para
  // seguir pidiendo lo nuevo), y si no vino nada, el mismo cursor.
  const siguiente = ascendente
    ? codificarCursor(ultimo ? { t: ultimo.created_at, i: ultimo.id } : cursor!)
    : (hayMas && ultimo ? codificarCursor({ t: ultimo.created_at, i: ultimo.id }) : null);

  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "list", resource: "/messenger/conversations/{id}/messages",
      limit, order: ascendente ? "asc" : "desc", has_more: hayMas, next_cursor: siguiente,
      data: pagina.map((m) => mensajeParaApi(m, gente.get(m.sender_id), { conRico: incluir.rico, baseMaven: ctx.baseDeArchivos })),
    },
  };
}

/** GET /messenger/feed — lo nuevo en TODAS mis conversaciones, en orden. Es como una
 *  integración "recibe" sin webhooks: pide, guarda next_cursor, vuelve a pedir. */
async function feed(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const limit = limiteDePagina(ctx.consulta.limit, 100);
  if (limit === null) return malPedido(ctx.idioma, "limit_invalido");
  const incluir = leerIncluir(ctx.consulta.include);
  if (incluir === null) return malPedido(ctx.idioma, "include_invalido");
  const { after, since, exclude_own: sinPropios } = ctx.consulta;
  if (after && since) return malPedido(ctx.idioma, "after_y_since");
  if (sinPropios !== undefined && sinPropios !== "true" && sinPropios !== "false") {
    return malPedido(ctx.idioma, "exclude_own_invalido");
  }

  const ahora = Date.now();
  let desde: Cursor;
  if (after) {
    const c = decodificarCursor(after);
    if (!c) return malPedido(ctx.idioma, "cursor_invalido");
    desde = c;
  } else if (since) {
    const ms = Date.parse(since);
    if (Number.isNaN(ms) || !/^\d{4}-\d{2}-\d{2}T/.test(since)) return malPedido(ctx.idioma, "since_invalido");
    if (ahora - ms > FEED_SINCE_MAX_MS) {
      return malPedido(ctx.idioma, "since_muy_viejo");
    }
    desde = { t: new Date(ms).toISOString(), i: UUID_MINIMO };
  } else {
    desde = { t: new Date(ahora - FEED_POR_DEFECTO_MS).toISOString(), i: UUID_MINIMO };
  }

  const asentado = ahora - ASENTAMIENTO_MS;
  const desdeMs = Date.parse(desde.t);
  if (!Number.isFinite(desdeMs)) return malPedido(ctx.idioma, "cursor_invalido");
  const hastaMs = Math.min(desdeMs + VENTANA_FEED_MS, asentado);
  const hasta = new Date(hastaMs).toISOString();
  const alDia = hastaMs >= asentado;
  const vacio = (cursor: Cursor, alDiaYa: boolean) => ({
    ok: true as const,
    estado: 200 as const,
    cuerpo: {
      object: "list", resource: "/messenger/feed", limit, has_more: !alDiaYa, caught_up: alDiaYa,
      next_cursor: codificarCursor(cursor), window: { from: desde.t, to: hasta }, data: [],
    },
  });
  // El cursor ya está en el presente (o en el futuro): no hay ventana que mirar.
  if (hastaMs <= desdeMs) return vacio(desde, true);

  const mias = await misParticipaciones(yo, ctx);
  if ("error" in mias) return falla(mias.error ?? "participaciones");
  const ids = mias.filas.map((p) => p.conversation_id);
  if (!ids.length) return vacio({ t: hasta, i: UUID_MAXIMO }, alDia);

  const juntos: FilaDeMensaje[] = [];
  for (const tanda of enTandas(ids)) {
    let q = yo.from("chat_messages").select(incluir.rico ? COLS_MENSAJE_RICO : COLS_MENSAJE)
      .in("conversation_id", tanda)
      .gte("created_at", desde.t).or(filtroDespues(desde)).lte("created_at", hasta);
    if (sinPropios === "true") q = q.neq("sender_id", ctx.actuaComo);
    q = q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);
    const { data, error } = await q;
    if (error) return falla(`feed: ${error.message}`);
    juntos.push(...((data ?? []) as unknown as FilaDeMensaje[]));
  }
  juntos.sort(compararMensajes);
  const hayMas = juntos.length > limit;
  const pagina = juntos.slice(0, limit);
  const gente = await personas(yo, pagina.map((m) => m.sender_id));
  if (gente === null) return falla("perfiles de los remitentes");
  const ultimo = pagina[pagina.length - 1];
  const siguiente: Cursor = hayMas && ultimo ? { t: ultimo.created_at, i: ultimo.id } : { t: hasta, i: UUID_MAXIMO };
  const quedaPorDelante = hayMas || !alDia;

  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "list", resource: "/messenger/feed", limit,
      has_more: quedaPorDelante, caught_up: !quedaPorDelante,
      next_cursor: codificarCursor(siguiente), window: { from: desde.t, to: hasta },
      data: pagina.map((m) => mensajeParaApi(m, gente.get(m.sender_id), { conRico: incluir.rico, baseMaven: ctx.baseDeArchivos })),
    },
  };
}

// ─── Messenger: escribir ──────────────────────────────────────────────────────
//
// Cada handler: valida los ids, lee el cuerpo (un campo de más es un 400 sin tocar la
// base), exige la Idempotency-Key en los POST, llama a UNA RPC y formatea lo que
// devuelve con filaDesdeRpc + mensajeParaApi. La base decide todo lo demás: si la key
// vale para escribir, el interruptor y el freno, los topes, el texto, la cita y de
// quién es cada mensaje. ⚠️ Las RPC se llaman por POST (.rpc sin {get} ni head):
// postgrest-js reintenta un GET que falla, y una escritura no se repite a ciegas.

/** Lo que devuelve una llamada a la base, sin que nunca tire: una excepción (la red,
 *  un bug del cliente) es un error SIN código, o sea, un resultado incierto. */
async function llamar(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<{ data: unknown; error: unknown }> {
  try {
    const r = await p;
    return { data: r.data, error: r.error };
  } catch {
    return { data: null, error: { message: "la llamada a la base tiró una excepción" } };
  }
}

/** El 405 de una ruta que existe con otros métodos. */
const metodoNoPermitido = (idioma: Idioma, permitidos: Metodo[]): Resultado => ({
  ok: false, estado: 405, error: "method_not_allowed", permitidos,
  mensaje: msg(idioma, "metodo_no_permitido", { permitidos: permitidos.join(", ") }),
});

/** Un cuerpo que no se puede mandar a la base. */
function rechazoDeCuerpo(idioma: Idioma, p: ProblemaDeCuerpo): Resultado {
  switch (p.tipo) {
    case "sin_cuerpo":
      return { ok: false, estado: 400, error: "invalid_json", mensaje: msg(idioma, "cuerpo_no_es_objeto") };
    case "campo_desconocido":
      return { ok: false, estado: 400, error: "unknown_field", mensaje: msg(idioma, "campo_desconocido", { campos: p.campos.join(", ") }) };
    case "campo_invalido":
      return { ok: false, estado: 400, error: "invalid_field", mensaje: msg(idioma, "campo_invalido", { campo: p.campo }) };
    case "tipo_de_conversacion":
      return { ok: false, estado: 400, error: "invalid_field", mensaje: msg(idioma, "tipo_de_conversacion") };
    case "texto_invalido":
      return { ok: false, estado: 422, error: "invalid_text", mensaje: msg(idioma, "texto_invalido") };
  }
}

const sinIdempotencia = (idioma: Idioma): Resultado => ({
  ok: false, estado: 400, error: "idempotency_key_required", mensaje: msg(idioma, "falta_idempotencia"),
});

/** El error de la base, como lo ve el cliente (la tabla de ./escritura-formato.ts). Un
 *  caso por código, cada uno con su texto. */
function resultadoDeError(idioma: Idioma, e: ErrorDeEscritura): Resultado {
  switch (e.tipo) {
    case "rechazo":
      switch (e.error) {
        case "unauthorized":
          return { ok: false, estado: 401, error: e.error, mensaje: msg(idioma, "escritura_llave_no_valida") };
        case "forbidden":
          return { ok: false, estado: 403, error: e.error, mensaje: msg(idioma, "escritura_prohibida") };
        case "not_allowed_in_conversation":
          return { ok: false, estado: 403, error: e.error, mensaje: msg(idioma, "no_puede_escribir_aqui") };
        case "not_your_message":
          return { ok: false, estado: 403, error: e.error, mensaje: msg(idioma, "mensaje_de_otra_persona") };
        case "not_an_api_message":
          return { ok: false, estado: 403, error: e.error, mensaje: msg(idioma, "mensaje_escrito_a_mano") };
        case "other_integration_message":
          return { ok: false, estado: 403, error: e.error, mensaje: msg(idioma, "mensaje_de_otra_integracion") };
        case "not_found":
          return { ok: false, estado: 404, error: e.error, mensaje: msg(idioma, "mensaje_no_encontrado") };
        case "conversation_not_found":
          return { ok: false, estado: 404, error: e.error, mensaje: msg(idioma, "conversacion_no_encontrada") };
        case "person_not_found":
          return { ok: false, estado: 404, error: e.error, mensaje: msg(idioma, "persona_no_encontrada") };
        case "idempotency_key_reused":
          return { ok: false, estado: 409, error: e.error, mensaje: msg(idioma, "idempotencia_reusada") };
        case "message_deleted":
          return { ok: false, estado: 409, error: e.error, mensaje: msg(idioma, "mensaje_ya_borrado") };
        case "invalid_text":
          return { ok: false, estado: 422, error: e.error, mensaje: msg(idioma, "texto_invalido") };
        case "invalid_reply":
          return { ok: false, estado: 422, error: e.error, mensaje: msg(idioma, "cita_invalida") };
        case "conversation_too_large":
          return { ok: false, estado: 422, error: e.error, mensaje: msg(idioma, "conversacion_muy_grande") };
        case "cannot_message_self":
          return { ok: false, estado: 422, error: e.error, mensaje: msg(idioma, "consigo_mismo") };
        case "too_many_conversations":
          return { ok: false, estado: 422, error: e.error, mensaje: msg(idioma, "demasiadas_conversaciones") };
        case "invalid_idempotency_key":
          return { ok: false, estado: 400, error: e.error, mensaje: msg(idioma, "idempotencia_invalida") };
      }
      // Sin default: si se suma un código y no se traduce aquí, `deno check` falla.
      return e.error satisfies never;
    case "tope":
      if (e.limite === "concurrent_write") {
        return { ok: false, estado: 429, error: "rate_limited", limite: e.limite, reintentarEnSeg: e.reintentarEnSeg, mensaje: msg(idioma, "escritura_en_curso") };
      }
      if (e.limite === "conversation_loop") {
        return { ok: false, estado: 429, error: "rate_limited", limite: e.limite, reintentarEnSeg: e.reintentarEnSeg, mensaje: msg(idioma, "ronda_de_integraciones") };
      }
      return {
        ok: false, estado: 429, error: "rate_limited", limite: e.limite, reintentarEnSeg: e.reintentarEnSeg,
        mensaje: msg(idioma, "tope_de_escritura", { limite: e.limite, s: e.reintentarEnSeg }),
      };
    case "pausa":
      if (e.motivo === "presion") {
        return { ok: false, estado: 503, error: "writes_paused", reintentarEnSeg: e.reintentarEnSeg, mensaje: msg(idioma, "escritura_en_pausa") };
      }
      return { ok: false, estado: 503, error: "writes_paused", reintentarEnSeg: e.reintentarEnSeg, mensaje: msg(idioma, "escritura_apagada") };
    case "reintentable":
      return { ok: false, estado: 503, error: "temporarily_unavailable", reintentarEnSeg: e.reintentarEnSeg, mensaje: msg(idioma, "no_disponible") };
    case "incierto":
      return { ok: false, estado: 503, error: "outcome_unknown", reintentarEnSeg: e.reintentarEnSeg, mensaje: msg(idioma, "resultado_incierto") };
    case "directo_duplicado":
      return falla("directo_duplicado también al reintentar");
    case "otro":
      return falla(e.detalle);
  }
}

/** El remitente de lo que se acaba de escribir (la persona de la key), para la
 *  respuesta. Si no se puede leer, va sin nombre: la escritura YA se hizo y no puede
 *  salir como un error. */
async function remitente(yo: SupabaseClient, id: string): Promise<Persona | undefined> {
  try {
    return (await personas(yo, [id]))?.get(id);
  } catch {
    return undefined;
  }
}

type Envio = { repetido: boolean; conversacion: string; creada: boolean; fila: NonNullable<ReturnType<typeof filaDesdeRpc>> };

/** Lo que devuelven api_messenger_enviar y api_messenger_abrir_directo. */
function leerEnvio(v: unknown): Envio | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const fila = filaDesdeRpc(o.message);
  if (typeof o.repetido !== "boolean" || typeof o.conversation_id !== "string" || !fila) return null;
  if (o.created !== undefined && typeof o.created !== "boolean") return null;
  return { repetido: o.repetido, conversacion: o.conversation_id, creada: o.created === true, fila };
}

/** GET /messenger/people — a quién se le puede escribir (pide messenger:write). */
async function personasDelDirectorio(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const limit = limiteDePagina(ctx.consulta.limit, 50);
  if (limit === null) return malPedido(ctx.idioma, "limit_invalido");
  const offset = offsetDePagina(ctx.consulta.offset);
  if (offset === null) return malPedido(ctx.idioma, "offset_invalido");
  const q = ctx.consulta.q;
  if (q !== undefined && q.length > 100) return malPedido(ctx.idioma, "q_invalido");
  const r = await llamar(yo.rpc("messenger_directorio", { _q: q ?? null, _limite: limit, _desde: offset }));
  if (r.error) return resultadoDeError(ctx.idioma, clasificarErrorDeEscritura(r.error));
  if (!Array.isArray(r.data)) return falla("messenger_directorio devolvió otra forma");
  const filas = r.data as { id: string; name: string | null; avatar_url: string | null }[];
  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "list", resource: "/messenger/people", limit, offset, has_more: filas.length > limit,
      data: filas.slice(0, limit).map((f) => ({ object: "person", id: f.id, name: f.name ?? null, avatar_url: f.avatar_url ?? null })),
    },
  };
}

type Escritura = "abrir" | "enviar" | "editar" | "borrar";

/** Lo que una escritura le manda a su RPC, ya validado. */
type Preparada =
  | { accion: "abrir"; con: string; texto: string; idem: string }
  | { accion: "enviar"; conversacion: string; texto: string; respondeA: string | null; enHilo: boolean; idem: string }
  | { accion: "editar"; conversacion: string; mensajeId: string; texto: string }
  | { accion: "borrar"; conversacion: string; mensajeId: string };

/** Valida una escritura SIN tocar la base: los ids de la ruta, el cuerpo (un campo de
 *  más es un 400) y la Idempotency-Key de los POST. La corre la entrada antes de mirar
 *  la sesión, y cada handler otra vez (así un handler llamado solo también la tiene). */
function prepararEscritura(ctx: Contexto, accion: Escritura): { ok: true; p: Preparada } | { ok: false; r: Resultado } {
  const [, conversacionCruda = "", , mensajeCrudo = ""] = ctx.ruta;
  const conversacion = conversacionCruda.toLowerCase();
  const mensajeId = mensajeCrudo.toLowerCase();
  if (accion !== "abrir" && !UUID.test(conversacion)) return { ok: false, r: malPedido(ctx.idioma, "id_de_conversacion_invalido") };
  if ((accion === "editar" || accion === "borrar") && !UUID.test(mensajeId)) {
    return { ok: false, r: malPedido(ctx.idioma, "id_de_mensaje_invalido") };
  }
  // DELETE no lleva cuerpo: ni se lee.
  if (accion === "borrar") return { ok: true, p: { accion, conversacion, mensajeId } };
  const leido = leerEscritura(accion, ctx.cuerpo);
  if (!leido.ok) return { ok: false, r: rechazoDeCuerpo(ctx.idioma, leido.problema) };
  const c = leido.pedido;
  if (c.accion === "editar") return { ok: true, p: { accion: "editar", conversacion, mensajeId, texto: c.text } };
  // Los dos POST: sin Idempotency-Key no se manda nada (un reintento duplicaría).
  if (ctx.idempotencia === null) return { ok: false, r: sinIdempotencia(ctx.idioma) };
  if (c.accion === "abrir") return { ok: true, p: { accion: "abrir", con: c.user_id, texto: c.text, idem: ctx.idempotencia } };
  return {
    ok: true,
    p: { accion: "enviar", conversacion, texto: c.text, respondeA: c.reply_to_id, enHilo: c.thread, idem: ctx.idempotencia },
  };
}

/** POST /messenger/conversations — un directo con su primer mensaje, en la misma
 *  transacción: si ya hay un directo, el canónico (200, created: false); si no, uno
 *  nuevo (201). Nunca queda un directo vacío. */
async function abrirChat(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const v = prepararEscritura(ctx, "abrir");
  if (!v.ok) return v.r;
  if (v.p.accion !== "abrir") return falla("prepararEscritura devolvió otra acción");
  const args = { _con: v.p.con, _texto: v.p.texto, _idem: v.p.idem };
  let r: { data: unknown; error: unknown } = { data: null, error: null };
  // Una carrera con la app (MV409 directo_duplicado de A: otra sesión abrió el mismo
  // directo a la vez) no es un error para el cliente: la transacción volvió atrás
  // entera, y al pedirlo otra vez la base toma el candado del par y usa el canónico.
  for (let intento = 0; intento < 2; intento++) {
    r = await llamar(yo.rpc("api_messenger_abrir_directo", args));
    if (!r.error || clasificarErrorDeEscritura(r.error).tipo !== "directo_duplicado") break;
  }
  if (r.error) return resultadoDeError(ctx.idioma, clasificarErrorDeEscritura(r.error));
  const e = leerEnvio(r.data);
  if (!e) return falla("api_messenger_abrir_directo devolvió otra forma");
  const persona = await remitente(yo, e.fila.sender_id);
  return {
    ok: true,
    estado: e.creada && !e.repetido ? 201 : 200,
    cuerpo: {
      object: "conversation_message",
      conversation: { id: e.conversacion, type: "direct", created: e.creada },
      message: mensajeParaApi(e.fila, persona, { conRico: false, baseMaven: ctx.baseDeArchivos }),
      idempotent_replay: e.repetido,
    },
  };
}

/** POST /messenger/conversations/{id}/messages — mandar un mensaje (201; la
 *  repetición con la misma Idempotency-Key, 200). */
async function enviar(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const v = prepararEscritura(ctx, "enviar");
  if (!v.ok) return v.r;
  if (v.p.accion !== "enviar") return falla("prepararEscritura devolvió otra acción");
  const r = await llamar(yo.rpc("api_messenger_enviar", {
    _conversacion: v.p.conversacion, _texto: v.p.texto, _responde_a: v.p.respondeA, _en_hilo: v.p.enHilo, _idem: v.p.idem,
  }));
  if (r.error) return resultadoDeError(ctx.idioma, clasificarErrorDeEscritura(r.error));
  const e = leerEnvio(r.data);
  if (!e) return falla("api_messenger_enviar devolvió otra forma");
  const persona = await remitente(yo, e.fila.sender_id);
  return {
    ok: true,
    estado: e.repetido ? 200 : 201,
    cuerpo: {
      object: "message",
      data: mensajeParaApi(e.fila, persona, { conRico: false, baseMaven: ctx.baseDeArchivos }),
      idempotent_replay: e.repetido,
    },
  };
}

/** PATCH /messenger/conversations/{id}/messages/{messageId} — editar lo que mandó la
 *  MISMA integración (sobrevive a la rotación de la key). Con el mismo texto, 200 sin
 *  escribir (changed: false). */
async function editar(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const v = prepararEscritura(ctx, "editar");
  if (!v.ok) return v.r;
  if (v.p.accion !== "editar") return falla("prepararEscritura devolvió otra acción");
  const r = await llamar(yo.rpc("api_messenger_editar", { _conversacion: v.p.conversacion, _mensaje: v.p.mensajeId, _texto: v.p.texto }));
  if (r.error) return resultadoDeError(ctx.idioma, clasificarErrorDeEscritura(r.error));
  const o = (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>;
  const fila = filaDesdeRpc(o.message);
  if (typeof o.cambiado !== "boolean" || !fila) return falla("api_messenger_editar devolvió otra forma");
  const persona = await remitente(yo, fila.sender_id);
  return {
    ok: true,
    estado: 200,
    cuerpo: {
      object: "message",
      data: mensajeParaApi(fila, persona, { conRico: false, baseMaven: ctx.baseDeArchivos }),
      changed: o.cambiado,
    },
  };
}

/** DELETE /messenger/conversations/{id}/messages/{messageId} — borrar lo que mandó la
 *  misma integración, por delete_chat_message (archiva para los admins). Sin cuerpo. */
async function borrar(yo: SupabaseClient, ctx: Contexto): Promise<Resultado> {
  const v = prepararEscritura(ctx, "borrar");
  if (!v.ok) return v.r;
  if (v.p.accion !== "borrar") return falla("prepararEscritura devolvió otra acción");
  const r = await llamar(yo.rpc("api_messenger_borrar", { _conversacion: v.p.conversacion, _mensaje: v.p.mensajeId }));
  if (r.error) return resultadoDeError(ctx.idioma, clasificarErrorDeEscritura(r.error));
  const o = (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}) as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.already_deleted !== "boolean") return falla("api_messenger_borrar devolvió otra forma");
  return { ok: true, estado: 200, cuerpo: { object: "message_deleted", id: o.id, already_deleted: o.already_deleted } };
}

/** /messenger/* — despacho por (método, ruta). */
export const servirMessenger: Handler = (yo, ctx) => {
  // Defensa en profundidad: la base ya exige IPs fijas y vencimiento para crear una
  // llave con Messenger (api_keys_reglas_messenger). Si igual llegara una sin eso,
  // no se sirve.
  if (!ctx.llave.conWhitelist || !ctx.llave.venceEl) {
    return Promise.resolve({
      ok: false, estado: 403, error: "forbidden",
      mensaje: msg(ctx.idioma, "messenger_llave_sin_reglas"),
    });
  }
  const ruta = scopesDeLaRuta("messenger", ctx.metodo, ctx.ruta);
  if (!ruta.ok && ruta.estado === 405) return Promise.resolve(metodoNoPermitido(ctx.idioma, ruta.permitidos));
  if (!ruta.ok) {
    return Promise.resolve({
      ok: false, estado: 404, error: "not_found",
      mensaje: msg(ctx.idioma, "messenger_rutas"),
    });
  }
  const [, id = ""] = ctx.ruta;
  switch (ruta.accion) {
    case "bandeja": return bandeja(yo, ctx);
    case "conversacion": return conversacion(yo, ctx, id);
    case "mensajes": return mensajes(yo, ctx, id);
    case "feed": return feed(yo, ctx);
    case "personas": return personasDelDirectorio(yo, ctx);
    case "abrir": return abrirChat(yo, ctx);
    case "enviar": return enviar(yo, ctx);
    case "editar": return editar(yo, ctx);
    case "borrar": return borrar(yo, ctx);
    case "me": return Promise.resolve(falla("la ruta de /me llegó al Messenger"));
  }
};

export const RECURSOS_COMO_USUARIO: Record<string, Handler> = {
  me: servirMe,
  messenger: servirMessenger,
};

/** Los scopes de cada recurso: el de leer (null = ninguno) y el de escribir (null =
 *  el recurso no se escribe: todo lo que no es GET da 405). Qué ruta pide cuál lo dice
 *  scopesDeLaRuta (./escritura-formato.ts): en el Messenger, todo POST/PATCH/DELETE y
 *  GET /people piden los dos. El test exige que las claves sean exactamente las de
 *  RECURSOS_COMO_USUARIO: un recurso nuevo sin sus scopes no llega a desplegarse. */
export type ScopesDelRecurso = { lectura: string | null; escritura: string | null };

export const SCOPE_REQUERIDO: Record<string, ScopesDelRecurso> = {
  me: { lectura: null, escritura: null },
  messenger: { lectura: "messenger:read", escritura: "messenger:write" },
};

/** Arma la entrada: verifica método, scopes y sesión, y recién ahí despacha.
 *
 *  Es una FÁBRICA para que los tests prueben recursos que no existen (un "privado"
 *  con scope) sin que la entrada de producción acepte mapas inyectados: el router
 *  usa `servirComoUsuario`, ya armada con los mapas de este archivo y de 3
 *  argumentos, y el test prohíbe que index.ts nombre la fábrica o los mapas.
 *
 *  current_tenant_id() lee auth.uid(): si la base no reconociera la sesión (secreto
 *  equivocado, `sub` que no es nadie) o viera a la persona en OTRA agencia (se mudó;
 *  o está en dos y la base elige la otra), no coincide con la agencia de la llave y
 *  se responde 503 sin tocar ningún dato. Una lectura, antes de cualquier handler. */
export function crearServidorComoUsuario(
  handlers: Record<string, Handler>,
  scopeRequerido: Record<string, ScopesDelRecurso>,
) {
  return async (recurso: string, yo: SupabaseClient, ctx: Contexto): Promise<Resultado> => {
    if (!Object.hasOwn(handlers, recurso) || !Object.hasOwn(scopeRequerido, recurso)) {
      return { ok: false, estado: 503, detalle: `sin handler o sin scope declarado: ${recurso}` };
    }
    const { lectura, escritura } = scopeRequerido[recurso];
    // (1) Un recurso que no se escribe solo acepta GET (POST /me: 405).
    if (ctx.metodo !== "GET" && escritura === null) return metodoNoPermitido(ctx.idioma, ["GET"]);
    // (2) El scope de lectura, ANTES de tocar la base: sin él no se gasta ni una consulta.
    if (lectura !== null && !ctx.scopes.includes(lectura)) {
      return { ok: false, estado: 403, error: "forbidden", mensaje: msg(ctx.idioma, "falta_scope", { scope: lectura }) };
    }
    // (3) La ruta con ese método, y si escribe, el scope de escritura: también sin
    // tocar la base. Una ruta que no existe la contesta el handler (404, con su texto).
    const ruta = scopesDeLaRuta(recurso, ctx.metodo, ctx.ruta);
    if (!ruta.ok && ruta.estado === 405) return metodoNoPermitido(ctx.idioma, ruta.permitidos);
    if (ruta.ok && ruta.escritura) {
      if (escritura === null) return { ok: false, estado: 503, detalle: `ruta de escritura sin scope de escritura: ${recurso}` };
      if (!ctx.scopes.includes(escritura)) {
        return { ok: false, estado: 403, error: "forbidden", mensaje: msg(ctx.idioma, "falta_scope", { scope: escritura }) };
      }
    }
    // (4) Una escritura con la ruta o el cuerpo mal (un id que no es un id, un campo
    // de más, sin Idempotency-Key): 400 también sin tocar la base.
    if (ruta.ok && (ruta.accion === "abrir" || ruta.accion === "enviar" || ruta.accion === "editar" || ruta.accion === "borrar")) {
      const v = prepararEscritura(ctx, ruta.accion);
      if (!v.ok) return v.r;
    }
    // (5) Que la base vea la sesión como alguien de la agencia de la llave.
    const agencia = await yo.rpc("current_tenant_id");
    if (agencia.error) return { ok: false, estado: 503, detalle: `current_tenant_id: ${agencia.error.message}` };
    if (agencia.data !== ctx.agenciaDeLaLlave) {
      return {
        ok: false,
        estado: 503,
        detalle: `la sesión fabricada no es de la agencia de la llave (base: ${agencia.data ?? "nadie"})`,
      };
    }
    return handlers[recurso](yo, ctx);
  };
}

/** La única entrada desde el router. */
export const servirComoUsuario = crearServidorComoUsuario(RECURSOS_COMO_USUARIO, SCOPE_REQUERIDO);
