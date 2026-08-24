import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";
import type { AppRole } from "@/hooks/useUserRole";

export interface AdminUser {
  /** false para uno mismo y para cuentas de nivel >= al propio. Solo UX. */
  manageable?: boolean;
  /** nivel del rol del usuario (roles_config.level). 0 = sin rol. */
  role_level?: number;
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  created_at: string;
  role: AppRole | null;
  linked_employee: { id: string; first_name: string; last_name: string } | null;
  ai_daily_quota_override: number | null; // override de cuota IA del inbox (null = usar la del rol)
}

export const useAdminUsers = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, avatar_url, created_at, ai_daily_quota_override");

      if (profilesError) throw profilesError;

      // Roles vía RPC admin_list_user_roles (SECURITY DEFINER), NO por select directo
      // a user_roles: la RLS de esa tabla solo deja ver la fila propia, así que un
      // no-admin veía a los 52 usuarios como "Sin rol" y los contadores en 0 (bug
      // reportado 24/08). La RPC exige permiso de gestión de usuarios y además
      // devuelve `manageable`, que es lo que usamos para esconder acciones.
      const { data: roles, error: rolesError } = await (supabase as any)
        .rpc("admin_list_user_roles");

      if (rolesError) throw rolesError;

      // Fetch employees that have a profile_id linked
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name, profile_id")
        .not("profile_id", "is", null);

      // Fetch emails via edge function (uses auth.admin.listUsers)
      let emailsMap = new Map<string, string>();
      try {
        const emailsData = await adminInvoke<{ users: { id: string; email: string }[] }>("admin-user-actions", { action: "list_users" });
        if (emailsData?.users) {
          emailsData.users.forEach((u) => {
            emailsMap.set(u.id, u.email || "");
          });
        }
      } catch (e) {
        // If session expired, re-throw so react-query surfaces it
        if (e instanceof SessionExpiredError) throw e;
        // Otherwise emails stay empty
      }

      const rolesMap = new Map<string, AppRole>();
      const manageableMap = new Map<string, boolean>();
      const levelMap = new Map<string, number>();
      (roles as Array<{ user_id: string; role: string | null; level: number; manageable: boolean }> | null)
        ?.forEach((r) => {
          if (r.role) rolesMap.set(r.user_id, r.role as AppRole);
          manageableMap.set(r.user_id, r.manageable);
          levelMap.set(r.user_id, r.level);
        });

      const employeeByProfileId = new Map<string, { id: string; first_name: string; last_name: string }>();
      employees?.forEach((e) => {
        if (e.profile_id) employeeByProfileId.set(e.profile_id, { id: e.id, first_name: e.first_name, last_name: e.last_name });
      });

      return (profiles || []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        email: emailsMap.get(p.id) || "",
        created_at: p.created_at || "",
        role: rolesMap.get(p.id) ?? null,
        // manageable = la RPC ya comparó niveles: false para uno mismo y para
        // cualquiera de nivel >= al propio. El front lo usa SOLO para esconder
        // botones (UX); el candado real está en las edge functions.
        manageable: manageableMap.get(p.id) ?? false,
        role_level: levelMap.get(p.id) ?? 0,
        linked_employee: employeeByProfileId.get(p.id) ?? null,
        ai_daily_quota_override: (p as { ai_daily_quota_override?: number | null }).ai_daily_quota_override ?? null,
      })) as AdminUser[];
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      return adminInvoke("manage-user-roles", { action: "assign_role", user_id: userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Rol actualizado", description: "El rol del usuario ha sido cambiado exitosamente." });
    },
    onError: (error: Error) => {
      if (error instanceof SessionExpiredError) {
        toast({ title: "Sesión expirada", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    managers: users.filter((u) => u.role === "manager").length,
    employees: users.filter((u) => u.role === "employee").length,
  };

  return { users, isLoading, changeRole: changeRoleMutation.mutate, isChangingRole: changeRoleMutation.isPending, stats };
};
