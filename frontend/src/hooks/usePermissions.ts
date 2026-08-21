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

  // Modules everyone can reach unless an admin explicitly turned them
  // off in the role config. The check happens AFTER explicit perm
  // lookup so a `can_access: false` row still wins; this matters for
  // backwards compat — roles saved before a given module existed have
  // no row for it and would otherwise lose access on deploy.
  // "Correo" entra acá porque es parte de la suite que reemplaza a Google
  // (como Messenger/Cowork/Meet): la casilla se provisiona en el alta y la
  // pestaña tiene que estar ahí sin que nadie configure permisos. Quien no
  // tenga casilla ve un estado vacío que se lo explica, y un admin puede
  // apagarlo por rol con can_access: false, que siempre gana.
  const UNIVERSAL_MODULES = ["Dashboard", "Messenger", "Cowork", "Meet", "Correo", "Grabaciones"];

  const canAccess = (module: string, submodule?: string): boolean => {
    // Admin always has full access
    if (isAdmin) return true;

    // No permissions configured for this role at all → only universal
    // modules are reachable (everything else is locked).
    if (permissions.length === 0) {
      return UNIVERSAL_MODULES.includes(module);
    }

    // Check specific submodule permission first
    if (submodule) {
      const specific = permissions.find(
        (p) => p.module === module && p.submodule === submodule,
      );
      if (specific) return specific.can_access;
    }

    // Check module-level permission
    const moduleLevel = permissions.find(
      (p) => p.module === module && !p.submodule,
    );
    if (moduleLevel) return moduleLevel.can_access;

    // If the module has any submodule permissions, check if any grant access
    const modulePerms = permissions.filter((p) => p.module === module);
    if (modulePerms.length > 0) {
      return modulePerms.some((p) => p.can_access);
    }

    // Nothing configured for this module on this role — fall back to
    // universal so roles saved before this module existed still work.
    if (UNIVERSAL_MODULES.includes(module)) return true;

    return false;
  };

  // Permiso EXPLÍCITO de una acción: true/false si el rol tiene fila para ella,
  // `null` si no tiene ninguna. Distinguir "no hay fila" de "está en false" es lo
  // que permite que una acción caiga a su default (p. ej. el nivel de acceso del
  // rol) sin pisar lo que un admin configuró a mano.
  //
  // `canAccess` NO sirve para esto: cuando no encuentra fila específica cae al
  // permiso del módulo, y para los módulos universales (Dashboard, Messenger,
  // Cowork) eso es `true` para todo el mundo — o sea, cualquier acción quedaría
  // habilitada por defecto.
  //
  // Espeja `can_use_module_function()` en la DB, que es la que realmente decide
  // del lado del servidor.
  const explicitPermission = (module: string, submodule: string): boolean | null => {
    if (isAdmin) return true;
    const row = permissions.find(
      (p) => p.module === module && p.submodule === submodule,
    );
    return row ? row.can_access : null;
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
    explicitPermission,
    dataScope,
    isLoading: roleLoading || permsLoading,
    permissions,
  };
};
