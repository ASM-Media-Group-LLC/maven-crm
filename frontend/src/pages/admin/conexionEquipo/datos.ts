import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminInvoke } from "@/lib/adminInvoke";
import { useLanguage } from "@/hooks/useLanguage";
import { leerSync, partirNombre, type FilaSync, type Sync } from "@/lib/conexionEquipo/resumen";
import type { LlaveConWebhook } from "../ApiKeyWebhook";
import type { NuevoUsuario } from "../AddUserModal";

// Lo que lee y escribe Ajustes → Conectar tu plataforma. Todo pasa por la RLS de la
// sesión: integracion_equipo, sus envíos y sus pendientes los ven los admins y el
// dueño de la agencia (current_tenant_id()); el modo lo cambia solo el dueño.
//
// ⚠️ Un fallo NO es «vacío»: cada consulta tira su error y la pantalla lo dice con
// Reintentar. PostgREST contesta [] cuando no hay filas y un error cuando falla.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Respuesta = Promise<{ data: any; error: { message: string } | null }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => Respuesta };

export const CLAVE = {
  integracion: ["conexion-equipo", "integracion"] as const,
  syncs: ["conexion-equipo", "syncs"] as const,
  pendientes: ["conexion-equipo", "pendientes"] as const,
  roles: ["conexion-equipo", "roles-sin-permisos"] as const,
  // La misma lista que Ajustes → API keys: una sola caché, así el diálogo del webhook
  // (que escribe en ["api-keys"]) se ve igual en las dos pantallas.
  llaves: ["api-keys"] as const,
};

/** integracion_equipo.ultima_sync: el resumen corto del último envío. */
export type UltimaSyncCorta = {
  sync_id?: string; ensayo?: boolean; recibidas?: number; cambios?: number; aplicados?: number; rechazados?: number;
};
export type Integracion = {
  tenant_id: string;
  aplicar: boolean;
  ultima_sync: UltimaSyncCorta | null;
  ultima_sync_at: string | null;
};
export type Pendiente = {
  id: string;
  correo: string;
  nombre: string | null;
  rol: string | null;
  nivel: string | null;
  equipo: string | null;
  reporta_a_correo: string | null;
  veces: number | null;
  primera_vez: string | null;
  ultima_vez: string | null;
  estado: string;
};
export type RolSinPermisos = { nombre: string; creado_at: string | null };
export type LlaveApi = LlaveConWebhook & { created_at: string };
export type ListaLlaves = { keys: LlaveApi[]; you?: { id: string; name: string | null }; webhooks_unknown?: boolean };

/** La fila de la agencia. null = la agencia todavía no la tiene (nace con el primer
 *  envío): no es un error, pero tampoco se puede cambiar el modo todavía. */
export function useIntegracion() {
  return useQuery({
    queryKey: CLAVE.integracion,
    queryFn: async (): Promise<Integracion | null> => {
      const { data, error } = await sinTipar
        .from("integracion_equipo")
        .select("tenant_id, aplicar, ultima_sync, ultima_sync_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Integracion | null) ?? null;
    },
  });
}

/** Los últimos envíos, el más nuevo primero. */
export function useSyncs() {
  return useQuery({
    queryKey: CLAVE.syncs,
    queryFn: async (): Promise<Sync[]> => {
      const { data, error } = await sinTipar
        .from("integracion_equipo_syncs")
        .select("id, created_at, ultima_vez, repeticiones, ensayo, recibidas, resumen, aplicados, rechazados_base")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("integracion_equipo_syncs");
      return (data as FilaSync[]).map(leerSync);
    },
  });
}

export function usePendientes() {
  return useQuery({
    queryKey: CLAVE.pendientes,
    queryFn: async (): Promise<Pendiente[]> => {
      const { data, error } = await sinTipar
        .from("integracion_equipo_pendientes")
        .select("id, correo, nombre, rol, nivel, equipo, reporta_a_correo, veces, primera_vez, ultima_vez, estado")
        .eq("estado", "pendiente")
        .order("ultima_vez", { ascending: false });
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("integracion_equipo_pendientes");
      return data as Pendiente[];
    },
  });
}

export function useRolesSinPermisos() {
  return useQuery({
    queryKey: CLAVE.roles,
    queryFn: async (): Promise<RolSinPermisos[]> => {
      const { data, error } = await sinTipar.rpc("equipo_roles_sin_permisos");
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("equipo_roles_sin_permisos");
      return data as RolSinPermisos[];
    },
  });
}

/** Las API keys de la agencia (manage-api-keys, solo admins): de ahí sale si la
 *  plataforma está conectada y el webhook de su llave. */
export function useLlaves() {
  const { language } = useLanguage();
  return useQuery({
    queryKey: CLAVE.llaves,
    queryFn: () => adminInvoke<ListaLlaves>("manage-api-keys", { action: "list", lang: language }),
  });
}

/** Prender o apagar «Aplicar». La RLS deja hacerlo solo al dueño: si la base no
 *  devuelve la fila, no se cambió (no es un éxito silencioso). */
export async function cambiarModo(tenantId: string, aplicar: boolean): Promise<boolean> {
  const { data, error } = await sinTipar
    .from("integracion_equipo")
    .update({ aplicar })
    .eq("tenant_id", tenantId)
    .select("aplicar");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) throw new Error("sin_permiso");
  return (data[0] as { aplicar: boolean }).aplicar;
}

/** Lo que la pantalla necesita del alta. La respuesta de create_user trae también la
 *  contraseña temporal: se descarta aquí mismo, no pasa a ningún estado ni caché. */
export type Alta = { user_id: string; email_sent: boolean; email_sent_to: string | null; hand_delivery: boolean };

/** Crea la cuenta como «Agregar usuario» en Usuarios (admin-user-actions, create_user,
 *  modo correo externo): el login es su correo y el acceso le llega ahí. */
export async function crearCuenta(p: Pendiente, errorSinId: string): Promise<Alta> {
  const { first_name, last_name } = partirNombre(p.nombre, p.correo);
  const alta: NuevoUsuario = { first_name, last_name, email: p.correo.trim().toLowerCase(), ...(p.rol ? { role: p.rol } : {}) };
  const res = await adminInvoke<Record<string, unknown>>("admin-user-actions", { action: "create_user", ...alta });
  const user_id = typeof res?.user_id === "string" ? res.user_id : null;
  if (!user_id) throw new Error(errorSinId);
  return {
    user_id,
    email_sent: res.email_sent === true,
    email_sent_to: typeof res.email_sent_to === "string" ? res.email_sent_to : null,
    hand_delivery: res.hand_delivery === true,
  };
}

export async function resolverPendiente(id: string, accion: "aprobar" | "descartar", userId?: string): Promise<void> {
  const { error } = await sinTipar.rpc("equipo_pendiente_resolver", {
    _id: id, _accion: accion, ...(accion === "aprobar" ? { _user_id: userId } : {}),
  });
  if (error) throw new Error(error.message);
}
