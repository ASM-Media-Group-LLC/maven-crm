import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";

// Nivel de capacidad de un rol → flags de role_groups (la capa de RLS). Un rol
// DEBE tener su fila en role_groups o is_in_role_group() le da false a TODO (sin
// acceso a nivel DB, aunque tenga permisos de menú en role_permissions). El
// frontend setea el nivel desde el modal; el trigger tg_roles_config_sync_role_groups
// garantiza que la fila exista igual (default miembro) para cualquier vía.
export type RoleTier = "member" | "supervisor" | "manager" | "admin";

export const ROLE_TIER_FLAGS: Record<RoleTier, {
  is_admin: boolean; is_manager_or_above: boolean; is_supervisor_or_above: boolean; is_member: boolean;
}> = {
  member:     { is_admin: false, is_manager_or_above: false, is_supervisor_or_above: false, is_member: true },
  supervisor: { is_admin: false, is_manager_or_above: false, is_supervisor_or_above: true,  is_member: true },
  manager:    { is_admin: false, is_manager_or_above: true,  is_supervisor_or_above: true,  is_member: true },
  admin:      { is_admin: true,  is_manager_or_above: true,  is_supervisor_or_above: true,  is_member: true },
};

export const ROLE_TIER_LABELS: Record<RoleTier, string> = {
  member: "Miembro — solo lo suyo",
  supervisor: "Supervisor — ve a su equipo",
  manager: "Manager — gestión amplia",
  admin: "Admin — acceso total",
};

// Etiqueta corta para badges en la lista/grid.
export const ROLE_TIER_SHORT: Record<RoleTier, string> = {
  member: "Miembro",
  supervisor: "Supervisor",
  manager: "Manager",
  admin: "Admin",
};

function flagsToTier(
  g?: { is_admin?: boolean; is_manager_or_above?: boolean; is_supervisor_or_above?: boolean } | null,
): RoleTier {
  if (!g) return "member";
  if (g.is_admin) return "admin";
  if (g.is_manager_or_above) return "manager";
  if (g.is_supervisor_or_above) return "supervisor";
  return "member";
}

export interface RoleMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface RoleConfig {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  ai_daily_quota: number | null; // cuota diaria del copiloto IA del inbox para el rol (null = default 20)
  tier: RoleTier; // nivel de capacidad RLS (derivado de role_groups)
  created_at: string;
  updated_at: string;
  user_count: number;
  user_names: string[];
  members: RoleMember[];
}

export interface RolePermission {
  id?: string;
  role_id: string;
  module: string;
  submodule: string | null;
  can_access: boolean;
  data_scope: string;
}

// Grouped + ordered to mirror the live sidebar so admins flip access in
// the same shape they see in the app. The `group` is just a label for
// the section header in the permissions modal — runtime checks only
// look at `module` + `submodule` (a flat string).
//
// Cada módulo separa sus submódulos en DOS clases (estilo BLU), para que el
// modal de permisos deje CLARO qué es navegable y qué es una acción:
//   • subtabs   → secciones NAVEGABLES (tabs/páginas a las que el usuario entra).
//                 Van en la columna "Menús". Pueden anidarse vía `parent`
//                 (ej. "Perfil: Info" cuelga de "Perfil"; "Calls" de "Closers QA").
//   • functions → ACCIONES/botones gateados (Crear/Editar/Eliminar/Exportar/Asignar…).
//                 Van en la columna "Permisos de función".
// `submodules` es la unión derivada (subtabs+functions) que consume la lógica
// de carga/copia/guardado — la DB sigue guardando filas planas (module, submodule).
// Clasificación validada contra el código vivo (auditoría 2026-06-29).
export interface SubtabDef {
  name: string;     // string EXACTO de role_permissions.submodule
  parent?: string;  // nombre del subtab padre (anidación de 2 niveles); vacío = nivel raíz
}
export interface ModuleConfig {
  group: string;
  module: string;
  subtabs: SubtabDef[];
  functions: string[];
  submodules: string[]; // DERIVADO (no editar a mano) — unión para load/copy/save
}

// Builder: normaliza subtabs (string | SubtabDef) y computa `submodules`.
const def = (
  group: string,
  module: string,
  subtabs: Array<string | SubtabDef> = [],
  functions: string[] = [],
): ModuleConfig => {
  const subs: SubtabDef[] = subtabs.map((s) => (typeof s === "string" ? { name: s } : s));
  return { group, module, subtabs: subs, functions, submodules: [...subs.map((s) => s.name), ...functions] };
};

// Nombre VISIBLE del módulo en la UI de permisos. La KEY (p.ej. "Creator Sales") se conserva en
// role_permissions / PermissionRoute / canAccess; esto es solo cosmético para no confundir al usuario.
const MODULE_LABELS: Record<string, string> = { "Creator Sales": "Ventas" };
export const moduleLabel = (module: string): string => MODULE_LABELS[module] ?? module;

export const MODULES_CONFIG: ModuleConfig[] = [
  // === Menú principal ===
  def("Menú", "Dashboard"),
  // Panel de control: dashboard ejecutivo con tabs internos.
  def("Menú", "Panel de control", ["Modelos", "Chatters Reclutamiento", "Cuentas Spammer", "Control de Gasto", "Bot WhatsApp"]),
  // Messenger: chat interno. (El borrado de conversación es por dueño/admin del grupo,
  // no por permiso — por eso ya no se declara un submódulo que no gateaba nada.)
  def("Menú", "Messenger"),
  // Cowork: "Crear sesión" es acción de coordinación. Sin fila explícita el gate
  // cae al nivel de acceso (supervisor+); marcarla acá permite dársela a un rol
  // de nivel miembro, o quitársela a un supervisor, sin tocar código.
  def("Menú", "Cowork", [], ["Crear sesión"]),
  // Meet: reuniones ad-hoc. Crear la puede cualquiera por default (a diferencia de
  // Cowork), pero queda acá para poder quitárselo a un rol desde la UI.
  def("Menú", "Meet", [], ["Crear reunión", "Terminar reunión"]),
  // Contactos: subtabs de navegación + acciones de edición/borrado.
  def("Menú", "Contactos", ["Dashboard", "Contactos"], ["Crear Contacto", "Editar Contacto", "Eliminar Contacto", "Ver Teléfonos"]),
  // Creadores: subtabs del listado + tabs ANIDADOS del perfil (parent "Perfil") + acciones críticas.
  def("Menú", "Creadores",
    [
      "Dashboard", "Lista", "Onboarding", "Offboarding", "Personalizados", "Perfil",
      { name: "Perfil: Info", parent: "Perfil" }, { name: "Perfil: Lineamientos", parent: "Perfil" },
      { name: "Perfil: Redes", parent: "Perfil" }, { name: "Perfil: Monetización", parent: "Perfil" },
      { name: "Perfil: Documentos", parent: "Perfil" }, { name: "Perfil: Notas", parent: "Perfil" },
      { name: "Perfil: Tickets", parent: "Perfil" }, { name: "Perfil: Historial", parent: "Perfil" },
    ],
    ["Nuevo", "Editar Creator", "Eliminar Creator", "Editar Blu CRM", "Editar Banking", "Cambiar Plataforma"],
  ),
  def("Menú", "Creator Sales", ["Dashboard", "Reportes", "IA Ventas", "Auditoría"]),

  // === Operaciones ===
  // Promolog: Promos (tabla) + Promobot (control del pipeline, gateado por rol).
  def("Operaciones", "Promolog", ["Promos", "Promobot"]),
  // LeadGen: vistas internas + acciones de crear/eliminar entradas.
  def("Operaciones", "LeadGen", ["Dashboard", "Lista", "Agentes", "Supervisores", "Rendimiento"], ["Crear Entrada", "Eliminar Entradas"]),
  // Closers: subtabs de navegación (Dashboard / Actividad / Operaciones / Oportunidades) + acciones.
  // (Los antiguos "Ver Todas/Nuevo/…" eran filtros de estado dentro de Operaciones, NO subtabs.)
  def("Operaciones", "Closers", ["Dashboard", "Actividad", "Operaciones", "Oportunidades"],
    ["Editar Status", "Asignar Closer", "Editar Comisiones", "Convertir a Creadora"]),
  // Teléfonos (cloud phones): Dashboard (uso/stats) + Dispositivos (grilla).
  def("Operaciones", "Telefonos", ["Dashboard", "Dispositivos"]),
  // Inbox WhatsApp: Bandeja + Canales (navegables) · IA (copiloto ✨) y Asignar (reasignar) = acciones.
  def("Operaciones", "WhatsApp", ["Bandeja", "Canales", "Analítica"], ["IA", "Asignar conversaciones"]),
  // Telegram (canal): "Cuentas" (vincular cuenta en el gateway) + "Bandeja" (recibir/responder)
  // + función "Asignar conversaciones" — espejo de WhatsApp.
  def("Operaciones", "Telegram", ["Cuentas", "Bandeja"], ["Asignar conversaciones"]),
  // Tickets: subtabs (Lista/Calendario) + acciones.
  def("Operaciones", "Tickets", ["Lista de Tickets", "Calendario"], ["Crear Ticket", "Editar Ticket", "Eliminar Ticket", "Asignar Ticket"]),
  def("Operaciones", "Chatters", ["Evaluator", "Workspace", "Admin"], ["Borrar Historial"]),
  // Scouter Assist: 8 subtabs navegables + 3 acciones dentro de Settings (gastan créditos / disparan RPCs).
  def("Operaciones", "Scouter Assist",
    ["Home", "Busquedas", "Favoritas", "Leads", "Funnel", "Mis Tareas", "Alertas", "Settings"],
    ["Editar Compañías", "Recomputar Lookalike", "Generar Tareas"]),
  // Agency QA: rail izquierdo (4 categorías por rol) → subtabs internos anidados.
  //   Closers QA → Calls/New QA/QA History/QA Chat/Models/Notifications
  //   Chatters QA → Chatters: Scorecard/QA Cualitativo/Masivos/Hubstaff/Notificaciones
  // Si un rol no tiene "Closers QA" on, todo ese grupo desaparece aunque tenga "Calls".
  def("Operaciones", "Agency QA",
    [
      "Closers QA",
      { name: "Calls", parent: "Closers QA" }, { name: "Closers: Hubstaff", parent: "Closers QA" },
      { name: "Closers: Asistencia", parent: "Closers QA" }, { name: "Closers: Anomalías", parent: "Closers QA" },
      { name: "New QA", parent: "Closers QA" },
      { name: "QA History", parent: "Closers QA" }, { name: "QA Chat", parent: "Closers QA" },
      { name: "Models", parent: "Closers QA" }, { name: "Notifications", parent: "Closers QA" },
      "Chatters QA",
      { name: "Chatters: Scorecard", parent: "Chatters QA" }, { name: "Chatters: QA Cualitativo", parent: "Chatters QA" },
      { name: "Chatters: Masivos", parent: "Chatters QA" }, { name: "Chatters: Hubstaff", parent: "Chatters QA" },
      { name: "Chatters: Asistencia", parent: "Chatters QA" },
      { name: "Chatters: Anomalías", parent: "Chatters QA" },
      { name: "Chatters: Notificaciones", parent: "Chatters QA" },
      "Managers QA", "LLG QA",
    ],
    ["Borrar Calls"],
  ),

  // === Finanzas ===
  def("Finanzas", "Finanzas", ["Dashboard", "Collections", "Nómina", "Horas Variables", "Invoices", "Templates", "Control Financiero", "Reportes", "Configuración"]),

  // === Recursos Humanos ===
  def("Recursos Humanos", "HR", [
    "Dashboard", "Candidatos", "Onboarding", "Empleados Activos", "Offboarding", "Asistencia",
    "Horarios", "Horarios Chatters",
    { name: "Horas Extra", parent: "Horarios" }, { name: "Banco de Horas", parent: "Horarios" },
    "Vacaciones", "Permisos", "Monitoreo", "Incidentes", "Desempeño", "Capacitación",
    "Directorio", "Organigrama", "Deducciones", "Anuncios",
  ]),

  // === Configuración / Settings ===
  // "Roles" es una pestaña interna de Usuarios (CRUD de roles) → es una ACCIÓN, no un subtab navegable.
  def("Configuración", "Administración", ["Usuarios", "Auditoría"], ["Roles"]),
  def("Configuración", "ProyectoMP"),
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
        .select("id, full_name, avatar_url");

      // role_groups = capacidades RLS por rol. Lo unimos por nombre para mostrar
      // (y editar) el nivel de cada rol.
      const { data: roleGroups } = await supabase
        .from("role_groups")
        .select("role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member");
      const groupsMap = new Map<string, { is_admin: boolean; is_manager_or_above: boolean; is_supervisor_or_above: boolean }>();
      roleGroups?.forEach((g) => groupsMap.set(g.role_name, g));

      const profilesMap = new Map<string, { full_name: string; avatar_url: string | null }>();
      profiles?.forEach((p) =>
        profilesMap.set(p.id, { full_name: p.full_name || "Sin nombre", avatar_url: p.avatar_url ?? null })
      );

      return (rolesData || []).map((r) => {
        const usersWithRole = (userRoles || []).filter((ur) => ur.role === r.name);
        const members: RoleMember[] = usersWithRole.map((ur) => {
          const p = profilesMap.get(ur.user_id);
          return {
            id: ur.user_id,
            full_name: p?.full_name || "Sin nombre",
            avatar_url: p?.avatar_url ?? null,
          };
        });
        return {
          ...r,
          tier: flagsToTier(groupsMap.get(r.name)),
          user_count: usersWithRole.length,
          user_names: members.map((m) => m.full_name),
          members,
        };
      }) as RoleConfig[];
    },
  });

  const createRole = useMutation({
    mutationFn: async ({ name, description, tier = "member" }: { name: string; description?: string; tier?: RoleTier }) => {
      const { error } = await supabase.from("roles_config").insert({ name, description });
      if (error) throw error;
      // Cablear role_groups (capacidades RLS) con el nivel elegido. SIN esto el
      // rol nacía sin acceso a nivel DB (bug histórico). El admin puede escribir
      // role_groups (policy "Only admins can modify role_groups"). El trigger ya
      // garantiza una fila default; este upsert fija el nivel real.
      const { error: rgError } = await supabase
        .from("role_groups")
        .upsert({ role_name: name, ...ROLE_TIER_FLAGS[tier], description, updated_at: new Date().toISOString() },
          { onConflict: "role_name" });
      if (rgError) throw rgError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      toast({ title: "Rol creado exitosamente" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, name, description, ai_daily_quota, tier }: { id: string; name: string; description?: string; ai_daily_quota?: number | null; tier?: RoleTier }) => {
      const patch: Record<string, unknown> = { name, description };
      if (ai_daily_quota !== undefined) patch.ai_daily_quota = ai_daily_quota;
      const { error } = await supabase.from("roles_config").update(patch).eq("id", id);
      if (error) throw error;
      // Si cambió el nombre, el trigger ya renombró role_groups + user_roles.
      // Acá fijamos el NIVEL (capacidades RLS) por el nombre actual.
      if (tier) {
        const { error: rgError } = await supabase
          .from("role_groups")
          .upsert({ role_name: name, ...ROLE_TIER_FLAGS[tier], updated_at: new Date().toISOString() },
            { onConflict: "role_name" });
        if (rgError) throw rgError;
      }
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

  // Asignar un usuario a un rol. Backend usa "1 rol por usuario": si el user ya tenía otro rol, se reemplaza.
  const assignUserToRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return adminInvoke("manage-user-roles", { action: "assign_role", user_id: userId, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Usuario asignado" });
    },
    onError: (e: Error) => {
      if (e instanceof SessionExpiredError) {
        toast({ title: "Sesión expirada", description: e.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  // Quitar a un usuario de un rol (deja al user sin rol asignado).
  const removeUserFromRole = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return adminInvoke("manage-user-roles", { action: "remove_role", user_id: userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Usuario removido del rol" });
    },
    onError: (e: Error) => {
      if (e instanceof SessionExpiredError) {
        toast({ title: "Sesión expirada", description: e.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  return {
    roles,
    isLoading,
    createRole: createRole.mutate,
    updateRole: updateRole.mutate,
    deleteRole: deleteRole.mutate,
    toggleActive: toggleActive.mutate,
    assignUserToRole: assignUserToRole.mutate,
    removeUserFromRole: removeUserFromRole.mutate,
    isCreating: createRole.isPending,
    isUpdating: updateRole.isPending,
    isDeleting: deleteRole.isPending,
    isAssigning: assignUserToRole.isPending,
    isRemoving: removeUserFromRole.isPending,
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
