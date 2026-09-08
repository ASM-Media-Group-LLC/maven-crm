import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Personas con rol manager (pool del select de la ficha y de los filtros por
// manager). Va por RPC SECURITY DEFINER porque la RLS de user_roles solo deja
// leer la fila propia — un query directo devuelve vacío para no-admins.
export interface AssignableManager {
  id: string;
  full_name: string | null;
}

export function useAssignableManagers() {
  return useQuery({
    queryKey: ["assignable-managers"],
    queryFn: async (): Promise<AssignableManager[]> => {
      const { data, error } = await supabase.rpc("get_assignable_managers" as never);
      if (error) throw error;
      return (data ?? []) as AssignableManager[];
    },
    staleTime: 5 * 60_000,
  });
}
