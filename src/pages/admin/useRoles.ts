import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RoleConfig {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
  user_names: string[];
}

export interface RolePermission {
  id?: string;
  role_id: string;
  module: string;
  submodule: string | null;
  can_access: boolean;
  data_scope: string;
}

export const MODULES_CONFIG = [
  { module: "Dashboard", submodules: [] },
  { module: "Creator Sales", submodules: ["Dashboard", "Sales Report", "Sales Report V1", "AI Sales", "AI Config"] },
  { module: "Contactos", submodules: ["Contactos", "Agencias"] },
  { module: "Creadores", submodules: ["Lista", "Perfil", "Nuevo"] },
  { module: "Eventos", submodules: ["Lista", "Detalle", "Nuevo", "Editar"] },
  { module: "Promolog", submodules: [] },
  { module: "LeadGen", submodules: [] },
  { module: "Closers", submodules: [] },
  { module: "Tickets", submodules: [] },
  { module: "Tareas", submodules: ["Proyectos", "Tareas"] },
  { module: "Administración", submodules: ["Usuarios", "Roles"] },
];

export const useRoles = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["roles-config"],
    queryFn: async () => {
      const { data: rolesData, error } = await supabase
        .from("roles_config")
        .select("*")
        .order("created_at");

      if (error) throw error;

      // Get user counts per role
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name");

      const profilesMap = new Map<string, string>();
      profiles?.forEach((p) => profilesMap.set(p.id, p.full_name || "Sin nombre"));

      return (rolesData || []).map((r) => {
        const usersWithRole = (userRoles || []).filter((ur) => ur.role === r.name);
        return {
          ...r,
          user_count: usersWithRole.length,
          user_names: usersWithRole.map((ur) => profilesMap.get(ur.user_id) || "Sin nombre"),
        };
      }) as RoleConfig[];
    },
  });

  const createRole = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { error } = await supabase.from("roles_config").insert({ name, description });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      toast({ title: "Rol creado exitosamente" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { error } = await supabase.from("roles_config").update({ name, description }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      toast({ title: "Rol actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roles_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      toast({ title: "Rol eliminado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("roles_config").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return {
    roles,
    isLoading,
    createRole: createRole.mutate,
    updateRole: updateRole.mutate,
    deleteRole: deleteRole.mutate,
    toggleActive: toggleActive.mutate,
    isCreating: createRole.isPending,
    isUpdating: updateRole.isPending,
    isDeleting: deleteRole.isPending,
  };
};

export const useRolePermissions = (roleId: string | null) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ["role-permissions", roleId],
    enabled: !!roleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .eq("role_id", roleId!);
      if (error) throw error;
      return data as RolePermission[];
    },
  });

  const savePermissions = useMutation({
    mutationFn: async (perms: RolePermission[]) => {
      if (!roleId) throw new Error("No role selected");
      // Delete existing
      await supabase.from("role_permissions").delete().eq("role_id", roleId);
      // Insert new
      if (perms.length > 0) {
        const { error } = await supabase.from("role_permissions").insert(
          perms.map((p) => ({
            role_id: roleId,
            module: p.module,
            submodule: p.submodule,
            can_access: p.can_access,
            data_scope: p.data_scope,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions", roleId] });
      toast({ title: "Permisos guardados exitosamente" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return { permissions, isLoading, savePermissions: savePermissions.mutate, isSaving: savePermissions.isPending };
};
