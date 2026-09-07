import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { agregarPorPersona, totales, type FilaDia } from "@/lib/coworkVsHubstaff";

/** Fecha en Bogotá como YYYY-MM-DD, hace `diasAtras` días. */
export function fechaBogota(diasAtras = 0): string {
  const d = new Date(Date.now() - diasAtras * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

export function useCoworkVsHubstaff(desde: string, hasta: string) {
  const q = useQuery({
    queryKey: ["admin-cowork-vs-hubstaff", desde, hasta],
    staleTime: 60_000,
    queryFn: async () => {
      // El RPC todavía no está en los tipos generados; el cast se acota acá.
      const db = supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
      const { data, error } = await db.rpc("admin_cowork_vs_hubstaff", { _desde: desde, _hasta: hasta });
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaDia[];
      const personas = agregarPorPersona(filas);
      return { filas, personas, totales: totales(personas) };
    },
  });
  return { data: q.data, cargando: q.isLoading, error: q.error as Error | null, refrescar: q.refetch };
}
