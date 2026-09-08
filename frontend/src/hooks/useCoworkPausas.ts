import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { agregarPausasPorPersona, totalesPausas, type FilaPausasDia } from "@/lib/coworkPausasResumen";

/** Pausas (baño y break) por persona en un rango de días de Bogotá, de una sesión o de todas. */
export function useCoworkPausas(desde: string, hasta: string, sessionId: string | null, habilitado = true) {
  const q = useQuery({
    queryKey: ["cowork-pausas", desde, hasta, sessionId],
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async () => {
      // El RPC todavía no está en los tipos generados; el cast se acota acá.
      const db = supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
      const { data, error } = await db.rpc("cowork_pausas_resumen", {
        _desde: desde, _hasta: hasta, _session_id: sessionId, _user_id: null, _limit: 2000, _offset: 0,
      });
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaPausasDia[];
      const personas = agregarPausasPorPersona(filas);
      return { filas, personas, totales: totalesPausas(personas) };
    },
  });
  return { data: q.data, cargando: q.isLoading, error: q.error as Error | null, refrescar: q.refetch };
}
