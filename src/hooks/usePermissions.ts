import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface Permission {
  module: string;
  submodule: string | null;
  can_access: boolean;
  data_scope: string;
}

export const usePermissions = () => {
  const { role, isAdmin, isLoading: roleLoading } = useUserRole();

  const { data: permissions = [], isLoading: permsLoading } = useQuery({
    queryKey: ["user-permissions", role],
    queryFn: async () => {
      if (!role) return [];

      // Find the roles_config entry matching the user's role name
      const { data: roleConfig } = await supabase
        .from("roles_config")
        .select("id")
        .eq("name", role)
        .eq("is_active", true)
        .maybeSingle();

      if (!roleConfig) return [];

      const { data, error } = await supabase
        .from("role_permissions")
        .select("module, submodule, can_access, data_scope")
        .eq("role_id", roleConfig.id);

      if (error) throw error;
      return (data || []) as Permission[];
    },
    enabled: !!role && !isAdmin, // Admin gets full access, skip query
    staleTime: 5 * 60 * 1000,
  });

  // Modules that are universally accessible regardless of permissions
  const UNIVERSAL_MODULES = ["Dashboard", "Messenger"];

  const canAccess = (module: string, submodule?: string): boolean => {
    // Admin always has full access
    if (isAdmin) return true;

    // Universal modules are always accessible
    if (UNIVERSAL_MODULES.includes(module)) return true;

    // If no permissions configured for this role, DENY access (restrictive fallback)
    if (permissions.length === 0) return false;

    // Check specific submodule permission first
    if (submodule) {
      const specific = permissions.find(
        (p) => p.module === module && p.submodule === submodule
      );
      if (specific) return specific.can_access;
    }

    // Check module-level permission
    const moduleLevel = permissions.find(
      (p) => p.module === module && !p.submodule
    );
    if (moduleLevel) return moduleLevel.can_access;

    // If the module has any submodule permissions, check if any grant access
    const modulePerms = permissions.filter((p) => p.module === module);
    if (modulePerms.length > 0) {
      return modulePerms.some((p) => p.can_access);
    }

    // No permission configured for this module — allow by default
    return true;
  };

  const dataScope = (module: string): "all" | "subordinates" | "self" => {
    if (isAdmin) return "all";

    const perm = permissions.find(
      (p) => p.module === module && !p.submodule
    );
    return (perm?.data_scope as "all" | "subordinates" | "self") ?? "all";
  };

  return {
    canAccess,
    dataScope,
    isLoading: roleLoading || permsLoading,
    permissions,
  };
};
