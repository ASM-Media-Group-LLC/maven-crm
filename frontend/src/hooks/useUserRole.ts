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

// FALLBACK únicamente. `isSupervisor` se resuelve de role_groups.is_supervisor_or_above
// (fuente de verdad, ver el hook abajo). Esta lista solo se consulta si el rol NO
// tuviera fila en role_groups. NO hace falta mantenerla al día: un rol nuevo de
// nivel supervisor funciona solo si está bien seteado en role_groups.
// (Historia: cuando esto era la fuente primaria, cada rename de rol la desincronizaba
// — "Closer Supervisor" → "Closer +" dejó a Miguel/María como miembros rasos.)
const SUPERVISOR_ROLES: readonly string[] = [
  "supervisor",
  "Team Leader",
  "Closer Supervisor",
  "Chatter Supervisor",
  "coordinator_beta",
];

export const useUserRole = () => {
  const { user } = useAuth();

  // ⚠️ `data === null` significa "esta persona NO tiene rol" (caso legítimo).
  // `isError` significa "no pudimos averiguarlo". Antes las dos cosas acababan
  // en el mismo `null` y la app se dibujaba como si no tuvieras permisos: el
  // menú quedaba con solo los módulos universales y parecía que te había
  // deslogueado. Quien consuma esto TIENE que mirar `isError`.
  //
  // Los reintentos de esta consulta se configuran en App.tsx con
  // `setQueryDefaults(["user-role"])`: 3 intentos en vez de 1, porque de acá
  // depende TODO lo que se ve. No se ponen ACÁ a propósito — un `retry` dentro
  // del hook pisa al del QueryClient y dejaría las pruebas esperando los
  // reintentos de verdad.
  const { data: roleData, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      const roleName = (data?.role as AppRole) ?? null;
      if (!roleName) return null;

      // Fuente de verdad de "es supervisor": role_groups (la MISMA que usa el
      // RLS del backend). Antes esto se resolvía con una lista hardcodeada que se
      // desincronizaba en cada rename de rol — "Closer Supervisor" → "Closer +"
      // dejó a Miguel/María tratados como miembros rasos en el front (sin la tab
      // "Todas", pipeline filtrado a 0 asignados). Leyéndolo del grupo, cualquier
      // rol nuevo o renombrado de nivel supervisor funciona sin tocar código.
      const { data: rg } = await supabase
        .from("role_groups")
        .select("is_supervisor_or_above")
        .eq("role_name", roleName)
        .maybeSingle();

      return { role: roleName, isSupervisorGroup: !!(rg as { is_supervisor_or_above?: boolean } | null)?.is_supervisor_or_above };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const role = roleData?.role ?? null;

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
    // De role_groups.is_supervisor_or_above (fuente de verdad). La lista
    // SUPERVISOR_ROLES queda solo como fallback por si el rol no tuviera fila en
    // role_groups (rol desconocido) — así ningún rol conocido regresiona.
    isSupervisor: !!role && ((roleData?.isSupervisorGroup ?? false) || SUPERVISOR_ROLES.includes(role)),
    isTeamLeader: role === "Team Leader",
    isSpammer: role === "spammer",
    // "agent" es el nombre legacy del mismo rol (list_chatters acepta ambos).
    isChatter: role === "Chatter" || role === "agent",
    isLoading,
    /** La consulta falló: NO sabemos el rol. Distinto de "no tiene rol". */
    isError,
    recargarRol: refetch,
  };
};
