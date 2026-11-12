import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ¿Puede abrir Argos? (Alvaro, 12/11/2026: «el admin también… el supervisor mira
// a los chatters nada más».) Lo decide la base con `ve_argos()`: dueño, admin,
// RR. HH. o supervisor. QUÉ ve cada uno lo filtra la RLS (admin/dueño: todos;
// RR. HH.: todos menos admins; supervisor: sus chatters). Esto solo abre la
// puerta del menú y de las rutas. Un fallo de red deja `veArgos` en null: quien
// lo use espera o avisa, nunca concluye «no puede» en silencio.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string) => any };

export function useVeArgos(): { veArgos: boolean | null; cargando: boolean; error: Error | null } {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["ve-argos", user?.id ?? null],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sinTipar.rpc("ve_argos");
      if (error) throw new Error(error.message);
      return data === true;
    },
  });
  return {
    veArgos: q.isSuccess ? q.data : null,
    cargando: !user?.id || q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
