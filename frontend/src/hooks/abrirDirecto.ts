/**
 * Abrir un chat directo con alguien: reusar el que ya hay o crearlo.
 *
 * Antes createDirectChat buscaba el directo con dos consultas y un `limit(1)` SIN
 * orden: con dos directos viejos entre las mismas personas cada lado podía abrir
 * uno distinto, y la base no impedía crear un segundo. Desde la migración
 * 20260929150000_chat_agencia_y_huecos:
 *   · `chat_directo_con(_otro)` devuelve EL directo canónico (el del mensaje más
 *     reciente; si empatan, el más viejo). Es el mismo que va a usar la API.
 *   · la base rechaza con `directo_duplicado` el segundo directo entre dos
 *     personas. Pasa solo en una carrera (los dos se abren el chat a la vez, o
 *     dos pestañas): el primero gana, y el que pierde borra lo suyo y abre el del
 *     otro, sin que la persona vea un error.
 *
 * Vive aparte de useChat para poder probarla sin React ni red.
 */
export type ErrorDeLaBase = { message?: string | null; code?: string | null } | null;
export type Respuesta<T = unknown> = { data?: T | null; error: ErrorDeLaBase };

/** Los pedidos que hace abrirDirecto; en la app los arma pasosDeSupabase. */
export interface PasosDelDirecto {
  /** El directo canónico entre yo y `otro`, o null si no hay. */
  buscar(otro: string): PromiseLike<Respuesta<string>>;
  crearConversacion(id: string): PromiseLike<Respuesta>;
  sumar(conversacion: string, persona: string, rol: "admin" | "member"): PromiseLike<Respuesta>;
  /** Borra la conversación a medio crear (la cascada se lleva las participaciones). */
  deshacer(conversacion: string): PromiseLike<unknown>;
}

export type ResultadoDelDirecto =
  /** Ya había uno (o lo acaba de crear el otro, en una carrera): abrir ese. */
  | { tipo: "existente"; id: string }
  /** Se creó `id`, el que se pidió. */
  | { tipo: "creado"; id: string }
  /** No se pudo averiguar si ya existía: no se crea nada (sería un duplicado). */
  | { tipo: "sin_saber"; motivo: string }
  /** Falló la creación. */
  | { tipo: "error"; motivo: string };

export const esDirectoDuplicado = (e: ErrorDeLaBase): boolean =>
  !!e?.message && e.message.includes("directo_duplicado");

const motivo = (e: ErrorDeLaBase, porDefecto: string) => e?.message || porDefecto;

export async function abrirDirecto(
  pasos: PasosDelDirecto,
  yo: string,
  otro: string,
  idNuevo: string,
): Promise<ResultadoDelDirecto> {
  const buscado = await pasos.buscar(otro);
  // ⚠️ Si la búsqueda FALLA no se crea nada: antes un fallo de red se leía como
  // "no existe" y se creaba un segundo directo con la misma persona.
  if (buscado.error || buscado.data === undefined) {
    return { tipo: "sin_saber", motivo: motivo(buscado.error, "no data") };
  }
  if (buscado.data !== null) {
    return typeof buscado.data === "string" && buscado.data
      ? { tipo: "existente", id: buscado.data }
      : { tipo: "sin_saber", motivo: "unexpected answer" };
  }

  const conversacion = await pasos.crearConversacion(idNuevo);
  if (conversacion.error) return { tipo: "error", motivo: motivo(conversacion.error, "create") };

  // Uno a la vez y en este orden: la base deja al creador sumarse como admin solo
  // en su conversación todavía vacía, y después, ya admin, sumar al otro.
  const creador = await pasos.sumar(idNuevo, yo, "admin");
  if (creador.error) {
    // Sin participación la RLS no deja ver (ni borrar) la conversación: este
    // intento puede no borrar nada. Es el único camino que deja una huérfana.
    await pasos.deshacer(idNuevo);
    return { tipo: "error", motivo: motivo(creador.error, "creator") };
  }

  const elOtro = await pasos.sumar(idNuevo, otro, "member");
  if (elOtro.error) {
    await pasos.deshacer(idNuevo);
    if (esDirectoDuplicado(elOtro.error)) {
      const ganador = await pasos.buscar(otro);
      if (!ganador.error && typeof ganador.data === "string" && ganador.data) {
        return { tipo: "existente", id: ganador.data };
      }
      return { tipo: "sin_saber", motivo: motivo(ganador.error, "duplicate without winner") };
    }
    return { tipo: "error", motivo: motivo(elOtro.error, "member") };
  }
  return { tipo: "creado", id: idNuevo };
}

/**
 * Lo mínimo del cliente de Supabase que usan los pasos (así el test no necesita
 * el cliente de verdad).
 */
export interface ClienteParaDirecto {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Respuesta<unknown>>;
  from(tabla: string): {
    insert(fila: Record<string, unknown>): PromiseLike<Respuesta>;
    delete(): { eq(columna: string, valor: string): PromiseLike<Respuesta> };
  };
}

export function pasosDeSupabase(db: ClienteParaDirecto, yo: string): PasosDelDirecto {
  return {
    buscar: async (otro) => {
      const r = await db.rpc("chat_directo_con", { _otro: otro });
      return { data: r.error ? undefined : ((r.data as string | null) ?? null), error: r.error };
    },
    // Sin RETURNING: la política SELECT de chat_conversations todavía no la deja
    // ver (quien crea no es participante hasta el paso siguiente).
    crearConversacion: (id) => db.from("chat_conversations").insert({ id, type: "direct", created_by: yo }),
    sumar: (conversacion, persona, rol) =>
      db.from("chat_participants").insert({ conversation_id: conversacion, user_id: persona, role: rol }),
    // Se borra la CONVERSACIÓN, en un pedido y mientras quien la creó todavía es
    // participante. Antes se borraba primero la participación: sin ella la
    // política SELECT ya no deja ver la conversación, el DELETE borraba 0 filas
    // sin error y quedaba huérfana.
    deshacer: (conversacion) => db.from("chat_conversations").delete().eq("id", conversacion),
  };
}
