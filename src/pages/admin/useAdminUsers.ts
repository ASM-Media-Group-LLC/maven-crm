import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";
import type { AppRole } from "@/hooks/useUserRole";

export interface AdminUser {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
  created_at: string;
  role: AppRole | null;
  linked_employee: { id: string; first_name: string; last_name: string } | null;
}

export const useAdminUsers = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, created_at");

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

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
      roles?.forEach((r) => rolesMap.set(r.user_id, r.role as AppRole));

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
        linked_employee: employeeByProfileId.get(p.id) ?? null,
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
