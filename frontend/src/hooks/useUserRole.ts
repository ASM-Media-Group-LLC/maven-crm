import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "manager" | "employee" | "agent" | "closer" | "supervisor" | "spammer" | "Team Leader";

export const useUserRole = () => {
  const { user } = useAuth();

  const { data: role, isLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.role as AppRole) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    role: role ?? null,
    isAdmin: role === "admin",
    isManager: role === "manager",
    isEmployee: role === "employee",
    isAgent: role === "agent",
    // "Team Leader" es nivel supervisor (ve datos de su equipo), igual que en
    // role_groups (is_supervisor_or_above). Lo incluimos en isSupervisor para que
    // el gating de UI lo trate como tal, y exponemos isTeamLeader por si se quiere
    // distinguir.
    isSupervisor: role === "supervisor" || role === "Team Leader",
    isTeamLeader: role === "Team Leader",
    isSpammer: role === "spammer",
    isLoading,
  };
};
