import { supabase } from "@/integrations/supabase/client";

// Exoneración de cámara/pantalla (Alvaro, 05/11): gente/roles a los que NO se les
// pide cámara ni compartir pantalla. A un exonerado no se le califica en esos dos
// factores de la nota. Se asigna por persona o por rol (solo el dueño). Este
// helper lo cargan los hooks de la nota para no calificar a los exonerados.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface Exoneracion {
  persona: Set<string>; // user_ids exonerados por persona
  rol: Set<string>;     // nombres de rol exonerados
}

export const EXONERACION_VACIA: Exoneracion = { persona: new Set(), rol: new Set() };

/** Carga la exoneración. ids=null trae a todos los exonerados; con ids se limita. */
export async function cargarExoneracion(ids: string[] | null): Promise<Exoneracion> {
  const base = sinTipar.from("profiles").select("id").eq("exonera_camara_pantalla", true);
  const [pRes, rRes] = await Promise.all([
    ids === null ? base : base.in("id", ids),
    sinTipar.from("roles_config").select("name").eq("exonera_camara_pantalla", true),
  ]);
  return {
    persona: new Set(((pRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)),
    rol: new Set(((rRes.data ?? []) as Array<{ name: string }>).map((r) => r.name)),
  };
}

/** ¿Está exonerado de cámara/pantalla? Por su persona o por alguno de sus roles. */
export function esExento(ex: Exoneracion, id: string, roles: Set<string> | undefined): boolean {
  if (ex.persona.has(id)) return true;
  if (roles) for (const r of roles) if (ex.rol.has(r)) return true;
  return false;
}
