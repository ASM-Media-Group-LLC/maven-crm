import { usePermissions } from "@/hooks/usePermissions";

export function usePermisosUsuarios() {
  const { canAccess, canFunction, isLoading } = usePermissions();
  const entra = canAccess("Administración", "Usuarios");
  return {
    agregar: entra && canFunction("N:usr.agregar", true),
    editar: entra && canFunction("N:usr.editar", true),
    desactivar: entra && canFunction("N:usr.desactivar", true),
    reset: entra && canFunction("N:usr.reset", true),
    asignar: entra && canFunction("N:usr.asignar", true),
    cargando: isLoading,
  };
}
