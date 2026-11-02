import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ¿Es el DUEÑO de la empresa? (tenant_owners; hoy las dos cuentas de Alvaro). Es
// la llave de Argos: «por ahora solo lo ve el dueño». Hay 8 admins, así que
// admin ≠ dueño. La RLS deja ver solo la fila propia: la pregunta es barata.
//
// Un fallo de red NO es «no eres dueño»: esDueno queda en null y quien lo use
// muestra espera o un aviso de reintento, nunca la puerta cerrada en silencio.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useEsDueno(): { esDueno: boolean | null; cargando: boolean; error: Error | null } {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["es-dueno", user?.id ?? null],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sinTipar
        .from("tenant_owners")
        .select("user_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
  });
  return {
    esDueno: q.isSuccess ? q.data : null,
    cargando: !user?.id || q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
