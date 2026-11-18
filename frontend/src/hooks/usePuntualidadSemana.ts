import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cargarHorarios } from "@/lib/horarioEmpleado";
import { contarPuntualidad, type DiaPuntual } from "@/lib/llegadas";
import { hoyEnBogota } from "@/hooks/useHoyDelEquipo";

// PUNTUALIDAD DE LA SEMANA (Alvaro, 18/11/2026: la gráfica de horas totales
// «no tiene ningún sentido» → cuántos llegaron tarde cada día de los últimos 7,
// con el número a la vista; tocas un día y ves quiénes). Tarde = más de 5 min
// sobre SU horario de ese día (horario semanal, turno o el de su puesto).

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

/** Los últimos 7 días contables (Bogotá), terminando hoy. */
export function ultimos7(hoy: string): string[] {
  const [a, m, d] = hoy.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const f = new Date(Date.UTC(a, m - 1, d - (6 - i), 12));
    return f.toISOString().slice(0, 10);
  });
}

export function usePuntualidadSemana(habilitado: boolean) {
  const hoy = hoyEnBogota();
  const q = useQuery({
    enabled: habilitado,
    queryKey: ["puntualidad-semana", hoy],
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<DiaPuntual[]> => {
      const dias = ultimos7(hoy);
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("cowork_tiempo_diario", { _desde: dias[0], _hasta: hoy, _user_id: null, _limit: 5000, _offset: 0 });
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as Array<{ dia: string; user_id: string; nombre: string | null; primer_ingreso: string | null }>;
      const ids = [...new Set(filas.map((f) => f.user_id))];
      if (ids.length === 0) return contarPuntualidad(dias, hoy, [], () => null);
      // El horario de cada día (puede cambiar de un día a otro).
      const horarios = await Promise.all(dias.map((dia) => cargarHorarios(ids, dia)));
      const porDia = new Map(dias.map((dia, i) => [dia, horarios[i]]));
      return contarPuntualidad(dias, hoy, filas, (dia, id) => porDia.get(dia)?.get(id)?.entrada ?? null);
    },
  });
  return { dias: q.data ?? [], cargando: q.isLoading, fallo: q.isError, reintentar: () => void q.refetch() };
}
