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

/** ¿Es el dueño de ESTA agencia? Igual que useEsDueno, pero atado a una agencia: la
 *  fila de tenant_owners tiene que ser de `tenantId` (la agencia de la pantalla, por
 *  ejemplo la de integracion_equipo, que la RLS ya filtra por current_tenant_id()).
 *  Ser dueño de otra agencia no cuenta. Sin `tenantId` todavía, espera (null). */
export function useEsDuenoDeLaAgencia(tenantId: string | null | undefined): {
  esDueno: boolean | null; cargando: boolean; error: Error | null; reintentar: () => void;
} {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id && !!tenantId,
    queryKey: ["es-dueno", user?.id ?? null, tenantId ?? null],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sinTipar
        .from("tenant_owners")
        .select("user_id")
        .eq("user_id", user!.id)
        .eq("tenant_id", tenantId!)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
  });
  return {
    esDueno: q.isSuccess ? q.data : null,
    cargando: !user?.id || !tenantId || q.isLoading,
    error: (q.error as Error | null) ?? null,
    reintentar: () => { void q.refetch().then(() => {}, () => {}); },
  };
}
