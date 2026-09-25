// Recursos del API pública que se sirven COMO la persona de la llave.
//
// ⚠️ LA REGLA DE ESTE ARCHIVO: acá no existe service_role. Cada handler recibe
// SOLO el cliente con la sesión de esa persona (./como-usuario.ts) y todo lo que
// consulta pasa por la RLS y los triggers de la base, igual que en la app. Si un
// dato no se puede leer así, no se sirve desde acá. El test lo verifica leyendo
// este archivo: solo puede importar TIPOS, cada handler tiene que estar definido
// acá mismo, y no puede aparecer nada con "admin", service_role ni createClient.
//
// Cada recurso de acá está declarado `como_usuario` en ./aislamiento.ts, y el test
// exige que las dos listas coincidan.
//
// Todo entra por `servirComoUsuario`, que ANTES de cualquier handler verifica, en
// este orden: (1) que la llave tenga el scope del recurso, sin tocar la base; (2)
// que la base vea la sesión como alguien de la agencia de la llave. Un handler nuevo
// no puede olvidarse de ninguna de las dos porque no le tocan a él.
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
};

export type Resultado =
  | { ok: true; cuerpo: unknown }
  /** Culpa del que llama (400), sin permiso (403) o no existe / no la ve (404). */
  | { ok: false; estado: 400 | 403 | 404; error: string; mensaje: string }
  /** Un fallo NUESTRO: se loguea `detalle` y el cliente ve un 503 genérico. */
  | { ok: false; estado: 503; detalle: string };

export type Handler = (yo: SupabaseClient, ctx: Contexto) => Promise<Resultado>;

/** GET /me — quién es esta llave. Sirve para probar en vivo que la sesión fabricada
 *  funciona: `servirComoUsuario` ya verificó que la base la ve como alguien de la
 *  agencia de la llave. */
export const servirMe: Handler = async (yo, ctx) => {
  const sub = ctx.ruta[0] ?? null;
  if (sub) return { ok: false, estado: 404, error: "not_found", mensaje: msg(ctx.idioma, "me_sub_recurso_desconocido", { sub }) };

  const perfil = await yo.from("profiles").select("id, full_name, avatar_url").eq("id", ctx.actuaComo).maybeSingle();
  if (perfil.error) return { ok: false, estado: 503, detalle: `perfil: ${perfil.error.message}` };
  const p = perfil.data as { id: string; full_name: string | null; avatar_url: string | null } | null;
  if (!p) return { ok: false, estado: 503, detalle: "la sesión fabricada no ve el perfil de su propia persona" };

  return {
    ok: true,
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
    },
  };
};

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

const COLS_MENSAJE =
  "id, conversation_id, sender_id, content, type, file_url, file_name, reply_to_id, album_id, " +
  "is_thread_reply, is_edited, is_deleted, created_at, updated_at";
const COLS_MENSAJE_RICO = COLS_MENSAJE + ", content_rich";
const COLS_CONVERSACION =
  "id, type, name, description, avatar_url, created_by, created_at, updated_at, " +
  "msg_permission, members_visibility, info_permission, add_permission, require_approval";
const COLS_BANDEJA = "id, type, name, avatar_url, created_by, created_at, updated_at";
const COLS_MI_PARTICIPACION = "conversation_id, role, joined_at, last_read_at, is_muted, notifications_mode";

/** Nadie tiene hoy más de 71 conversaciones; pasado esto se corta en vez de armar
 *  una bandeja carísima. */
const TOPE_CONVERSACIONES = 500;
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
  if (filas.length > TOPE_CONVERSACIONES) return { error: `más de ${TOPE_CONVERSACIONES} conversaciones` };
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
  if (!ids.length) return { ok: true, cuerpo: vacia };

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
  // grupo lo pide; la base no lo impide, así que se hace acá.
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
    cuerpo: {
      object: "list", resource: "/messenger/feed", limit,
      has_more: quedaPorDelante, caught_up: !quedaPorDelante,
      next_cursor: codificarCursor(siguiente), window: { from: desde.t, to: hasta },
      data: pagina.map((m) => mensajeParaApi(m, gente.get(m.sender_id), { conRico: incluir.rico, baseMaven: ctx.baseDeArchivos })),
    },
  };
}

/** /messenger/* — despacho. */
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
  const [a, b, c, ...resto] = ctx.ruta;
  if (a === "conversations" && b === undefined) return bandeja(yo, ctx);
  if (a === "conversations" && b !== undefined && c === undefined) return conversacion(yo, ctx, b);
  if (a === "conversations" && b !== undefined && c === "messages" && resto.length === 0) return mensajes(yo, ctx, b);
  if (a === "feed" && b === undefined) return feed(yo, ctx);
  return Promise.resolve({
    ok: false, estado: 404, error: "not_found",
    mensaje: msg(ctx.idioma, "messenger_rutas"),
  });
};

export const RECURSOS_COMO_USUARIO: Record<string, Handler> = {
  me: servirMe,
  messenger: servirMessenger,
};

/** El scope que hace falta para cada recurso (null = ninguno). El test exige que
 *  las claves sean exactamente las de RECURSOS_COMO_USUARIO: un recurso nuevo sin
 *  su scope no llega a desplegarse. */
export const SCOPE_REQUERIDO: Record<string, string | null> = {
  me: null,
  messenger: "messenger:read",
};

/** Arma la entrada: verifica la sesión y recién ahí despacha.
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
  scopeRequerido: Record<string, string | null>,
) {
  return async (recurso: string, yo: SupabaseClient, ctx: Contexto): Promise<Resultado> => {
    if (!Object.hasOwn(handlers, recurso) || !Object.hasOwn(scopeRequerido, recurso)) {
      return { ok: false, estado: 503, detalle: `sin handler o sin scope declarado: ${recurso}` };
    }
    // (1) El scope, ANTES de tocar la base: sin él no se gasta ni una consulta.
    const scope = scopeRequerido[recurso];
    if (scope !== null && !ctx.scopes.includes(scope)) {
      return { ok: false, estado: 403, error: "forbidden", mensaje: msg(ctx.idioma, "falta_scope", { scope }) };
    }
    // (2) Que la base vea la sesión como alguien de la agencia de la llave.
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
