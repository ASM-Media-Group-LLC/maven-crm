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
// look at `module` + `submodule`.
export interface ModuleConfig {
  group: string;
  module: string;
  submodules: string[];
}

export const MODULES_CONFIG: ModuleConfig[] = [
  // === Menú principal ===
  { group: "Menú",          module: "Dashboard",     submodules: [] },
  // Panel de control: dashboard ejecutivo. Tabs internos: modelos
  // (default), chatters reclutamiento, cuentas spammer, control de gasto.
  { group: "Menú",          module: "Panel de control", submodules: ["Modelos", "Chatters Reclutamiento", "Cuentas Spammer", "Control de Gasto"] },
  // Messenger: chat interno. La acción crítica es eliminar conversación.
  { group: "Menú",          module: "Messenger",     submodules: ["Eliminar Conversación"] },
  { group: "Menú",          module: "Cowork",        submodules: [] },
  // Contactos: tabs internos + acciones críticas de eliminar.
  { group: "Menú",          module: "Contactos",     submodules: ["Dashboard", "Contactos", "Crear Contacto", "Editar Contacto", "Eliminar Contacto"] },
  // Tareas: vistas + delete actions.
  { group: "Menú",          module: "Tareas",        submodules: ["List", "Kanban", "Analytics", "Docs", "Crear Proyecto", "Eliminar Proyecto", "Crear Tarea", "Eliminar Tarea"] },
  // Eventos: tabs del detalle del evento + delete.
  { group: "Menú",          module: "Eventos",       submodules: ["Invitados", "Checklist", "Historial", "Métricas", "Crear Evento", "Editar Evento", "Eliminar Evento"] },
  { group: "Menú",          module: "SuperContacts", submodules: ["Gráficas", "Productividad", "Agregar Handle", "Pegar Handles", "Importar Archivo"] }, // sidebar lo muestra como "Wishlist"
  // Creadores: tabs listado + tabs del perfil + acciones críticas de
  // edición / eliminación / cambios financieros.
  { group: "Menú",          module: "Creadores",     submodules: [
    "Dashboard", "Lista", "Onboarding", "Offboarding", "Personalizados", "Perfil", "Nuevo",
    "Perfil: Info", "Perfil: Lineamientos", "Perfil: Redes", "Perfil: Monetización", "Perfil: Documentos", "Perfil: Notas", "Perfil: Tickets", "Perfil: Historial",
    "Editar Creator", "Eliminar Creator", "Editar Banking", "Cambiar Plataforma",
  ] },
  { group: "Menú",          module: "Creator Sales", submodules: ["Dashboard", "Reportes", "IA Ventas", "Auditoría"] },

  // === Operaciones ===
  // Promobot = subtab de control del pipeline (lanzar análisis manual,
  // monitor de corridas, programación del cron). Default solo admin (se
  // siembran filas can_access=false para roles no-admin en migración);
  // marcable por rol desde acá.
  { group: "Operaciones",   module: "Promolog",      submodules: ["Promos", "Rendimiento", "Promobot"] },
  // LeadGen subtabs: rail interno + acciones críticas.
  { group: "Operaciones",   module: "LeadGen",       submodules: ["Dashboard", "Lista", "Crear Entrada", "Eliminar Entradas", "Exportar", "Agentes", "Supervisores", "Rendimiento"] },
  // Closers tabs top-level (Dashboard / Operaciones) + sub-tabs internos
  // de la tabla Operaciones (status filters) + acciones críticas.
  { group: "Operaciones",   module: "Closers",       submodules: [
    "Dashboard", "Operaciones", "Oportunidades",
    "Ver Todas", "Ver Nuevo", "Ver Asignadas", "Ver Confirmadas", "Ver Completadas", "Ver No Interesadas",
    "Editar Status", "Asignar Closer", "Editar Comisiones", "Convertir a Creadora", "Exportar",
  ] },
  // Teléfonos (cloud phones): subtabs Dashboard (uso/stats) + Dispositivos (la grilla de teléfonos).
  // Por defecto solo admin (sin fila => sin acceso). Habilitá "Dispositivos" a los closers; "Dashboard"
  // (reporte de uso/minutos) a quien deba verlo. Se marcan por subtab desde este modal.
  { group: "Operaciones",   module: "Telefonos",     submodules: ["Dashboard", "Dispositivos"] },
  // Inbox WhatsApp propio: Bandeja (ver/responder) · IA (copiloto ✨, controla el costo) · Canales (admin de números) · Asignar conversaciones (reasignar a otros; default solo admin).
  { group: "Operaciones",   module: "WhatsApp",      submodules: ["Bandeja", "IA", "Canales", "Asignar conversaciones"] },
  { group: "Operaciones",   module: "Tickets",       submodules: ["Crear Ticket", "Editar Ticket", "Eliminar Ticket", "Asignar Ticket"] },
  { group: "Operaciones",   module: "Chatters",      submodules: ["Evaluator", "Workspace", "Admin", "Borrar Historial"] },
  // Scouter Assist submodules. Los que comienzan con "Settings →" son
  // permisos de acciones DENTRO del tab Settings — gating granular sobre
  // botones que gastan créditos (Lookalike = embeddings Gemini) o
  // disparan procesos masivos (Generar Tareas = create_daily_tasks RPC).
  // El "→" indica al admin que es child del tab Settings (la base de
  // datos guarda el submodule exacto, no jerárquico).
  { group: "Operaciones",   module: "Scouter Assist", submodules: ["Home", "Busquedas", "Favoritas", "Leads", "Funnel", "Mis Tareas", "Alertas", "Settings", "Editar Compañías", "Recomputar Lookalike", "Generar Tareas"] },
  // Agency QA tiene dos tipos de submódulos:
  //   1) Las 4 categorías de QA por rol (Closers / Chatters / Managers /
  //      Spammers) que controlan qué tab del rail izquierdo ve el usuario.
  //   2) Los submódulos funcionales adentro de Closers QA (Calls, New QA,
  //      QA History, etc.) — estos gateaán los sub-tabs internos.
  // Si un rol no tiene un toggle on para "Closers QA", todo el grupo
  // izquierdo desaparece para él aunque tenga acceso a "Calls".
  { group: "Operaciones",   module: "Agency QA",     submodules: [
    "Closers QA", "Chatters QA", "Managers QA", "Spammers QA",
    "Calls", "New QA", "QA History", "QA Chat", "Models", "Analytics", "Notifications", "Borrar Calls",
  ] },
  // Mensajes Pro = visor on-demand de conversaciones (BLU). Era submódulo de Agency QA,
  // pero es un tab propio del sidebar (/conversaciones) → se promovió a módulo top-level para
  // que se pueda asignar por rol sin tener que dar todo Agency QA. El gate de BLU
  // (can_use_blu_mp) honra este módulo + Chatters QA.
  { group: "Operaciones",   module: "Mensajes Pro",  submodules: [] },

  // === Finanzas ===
  { group: "Finanzas",      module: "Finanzas",      submodules: ["Dashboard", "Collections", "Nómina", "Horas Variables", "Invoices", "Templates", "Control Financiero", "Reportes", "Configuración"] },

  // === Recursos Humanos ===
  { group: "Recursos Humanos", module: "HR",         submodules: ["Dashboard", "Candidatos", "Onboarding", "Empleados Activos", "Offboarding", "Asistencia", "Horarios", "Horarios Chatters", "Horas Extra", "Banco de Horas", "Vacaciones", "Permisos", "Monitoreo", "Incidentes", "Desempeño", "Capacitación", "Directorio", "Organigrama", "Deducciones", "Anuncios"] },

  // === Configuración / Settings ===
  { group: "Configuración", module: "Administración", submodules: ["Usuarios", "Roles", "Auditoría"] },
  { group: "Configuración", module: "ProyectoMP",     submodules: [] },
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
