import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { esPrimeraCarga, leerArranque } from "@/lib/arranque";

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
    queryFn: async ({ client }): Promise<RoleTier> => {
      // Primera carga: rol y grupo ya vinieron en el arranque (lib/arranque.ts).
      if (esPrimeraCarga(client, ["role-tier", user?.id])) {
        const a = await leerArranque(user?.id);
        if (a) {
          if (!a.rol || !a.grupo) return "member";
          if (a.grupo.is_admin) return "admin";
          if (a.grupo.is_manager_or_above) return "manager";
          if (a.grupo.is_supervisor_or_above) return "supervisor";
          return "member";
        }
      }
      // Rol y grupos EN PARALELO (pantallas al instante, 19/11/2026): antes eran
      // dos viajes en fila. Los grupos son pocas filas (una por rol de la
      // agencia), así que se traen todos y se busca el del rol acá.
      const [{ data: userRole }, { data: grupos }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase
          .from("role_groups")
          .select("role_name, is_admin, is_manager_or_above, is_supervisor_or_above"),
      ]);

      // Sin rol asignado → el nivel más bajo (default-deny).
      if (!userRole?.role) return "member";

      const group = (grupos ?? []).find((g) => g.role_name === userRole.role) ?? null;

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
