import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { moduloEstaOculto } from "@/lib/modulosOcultos";

interface Permission {
  module: string;
  submodule: string | null;
  can_access: boolean;
  data_scope: string;
}

// Modules everyone can reach unless an admin explicitly turned them off in the role
// config. Exportada porque SetPermissionsModal la necesita: un modulo universal SIN
// fila guardada tiene que mostrarse ENCENDIDO, que es como se comporta de verdad.
// Si arrancara apagado, abrir un rol y guardar le quitaria un acceso que hoy tiene.
// ⚠️ "Universal" = visible por default para todo rol, NO "sin control": el
// admin puede apagárselo a un rol desde la pantalla de Roles, y lo que cada
// persona ve adentro lo sigue decidiendo la RLS (en Oficina, dueño o equipo).
// Oficina entró el 17/09/2026 por pedido de Jhon: la usa todo el mundo.
export const UNIVERSAL_MODULES = ["Dashboard", "Messenger", "Cowork", "Meet", "Correo", "Grabaciones", "Oficina"];

export const usePermissions = () => {
  const { role, isAdmin, isLoading: roleLoading, isError: roleError, roleConocido, recargarRol } = useUserRole();

  const {
    data: permissionsData, isLoading: permsLoading, isError: permsError, refetch: recargarPermisos,
  } = useQuery({
    queryKey: ["user-permissions", role],
    queryFn: async () => {
      if (!role) return [];

      // Find the roles_config entry matching the user's role name
      const { data: roleConfig, error: rcError } = await supabase
        .from("roles_config")
        .select("id")
        .eq("name", role)
        .eq("is_active", true)
        .maybeSingle();

      // ⚠️ Un fallo NO es "rol sin configurar". Tragarse el error devolvía []
      // y la app concluía "solo módulos universales": menú recortado y
      // PermissionRoute sacando a la persona del evaluador en pleno roleplay
      // (John Idrobo, 07/10: "se cerró el roleplay solo"). Con throw,
      // react-query conserva los permisos anteriores y marca el error.
      if (rcError) throw rcError;
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
    // Igual que el rol: de esto depende todo lo que se ve, así que se reintenta
    // más que el resto de la app (ver la nota en useUserRole).
  });

  const permissions = permissionsData ?? [];

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

  const canAccess = (module: string, submodule?: string): boolean => {
    // Admin always has full access
    if (isAdmin) return true;

    // Recorte reversible del menú (lib/modulosOcultos.ts): esconde módulos/
    // submódulos enteros PARA EL EQUIPO sin borrar nada. Va DESPUÉS del bypass de
    // admin (el admin los sigue viendo) y ANTES de los permisos de rol, así que
    // esconde aunque el rol tenga el módulo concedido. Tapa menú y rutas de una.
    if (moduloEstaOculto(module, submodule)) return false;

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
    /**
     * No pudimos averiguar qué puede ver esta persona.
     *
     * ⚠️ Hay que mirarlo SIEMPRE antes de dibujar algo basado en `canAccess`.
     * Cuando falla, `canAccess` cae a los módulos universales (Dashboard,
     * Messenger, Cowork, Meet, Correo, Grabaciones) — que es lo correcto por
     * seguridad, pero presentarlo como si fuera la verdad deja el menú
     * recortado y parece que la sesión se cayó. Ojo: la consulta de permisos
     * está deshabilitada mientras no haya rol, así que si el rol falla NINGUNA
     * de las dos queda "cargando" y sin esto la app se cree lista.
     */
    // Solo cuenta como error si NO tenemos nada que usar: con permisos ya
    // cargados, un refetch fallido (foco de ventana, bache de red) se queda
    // con los anteriores y la pantalla no se desmonta. Antes, un fallo en
    // segundo plano reemplazaba el evaluador por "No pudimos verificar".
    hayError: (roleError && !roleConocido) || (permsError && permissionsData === undefined),
    reintentar: () => { void recargarRol(); void recargarPermisos(); },
    permissions,
  };
};
