/**
 * Los avisos de sistema del Messenger («Ana agregó a Beto al grupo»).
 *
 * Desde la migración 20261001100000_chat_mensajes_de_sistema el texto lo arma la
 * BASE (chat_evento_sistema), con el evento y los nombres de profiles: con sesión
 * de usuario, un INSERT de type 'system' con texto libre se rechaza. Antes lo
 * armaba la app y cualquiera podía insertar cualquier cosa como aviso, que la
 * burbuja dibuja sin autor y se notifica a todo el grupo.
 *
 * El texto que queda guardado es el mismo de siempre, en español: es dato, lo
 * leen todos y no se traduce.
 *
 * Vive aparte de los componentes para poder probarlo sin React ni red.
 */

/** Los eventos que la base conoce (la lista de chat_evento_sistema, tal cual). */
export const EVENTOS_DE_SISTEMA = [
  "renombro",
  "agrego",
  "acepto",
  "elimino",
  "nombro_admin",
  "quito_admin",
  "salio",
] as const;
export type EventoDeSistema = (typeof EVENTOS_DE_SISTEMA)[number];

export type ErrorDelAviso = { message?: string | null; code?: string | null } | null;

/** Lo mínimo del cliente de Supabase que usa el aviso (así el test no necesita el de verdad). */
export interface ClienteParaAvisos {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: ErrorDelAviso }>;
}

/**
 * Manda el aviso de un evento del grupo. `objetivo` es la persona a la que le pasó
 * (sumar, aceptar, sacar, hacer o quitar admin); `texto`, el nombre nuevo del
 * grupo (solo al renombrar).
 *
 * No tira nunca: el aviso es lo de menos y la acción ya se hizo (o, al salir, se
 * hace igual después). Devuelve el error para quien quiera mirarlo.
 */
export async function avisarEvento(
  db: ClienteParaAvisos,
  conversacion: string,
  evento: EventoDeSistema,
  { objetivo = null, texto = null }: { objetivo?: string | null; texto?: string | null } = {},
): Promise<{ error: ErrorDelAviso }> {
  try {
    const r = await db.rpc("chat_evento_sistema", {
      _conv: conversacion,
      _evento: evento,
      _objetivo: objetivo,
      _texto: texto,
    });
    return { error: r?.error ?? null };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
