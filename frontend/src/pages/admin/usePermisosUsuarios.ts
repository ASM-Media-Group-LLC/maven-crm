import { useFuncionesPosicion } from "@/hooks/useFuncionesPosicion";
import { usePermissions } from "@/hooks/usePermissions";

export function usePermisosUsuarios() {
  const { canAccess, canFunction, isLoading } = usePermissions();
  const posiciones = useFuncionesPosicion();
  const entra = canAccess("Administración", "Usuarios");
  return {
    agregar: entra && canFunction("N:usr.agregar", true),
    editar: entra && canFunction("N:usr.editar", true),
    desactivar: entra && canFunction("N:usr.desactivar", true),
    reset: entra && canFunction("N:usr.reset", true),
    asignar: entra && canFunction("N:usr.asignar", true),
    posiciones: posiciones.data?.aplica === true,
    cargando: isLoading,
  };
}
