import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

// Las faltas que registró el monitor de cámara, para el panel de RRHH. Lo ven
// supervisores y admins (lo fuerza la RLS). Se refresca en vivo: cuando entra
// una falta nueva (gratis o de IA), la lista se actualiza sola.

export interface MonitorEvento {
  id: string;
  user_id: string;
  nombre: string | null;
  room_nombre: string | null;
  tipo: string;
  fuente: string; // 'local' | 'ia'
  detalle: string | null;
  captura_path: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useMonitorEventos(limite = 200) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["monitor-eventos", limite],
    staleTime: 15_000,
    queryFn: async (): Promise<MonitorEvento[]> => {
      const { data, error } = await sinTipar
        .from("monitor_eventos")
        .select("id, user_id, room_nombre, tipo, fuente, detalle, captura_path, created_at")
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      const filas = (data ?? []) as Array<Omit<MonitorEvento, "nombre">>;
      const ids = [...new Set(filas.map((f) => f.user_id))];
      const nombres: Record<string, string | null> = {};
      if (ids.length) {
        const { data: perfiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (perfiles ?? []) as Array<{ id: string; full_name: string | null }>) {
          nombres[p.id] = p.full_name;
        }
      }
      return filas.map((f) => ({ ...f, nombre: nombres[f.user_id] ?? null }));
    },
  });

  useCanalQueRevive({
    topic: "monitor-eventos-feed",
    armar: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "monitor_eventos" },
        () => { void qc.invalidateQueries({ queryKey: ["monitor-eventos"] }); },
      ),
    alRevivir: () => { void qc.invalidateQueries({ queryKey: ["monitor-eventos"] }); },
  });

  return {
    eventos: query.data ?? [],
    cargando: query.isLoading,
    // Un fallo de lectura NO es "no hay faltas": se distingue para no mostrar un
    // panel vacío ante un error de red o de permisos (regla del repo).
    error: (query.error as Error | null) ?? null,
    refrescar: () => qc.invalidateQueries({ queryKey: ["monitor-eventos"] }),
  };
}

/** URL firmada (2 min) para ver una captura del bucket privado. */
export async function urlCaptura(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from("monitor-capturas").createSignedUrl(path, 120);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
