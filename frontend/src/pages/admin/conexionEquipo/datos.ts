import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminInvoke } from "@/lib/adminInvoke";
import { useLanguage } from "@/hooks/useLanguage";
import { leerSync, partirNombre, type FilaSync, type Sync } from "@/lib/conexionEquipo/resumen";
import type { EntregaEquipo, WebhookCreado, WebhookEquipo } from "@/lib/conexionEquipo/webhook";
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
  webhooks: ["conexion-equipo", "webhooks"] as const,
  entregas: (id: string) => ["conexion-equipo", "webhook-entregas", id] as const,
  // La misma lista que Ajustes → API keys: una sola caché para las dos pantallas.
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
/** Lo que se usa de cada key de manage-api-keys (list). */
export type LlaveApi = {
  id: string; name: string; scopes: string[]; status: "active" | "revoked" | "expired"; created_at: string;
  acts_as?: { id: string; name: string | null; active: boolean | null } | null;
};
export type ListaLlaves = { keys: LlaveApi[]; you?: { id: string; name: string | null } };

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
 *  plataforma está conectada y en qué llave se registra el aviso. */
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

/** Lo que contesta equipo_pendiente_resolver. Aprobar dos veces la misma fila con la
 *  misma cuenta no es un error: devuelve lo mismo. */
export type Resuelto = { id: string; estado: string; user_id: string | null; equipo: string | null; reporta_a: string | null };

/** Los errores traen el código al principio («ya_resuelta: …»): ver textoDelErrorRpc. */
export async function resolverPendiente(id: string, accion: "aprobar" | "descartar", userId?: string): Promise<Resuelto | null> {
  const { data, error } = await sinTipar.rpc("equipo_pendiente_resolver", {
    _id: id, _accion: accion, ...(accion === "aprobar" ? { _user_id: userId } : {}),
  });
  if (error) throw new Error(error.message);
  return (data as Resuelto | null) ?? null;
}

// ── Los avisos del equipo (webhook): RPC propias, ver lib/conexionEquipo/webhook.ts ──

export function useWebhooksEquipo() {
  return useQuery({
    queryKey: CLAVE.webhooks,
    queryFn: async (): Promise<WebhookEquipo[]> => {
      const { data, error } = await sinTipar.rpc("equipo_webhooks");
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("equipo_webhooks");
      return data as WebhookEquipo[];
    },
  });
}

export function useEntregas(id: string | null, abierto: boolean) {
  return useQuery({
    queryKey: CLAVE.entregas(id ?? ""),
    enabled: abierto && !!id,
    // Mientras se mira, se relee: una prueba sale en menos de 30 s.
    staleTime: 0,
    refetchInterval: abierto ? 10_000 : false,
    queryFn: async (): Promise<EntregaEquipo[]> => {
      const { data, error } = await sinTipar.rpc("equipo_webhook_entregas", { _id: id, _limite: 20 });
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("equipo_webhook_entregas");
      return data as EntregaEquipo[];
    },
  });
}

/** Registra el aviso. Devuelve el secreto UNA vez: quien llama lo guarda solo en memoria. */
export async function crearWebhook(apiKeyId: string, url: string, eventos: string[] | null): Promise<WebhookCreado> {
  const { data, error } = await sinTipar.rpc("equipo_webhook_crear", { _api_key_id: apiKeyId, _url: url, _eventos: eventos });
  if (error) throw new Error(error.message);
  if (!data || typeof (data as { secreto?: unknown }).secreto !== "string") throw new Error("equipo_webhook_crear");
  return data as WebhookCreado;
}

export async function cambiarWebhook(id: string, accion: "pausar" | "reanudar" | "borrar"): Promise<void> {
  const { error } = await sinTipar.rpc("equipo_webhook_cambiar", { _id: id, _accion: accion });
  if (error) throw new Error(error.message);
}

export async function probarWebhook(id: string): Promise<string | null> {
  const { data, error } = await sinTipar.rpc("equipo_webhook_probar", { _id: id });
  if (error) throw new Error(error.message);
  return (data as { entrega_id?: string } | null)?.entrega_id ?? null;
}
