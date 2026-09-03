import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole =
  | "admin" | "manager" | "employee" | "agent" | "closer" | "supervisor" | "spammer"
  | "Team Leader" | "Closer Supervisor" | "Chatter Supervisor" | "coordinator_beta"
  // Rol canónico del equipo de chat (24 personas). En role_groups es nivel
  // member; su dashboard y sus módulos (Horarios, Rendimiento) se arman por
  // identidad, pero el flag existe para que la UI pueda distinguirlo sin
  // comparar strings sueltos.
  | "Chatter";

// Roles que en `role_groups` tienen is_supervisor_or_above = true SIN ser
// admin/manager. La BD ya los trata como supervisores (RLS "Supervisors+ view
// all", is_in_role_group('supervisor_or_above')); esta lista existe para que el
// FRONT no se quede atrás — cuando se desincroniza, el usuario ve la app como si
// fuera un empleado raso aunque la base le permita todo.
// Caso real: "Closer Supervisor" faltaba acá, así que a Miguel se le ocultaba la
// pestaña "Todas" de Closers y las demás se le filtraban a sus propios asignados
// (0), dejándole el pipeline casi vacío.
// ⚠️ Rol nuevo de nivel supervisor → agregarlo también acá (ver memoria del
// sistema de roles: hay 3 capas y todas deben cablearse).
const SUPERVISOR_ROLES: readonly string[] = [
  "supervisor",
  "Team Leader",
  "Closer Supervisor",
  "Chatter Supervisor",
  "coordinator_beta",
];

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
    isSupervisor: !!role && SUPERVISOR_ROLES.includes(role),
    isTeamLeader: role === "Team Leader",
    isSpammer: role === "spammer",
    // "agent" es el nombre legacy del mismo rol (list_chatters acepta ambos).
    isChatter: role === "Chatter" || role === "agent",
    isLoading,
  };
};
