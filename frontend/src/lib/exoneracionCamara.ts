import { supabase } from "@/integrations/supabase/client";

// Exoneración de cámara/pantalla (Alvaro, 05/11): gente/roles a los que NO se les
// pide cámara ni compartir pantalla. A un exonerado no se le califica en esos dos
// factores de la nota. Este helper lo cargan los hooks de la nota.
//
// Desde el 19/11/2026 lo decide el PUESTO, y por separado: Argos funciona con al
// menos una de las dos, y la nota sale solo de lo que el puesto pide (solo
// cámara → la cámara; solo pantalla → la pantalla). Eso llega de la base con
// exigencias_de_varios; si esa consulta falla, se califica como antes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface Exoneracion {
  persona: Set<string>; // user_ids exonerados por persona
  rol: Set<string>;     // nombres de rol exonerados
  sinCamara: Set<string>;   // su puesto no le pide cámara
  sinPantalla: Set<string>; // su puesto no le pide pantalla
}

export const EXONERACION_VACIA: Exoneracion = { persona: new Set(), rol: new Set(), sinCamara: new Set(), sinPantalla: new Set() };

/** Carga la exoneración. ids=null trae a todos los exonerados; con ids se limita. */
export async function cargarExoneracion(ids: string[] | null): Promise<Exoneracion> {
  const base = sinTipar.from("profiles").select("id").eq("exonera_camara_pantalla", true);
  const [pRes, rRes, eRes] = await Promise.all([
    ids === null ? base : base.in("id", ids),
    sinTipar.from("roles_config").select("name").eq("exonera_camara_pantalla", true),
    (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: unknown; error: unknown }> })
      .rpc("exigencias_de_varios", { _ids: ids }),
  ]);
  const exig = (eRes.error ? [] : (eRes.data ?? [])) as Array<{ user_id: string; camara: boolean; pantalla: boolean }>;
  return {
    persona: new Set(((pRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)),
    rol: new Set(((rRes.data ?? []) as Array<{ name: string }>).map((r) => r.name)),
    sinCamara: new Set(exig.filter((e) => e.camara === false).map((e) => e.user_id)),
    sinPantalla: new Set(exig.filter((e) => e.pantalla === false).map((e) => e.user_id)),
  };
}

/** ¿Está exonerado de cámara/pantalla? Por su persona o por alguno de sus roles. */
export function esExento(ex: Exoneracion, id: string, roles: Set<string> | undefined): boolean {
  if (ex.persona.has(id)) return true;
  if (roles) for (const r of roles) if (ex.rol.has(r)) return true;
  return false;
}

/** ¿Se le califica la cámara? No si está exento, ni si su puesto no la pide. */
export function calificaCamara(ex: Exoneracion, id: string, roles: Set<string> | undefined): boolean {
  return !esExento(ex, id, roles) && !ex.sinCamara.has(id);
}

/** ¿Se le califica la pantalla (y lo que Argos ve en ella)? No si está exento, ni si su puesto no la pide. */
export function calificaPantalla(ex: Exoneracion, id: string, roles: Set<string> | undefined): boolean {
  return !esExento(ex, id, roles) && !ex.sinPantalla.has(id);
}
