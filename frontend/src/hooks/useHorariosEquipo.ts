import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { FilaEquipoHorario, DiaHorario } from "@/lib/horarioSemana";
import { aGuardar } from "@/lib/horarioSemana";

// Horarios del equipo (19/11/2026): la gente cuyo horario puede cambiar quien
// mira (dueño, RR. HH., supervisores con su equipo), guardar/confirmar y el
// cartel obligatorio de RR. HH. Un fallo es un fallo: nunca «no hay nadie».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export function useHorariosEquipo(habilitado = true) {
  return useQuery<FilaEquipoHorario[]>({
    enabled: habilitado,
    queryKey: ["horarios-del-equipo"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("horarios_del_equipo");
      if (error) throw new Error(error.message);
      return (data ?? []) as FilaEquipoHorario[];
    },
  });
}

export interface BloqueoHorarios { debe: boolean; pendientes: number; total: number }

/** ¿Le toca el cartel que no se quita? Si la consulta falla, NO se bloquea a nadie. */
export function useHorariosBloqueo() {
  const { user } = useAuth();
  return useQuery<BloqueoHorarios | null>({
    enabled: !!user?.id,
    queryKey: ["horarios-bloqueo", user?.id ?? null],
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("horarios_bloqueo");
      if (error) return null;
      const fila = (Array.isArray(data) ? data[0] : data) as BloqueoHorarios | undefined;
      return fila ?? null;
    },
  });
}

export function useGuardarHorario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, dias }: { userId: string; dias: DiaHorario[] }) => {
      const { error } = await db.rpc("horario_guardar", { _user_id: userId, _dias: aGuardar(dias) });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["horarios-del-equipo"] });
      void qc.invalidateQueries({ queryKey: ["horarios-bloqueo"] });
      void qc.invalidateQueries({ queryKey: ["horarios-confirmados"] });
    },
  });
}
