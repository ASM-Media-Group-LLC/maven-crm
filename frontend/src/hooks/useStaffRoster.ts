import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// El roster de la sección Empleados: todas las personas con cuenta activa
// (profiles sin deleted_at), ordenadas por nombre. Se filtra deleted_at porque
// las cuentas no se borran, van a la papelera 30 días: una persona dada de baja
// no debe seguir apareciendo en la lista.
export interface StaffMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

export const useStaffRoster = () => {
  return useQuery({
    queryKey: ["staff-roster"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StaffMember[]> => {
      // deleted_at no está en los tipos generados (soft-delete) → cast, igual
      // que en pages/admin/useAdminUsers.ts.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sinTipar = supabase as unknown as { from: (t: string) => any };
      const { data, error } = await sinTipar
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffMember[];
    },
  });
};
