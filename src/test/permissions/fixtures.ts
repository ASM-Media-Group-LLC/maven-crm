import type { User, Session } from "@supabase/supabase-js";
import type { PermissionRow } from "./supabase-stub";

// ---------------------------------------------------------------------------
// Usuarios (tipados como User de supabase-js, cast parcial para tests)
// ---------------------------------------------------------------------------

export const adminUser = {
  id: "admin-001",
  email: "admin@maven.test",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2024-01-01T00:00:00Z",
} as User;

export const viewerContactosUser = {
  id: "viewer-contactos-001",
  email: "viewer-contactos@maven.test",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2024-01-01T00:00:00Z",
} as User;

export const viewerCreadoresUser = {
  id: "viewer-creadores-001",
  email: "viewer-creadores@maven.test",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2024-01-01T00:00:00Z",
} as User;

export const anonymousUser = null;

// ---------------------------------------------------------------------------
// Sesiones sinteticas (minimas)
// ---------------------------------------------------------------------------

export const fakeSession = (user: User): Session =>
  ({
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  }) as Session;

// ---------------------------------------------------------------------------
// Rows de roles_config
// ---------------------------------------------------------------------------

export const adminRoleConfig = {
  id: "rc-admin",
  name: "admin",
  is_active: true,
};

export const viewerContactosRoleConfig = {
  id: "rc-viewer-contactos",
  name: "viewer-contactos",
  is_active: true,
};

export const viewerCreadoresRoleConfig = {
  id: "rc-viewer-creadores",
  name: "viewer-creadores",
  is_active: true,
};

// ---------------------------------------------------------------------------
// Sets de permisos
// ---------------------------------------------------------------------------

// viewer-contactos: solo Contactos. Util para el smoke del sidebar (Slice 4).
export const viewerContactosPermissions: PermissionRow[] = [
  { module: "Contactos", submodule: null, can_access: true, data_scope: "all" },
];

// viewer-creadores: Creadores con submódulos mixtos (Lista y Dashboard si; Onboarding no)
export const viewerCreadoresPermissions: PermissionRow[] = [
  { module: "Creadores", submodule: "Lista", can_access: true, data_scope: "all" },
  { module: "Creadores", submodule: "Dashboard", can_access: true, data_scope: "all" },
  { module: "Creadores", submodule: "Onboarding", can_access: false, data_scope: "all" },
];
