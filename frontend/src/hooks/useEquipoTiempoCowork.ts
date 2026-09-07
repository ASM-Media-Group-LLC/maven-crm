import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// El reloj de Cowork de TODO el equipo, por persona, para el tablero de equipo
// (reemplazo de Hubstaff, fase 4). RPC `equipo_tiempo_cowork`: supervisor o
// superior ve a todos; cualquier otro, solo lo suyo — el mismo permiso que
// chatter_dashboard_periodo, así los dos números del tablero ven a la misma gente.

export interface TiempoCoworkDePersona {
  horas: number;
  horasEnSala: number;
  diasConReloj: number;
}

/** user_id de Maven → su tiempo en el rango. */
export type TiempoCoworkPorPersona = Map<string, TiempoCoworkDePersona>;

const VACIO: TiempoCoworkPorPersona = new Map();

export function useEquipoTiempoCowork(desde: string, hasta: string) {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["equipo-tiempo-cowork", desde, hasta],
    staleTime: 60_000,
    queryFn: async (): Promise<TiempoCoworkPorPersona> => {
      // El RPC todavía no está en los tipos generados; el cast se acota acá.
      const db = supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
      const { data, error } = await db.rpc("equipo_tiempo_cowork", { _desde: desde, _hasta: hasta });
      if (error) throw new Error(error.message);
      const mapa: TiempoCoworkPorPersona = new Map();
      for (const r of (data ?? []) as Array<{ user_id: string; seg_activo: number | string; seg_en_sala: number | string; dias_con_reloj: number }>) {
        mapa.set(r.user_id, { horas: Number(r.seg_activo) / 3600, horasEnSala: Number(r.seg_en_sala) / 3600, diasConReloj: Number(r.dias_con_reloj) });
      }
      return mapa;
    },
  });
  return { porPersona: q.data ?? VACIO, cargando: q.isLoading };
}

/** Suma del equipo: solo las personas que están en las filas del tablero, para
 *  que "Horas" (Hubstaff) y "Cowork" hablen de la misma gente. */
export function sumarCoworkDelEquipo(
  filas: Array<{ maven_user_id: string | null }>,
  porPersona: TiempoCoworkPorPersona,
): { horas: number; personasConReloj: number } {
  let horas = 0, personasConReloj = 0;
  for (const f of filas) {
    const t = f.maven_user_id ? porPersona.get(f.maven_user_id) : undefined;
    if (!t) continue;
    horas += t.horas;
    if (t.horas > 0) personasConReloj++;
  }
  return { horas, personasConReloj };
}
