// Jerarquía de roles para la gestión de usuarios (24/08, pedido de Jhon).
//
// Regla: nadie puede asignar un rol de nivel >= al suyo, ni borrar/resetear una
// cuenta de nivel >= al suyo. Solo `admin` (role_groups.is_admin) saltea la escalera.
// Niveles en roles_config.level — admin 100 · HHRR 90 · manager 80 · supervisores 50
// · operativos 20 · employee 10.
//
// LA AUTORIZACIÓN REAL VIVE ACÁ Y EN public.can_manage_user (SECURITY DEFINER).
// Que el frontend esconda botones es UX, no seguridad: cualquiera puede llamar
// la edge function a mano.
const MSG: Record<string, string> = {
  no_caller: "No se pudo identificar quién hace la petición",
  no_user_management_permission: "No tienes permiso para gestionar usuarios",
  role_at_or_above_caller_level: "No puedes asignar un rol de tu mismo nivel o superior",
  target_level_not_below_caller: "No puedes actuar sobre una cuenta de tu mismo nivel o superior",
  unknown_target_role: "Esa cuenta tiene un rol que no reconozco; solo un admin puede tocarla",
  invalid_or_inactive_role: "Rol inválido o inactivo",
  self_target_not_allowed: "No puedes hacer esto sobre tu propia cuenta",
  last_admin: "No puedes dejar el sistema sin ningún admin",
  no_target: "Falta el usuario objetivo",
  unknown_action: "Acción no permitida",
};

// PromiseLike y no Promise: el `rpc()` de supabase-js devuelve un
// PostgrestFilterBuilder (thenable), que no cumple la interfaz Promise completa.
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<
    { data: unknown; error: { message: string } | null }
  >;
};

export type Guard = { ok: true } | { ok: false; status: number; body: Record<string, unknown> };

export async function assertCanManage(
  adminClient: RpcClient,
  callerId: string,
  targetId: string | null,
  action: string,
  newRole?: string | null,
): Promise<Guard> {
  const { data, error } = await adminClient.rpc("can_manage_user", {
    _caller: callerId,
    _target: targetId,
    _action: action,
    _new_role: newRole ?? null,
  });
  // FALLA CERRADO: si la RPC no responde, no se autoriza nada.
  if (error) {
    console.error("[user-hierarchy] can_manage_user falló:", error.message);
    return { ok: false, status: 500, body: { error: "No se pudo verificar permisos" } };
  }
  const v = (data ?? {}) as {
    allowed?: boolean; reason?: string; caller_level?: number; target_level?: number;
  };
  if (v.allowed === true) return { ok: true };
  const reason = v.reason ?? "denied";
  return {
    ok: false,
    status: 403,
    body: {
      error: MSG[reason] ?? "No autorizado",
      reason,
      caller_level: v.caller_level,
      target_level: v.target_level,
    },
  };
}
