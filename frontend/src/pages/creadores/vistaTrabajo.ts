import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * ¿El perfil de la creadora se está abriendo como VISTA DE TRABAJO?
 *
 * Un chatter llega al perfil por su roster de Horarios (`CreadorRosterRoute`
 * + `chatter_can_view_creator`) SIN tener el módulo Creadores. Ahí no
 * corresponde la ficha de gestión completa sino lo que necesita para escribir
 * como ella: personaje y voz, menú de precios, protocolo de respuesta,
 * lineamientos y redes públicas.
 *
 * Lo que la vista de trabajo NO muestra:
 *  · **Nada del número de contacto** — el teléfono ya sale enmascarado de la
 *    BD (`v_creators`, `mask_phone`), y acá se van además los botones de
 *    WhatsApp/Telegram, que son el número en forma de acción.
 *  · La ficha técnica en PDF (es un volcado de todos los campos).
 *  · Documentos (cédula, selfies), Notas internas, Monetización, Tickets e
 *    Historial. RLS tampoco se los abre, así que se verían vacíos.
 *  · Cualquier edición: foto, estado, verificación, offboarding, redes.
 *
 * El rol legacy `agent` ya tenía esta vista reducida (por `isAgent` suelto en
 * cada componente); ahora los dos casos comparten una sola regla.
 */
export function useVistaTrabajo() {
  const { canAccess, isLoading } = usePermissions();
  const { isAgent } = useUserRole();
  return {
    cargando: isLoading,
    vistaTrabajo: isAgent || !canAccess("Creadores", "Perfil"),
  };
}
