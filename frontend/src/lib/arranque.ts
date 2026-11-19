// MAVEN ABRE LIVIANA (simulacro v2, 19/11/2026): al abrir, el navegador hacía
// ~10 peticiones sueltas solo para saber quién eres (rol, grupo, permisos,
// examinador, perfil tres veces, reloj de la empresa). Con mil personas a la vez
// PostgREST se ahogaba aunque la base estaba ociosa. `mi_arranque()` devuelve
// todo eso en UNA petición (migración 20261119200000_mi_arranque.sql).
//
// Reglas de uso:
//  - Solo para la PRIMERA carga de cada dato. Un refetch (invalidar después de
//    guardar el avatar, cambiar de rol, reintentar) va directo a su tabla: así
//    nunca se sirve un dato viejo de esta caché.
//  - Si la función falla o no existe, `leerArranque` devuelve null y cada hook
//    sigue por su camino de siempre. Un fallo aquí NUNCA es «sin rol» ni «sin
//    permisos» (CLAUDE.md: un fallo no es vacío).
//  - Todas las piezas comparten la misma petición en vuelo (react-query
//    deduplica por la clave), así que diez consumidores = una petición.
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PermisoArranque {
  module: string;
  submodule: string | null;
  can_access: boolean;
  data_scope: string;
}

export interface GrupoArranque {
  is_admin: boolean | null;
  is_manager_or_above: boolean | null;
  is_supervisor_or_above: boolean | null;
}

export interface PerfilArranque {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  phone_e164: string | null;
  ui_skin: string | null;
  ui_prefs: unknown;
  whatsapp_push_name: string | null;
  whatsapp_verified_at: string | null;
  status: string | null;
  status_color: string | null;
  status_text: string | null;
  status_expires_at: string | null;
}

export interface Arranque {
  uid: string;
  rol: string | null;
  grupo: GrupoArranque | null;
  /** null = no usar (sin rol o configuración ambigua): ir por el camino viejo. */
  permisos: PermisoArranque[] | null;
  examinador: boolean | null;
  perfil: PerfilArranque | null;
  reloj_24h: boolean | null;
}

export const claveArranque = (uid: string) => ["mi-arranque", uid] as const;

/** Lo que dura la respuesta para los consumidores de la primera carga: cubre la
 *  ráfaga de arranque (todos montan en el mismo segundo) y nada más. */
const VIGENCIA_MS = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string) => Promise<{ data: any; error: unknown }> };

async function pedir(uid: string): Promise<Arranque | null> {
  const { data, error } = await sinTipar.rpc("mi_arranque");
  if (error || !data || typeof data !== "object") return null;
  const a = data as Arranque;
  // La sesión cambió entre medio: no mezclar datos de otra persona.
  if (a.uid !== uid) return null;
  return a;
}

/** Una sola petición compartida. null si falla, si no hay rpc (pruebas) o si
 *  no hay usuario: quien llama sigue por su camino de siempre. */
export async function leerArranque(qc: QueryClient, uid: string | null | undefined): Promise<Arranque | null> {
  if (!uid) return null;
  try {
    return await qc.fetchQuery({
      queryKey: claveArranque(uid),
      queryFn: () => pedir(uid),
      staleTime: VIGENCIA_MS,
      gcTime: VIGENCIA_MS,
      retry: false,
    });
  } catch {
    return null;
  }
}

/** ¿Es la primera carga de esta consulta? (sin datos todavía). Solo entonces se
 *  usa el arranque; los refetch van directo a la tabla. */
export function esPrimeraCarga(qc: QueryClient, queryKey: readonly unknown[]): boolean {
  return qc.getQueryData(queryKey) === undefined;
}
