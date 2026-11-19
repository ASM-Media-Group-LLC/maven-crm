import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizarEvento, type EventoArgos } from "@/lib/estadoArgos";

// ESTADO de hoy: todo lo que Argos fue viendo (cortes, llamados de atención con
// su pantallazo, salidas de Cowork, lo que vio la IA). Se refresca solo cada
// 30 s para que «vaya llegando». Un fallo es un fallo, nunca «no pasó nada».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

export function useEstadoHoy(habilitado = true) {
  return useQuery<EventoArgos[]>({
    enabled: habilitado,
    queryKey: ["argos-estado-hoy"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
    queryFn: async () => {
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("argos_estado_hoy");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<Record<string, unknown>>).map(normalizarEvento);
    },
  });
}
