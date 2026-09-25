import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditoriaUser {
  id: string;
  full_name: string | null;
  email?: string;
  roles: { role: string; custom_role_id: string | null; custom_role_name: string | null }[];
}

// El hallazgo viaja como DATO (qué es + sus números) y la pantalla arma el texto
// en su idioma. Antes se guardaba la frase en español en la caché de react-query.
export interface HealthCheckDetail {
  type: "warning" | "error";
  kind: "users_without_role" | "orphan_permission";
  /** users_without_role: cuántos son. */
  count?: number;
  /** orphan_permission: el módulo (la llave de role_permissions). */
  module?: string;
  /** Nombres (o ids) afectados. null = una persona sin nombre cargado. */
  affected: (string | null)[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface AuditoriaSummary {
  total_users: number;
  users_with_roles: number;
  users_without_roles: number;
  total_roles: number;
  active_roles: number;
  total_permissions: number;
}

export interface RoleMatrixEntry {
  role_name: string;
  modules: Record<string, { can_view: boolean; data_scope: string }>;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditoriaData {
  summary: AuditoriaSummary;
  health_checks: { critical: number; high: number; medium: number; low: number; details: HealthCheckDetail[] };
  users: AuditoriaUser[];
  role_matrix: Record<string, RoleMatrixEntry>;
  audit_entries: AuditLogEntry[];
  /** id → nombre. "" = la persona existe pero no tiene nombre cargado. */
  profilesMap: Record<string, string>;
}

export const useAuditoriaData = () => {
  return useQuery({
    queryKey: ["auditoria-roles"],
    queryFn: async (): Promise<AuditoriaData> => {
      const [profilesRes, userRolesRes, rolesRes, permissionsRes, auditRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("roles_config").select("*"),
        supabase.from("role_permissions").select("*"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);

      const profiles = profilesRes.data || [];
      const userRoles = userRolesRes.data || [];
      const roles = rolesRes.data || [];
      const permissions = permissionsRes.data || [];
      const auditEntries = (auditRes.data || []) as AuditLogEntry[];

      // Build profiles map for activity log
      const profilesMap: Record<string, string> = {};
      for (const p of profiles) {
        profilesMap[p.id] = p.full_name || "";
      }

      const validRoleIds = new Set(roles.map((r) => r.id));

      // Build users with roles
      const rolesByUser = new Map<string, { role: string; custom_role_id: string | null; custom_role_name: string | null }[]>();
      for (const ur of userRoles) {
        const arr = rolesByUser.get(ur.user_id) || [];
        arr.push({ role: ur.role, custom_role_id: null, custom_role_name: null });
        rolesByUser.set(ur.user_id, arr);
      }

      const users: AuditoriaUser[] = profiles.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        roles: rolesByUser.get(p.id) || [],
      }));

      const usersWithoutRoles = users.filter((u) => u.roles.length === 0);

      // Health checks
      const details: HealthCheckDetail[] = [];

      if (usersWithoutRoles.length > 0) {
        details.push({
          type: "warning",
          kind: "users_without_role",
          count: usersWithoutRoles.length,
          affected: usersWithoutRoles.map((u) => u.full_name || null),
          priority: "high",
        });
      }

      const orphanPerms = permissions.filter((p) => !validRoleIds.has(p.role_id));
      for (const op of orphanPerms) {
        details.push({
          type: "error",
          kind: "orphan_permission",
          module: op.module || "undefined",
          affected: [op.role_id],
          priority: "high",
        });
      }

      const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const d of details) severityCounts[d.priority]++;

      // Role matrix - correctly map can_access and data_scope
      const activeRoles = roles.filter((r) => r.is_active);
      const roleMatrix: Record<string, RoleMatrixEntry> = {};

      for (const role of activeRoles) {
        const rolePerms = permissions.filter((p) => p.role_id === role.id);
        const modules: Record<string, { can_view: boolean; data_scope: string }> = {};

        for (const perm of rolePerms) {
          if (!perm.module) continue;
          if (!modules[perm.module]) {
            modules[perm.module] = { can_view: false, data_scope: "all" };
          }
          if (perm.can_access) {
            modules[perm.module].can_view = true;
            modules[perm.module].data_scope = perm.data_scope || "all";
          }
        }

        roleMatrix[role.name] = { role_name: role.name, modules };
      }

      return {
        summary: {
          total_users: profiles.length,
          users_with_roles: profiles.length - usersWithoutRoles.length,
          users_without_roles: usersWithoutRoles.length,
          total_roles: activeRoles.length,
          active_roles: activeRoles.length,
          total_permissions: permissions.filter((p) => validRoleIds.has(p.role_id)).length,
        },
        health_checks: { ...severityCounts, details },
        users,
        role_matrix: roleMatrix,
        audit_entries: auditEntries,
        profilesMap,
      };
    },
  });
};
