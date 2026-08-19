import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Nivel de capacidad del rol del usuario, leído de `role_groups` — la MISMA
// tabla que consulta `is_in_role_group()` en RLS y en las edge functions.
//
// ¿Por qué no `useUserRole().isSupervisor`? Porque ese hook compara contra una
// lista de nombres de rol hardcodeada (SUPERVISOR_ROLES) que se desincroniza
// apenas un admin crea un rol custom desde Administración → Roles. Para gatear
// acciones sensibles queremos la fuente de verdad, no una copia.
export type RoleTier = "member" | "supervisor" | "manager" | "admin";

export const useRoleTier = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["role-tier", user?.id],
    queryFn: async (): Promise<RoleTier> => {
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .maybeSingle();

      // Sin rol asignado → el nivel más bajo (default-deny).
      if (!userRole?.role) return "member";

      const { data: group } = await supabase
        .from("role_groups")
        .select("is_admin, is_manager_or_above, is_supervisor_or_above")
        .eq("role_name", userRole.role)
        .maybeSingle();

      // Un rol sin fila en role_groups no tiene NINGUNA capacidad a nivel DB
      // (is_in_role_group le devuelve false a todo) → tratarlo como miembro.
      if (!group) return "member";
      if (group.is_admin) return "admin";
      if (group.is_manager_or_above) return "manager";
      if (group.is_supervisor_or_above) return "supervisor";
      return "member";
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const tier: RoleTier = data ?? "member";

  return {
    tier,
    isLoading,
    // Mismo predicado que `is_in_role_group(uid, 'supervisor_or_above')`.
    isSupervisorOrAbove: tier !== "member",
  };
};
