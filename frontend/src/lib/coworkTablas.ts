import type { SupabaseClient } from "@supabase/supabase-js";

// Accesos a tablas y funciones de Cowork que los TIPOS GENERADOS todavía no
// conocen (`frontend/src/integrations/supabase/types.ts` está desactualizado:
// le faltan cowork_break_limits, cowork_bano_consumido_hoy y varias más).
//
// Los casts viven ACÁ, acotados y con nombre, en vez de repartidos por las
// pantallas. Cuando se regeneren los tipos, este archivo se borra y el
// compilador señala solo estos dos lugares.

/** deno-lint-ignore-file — el cast es deliberado, ver comentario de arriba. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteFlexible = { from: (t: string) => any; rpc: (f: string, a: unknown) => any };

/** Segundos de baño ya consumidos HOY (día de Bogotá) por cada usuario. */
export async function rpcBanoConsumido(
  sb: SupabaseClient,
  userIds: string[],
): Promise<{ data: { user_id: string; segundos: number }[] | null }> {
  const { data } = await (sb as unknown as ClienteFlexible)
    .rpc("cowork_bano_consumido_hoy", { _user_ids: userIds });
  return { data: (data ?? null) as { user_id: string; segundos: number }[] | null };
}

/** Topes por tipo de pausa, en minutos. Salen de la tabla, no de constantes:
 *  si mañana alguien cambia el tope, la pantalla no sigue prometiendo lo viejo. */
export async function leerLimitesPausa(sb: SupabaseClient): Promise<Record<string, number>> {
  const { data } = await (sb as unknown as ClienteFlexible)
    .from("cowork_break_limits").select("kind, minutos");
  const filas = (data ?? []) as { kind: string; minutos: number }[];
  return Object.fromEntries(filas.map((l) => [l.kind, l.minutos]));
}
