import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RoleConfig {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
  user_names: string[];
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
  // Panel de control: dashboard ejecutivo con KPIs del funnel completo
  // (LLG → número → llamada → cierre → ingreso al CRM). Acceso típico:
  // admin/manager/supervisor.
  { group: "Menú",          module: "Panel de control", submodules: [] },
  { group: "Menú",          module: "Messenger",     submodules: [] },
  { group: "Menú",          module: "Cowork",        submodules: [] },
  { group: "Menú",          module: "Contactos",     submodules: [] },
  { group: "Menú",          module: "Tareas",        submodules: [] },
  { group: "Menú",          module: "Eventos",       submodules: [] },
  { group: "Menú",          module: "SuperContacts", submodules: [] }, // sidebar lo muestra como "Wishlist"
  { group: "Menú",          module: "Creadores",     submodules: ["Dashboard", "Lista", "Onboarding", "Offboarding", "Personalizados", "Perfil", "Nuevo"] },
  { group: "Menú",          module: "Creator Sales", submodules: ["Dashboard", "Reportes", "IA Ventas", "Auditoría"] },

  // === Operaciones ===
  { group: "Operaciones",   module: "Promolog",      submodules: [] },
  { group: "Operaciones",   module: "LeadGen",       submodules: [] },
  { group: "Operaciones",   module: "Closers",       submodules: [] },
  { group: "Operaciones",   module: "Tickets",       submodules: [] },
  { group: "Operaciones",   module: "Chatters",      submodules: ["Evaluator", "Workspace", "Admin", "Borrar Historial"] },
  { group: "Operaciones",   module: "Scouter Assist", submodules: ["Home", "Busquedas", "Favoritas", "Leads", "Funnel", "Mis Tareas", "Alertas", "Settings", "Editar Compañías"] },
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
        .select("id, full_name");

      const profilesMap = new Map<string, string>();
      profiles?.forEach((p) => profilesMap.set(p.id, p.full_name || "Sin nombre"));

      return (rolesData || []).map((r) => {
        const usersWithRole = (userRoles || []).filter((ur) => ur.role === r.name);
        return {
          ...r,
          user_count: usersWithRole.length,
          user_names: usersWithRole.map((ur) => profilesMap.get(ur.user_id) || "Sin nombre"),
        };
      }) as RoleConfig[];
    },
  });

  const createRole = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { error } = await supabase.from("roles_config").insert({ name, description });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles-config"] });
      toast({ title: "Rol creado exitosamente" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { error } = await supabase.from("roles_config").update({ name, description }).eq("id", id);
      if (error) throw error;
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

  return {
    roles,
    isLoading,
    createRole: createRole.mutate,
    updateRole: updateRole.mutate,
    deleteRole: deleteRole.mutate,
    toggleActive: toggleActive.mutate,
    isCreating: createRole.isPending,
    isUpdating: updateRole.isPending,
    isDeleting: deleteRole.isPending,
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
