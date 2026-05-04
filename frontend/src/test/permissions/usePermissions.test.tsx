import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { getOrCreateStub, PermissionRow } from "./supabase-stub";
import { AuthMockProvider, AuthMockValue } from "./auth-mock";
import { adminUser, viewerContactosUser, fakeSession } from "./fixtures";

// ---------------------------------------------------------------------------
// Configuracion del stub de Supabase
// vi.mock se eleva sobre los imports, asi que el factory crea el stub via
// getOrCreateStub() (singleton). El test body usa el mismo singleton.
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", async () => {
  const { getOrCreateStub } = await import("./supabase-stub");
  return { supabase: getOrCreateStub().client };
});

const stub = getOrCreateStub();

// ---------------------------------------------------------------------------
// Helpers de wrapper
// ---------------------------------------------------------------------------

function makeWrapper(authValue: AuthMockValue) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });

  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthMockProvider, { value: authValue }, children)
    );
}

const adminAuth: AuthMockValue = {
  user: adminUser,
  session: fakeSession(adminUser),
  loading: false,
  signOut: async () => {},
};

const viewerAuth: AuthMockValue = {
  user: viewerContactosUser,
  session: fakeSession(viewerContactosUser),
  loading: false,
  signOut: async () => {},
};

// ---------------------------------------------------------------------------
// Constantes para los fixtures del rol "manager" (rol de prueba para Slice 2)
// ---------------------------------------------------------------------------

const MANAGER_USER_ID = viewerContactosUser.id;
const MANAGER_ROLE = "manager";
const MANAGER_CONFIG_ID = "rc-manager-42";

const managerContactosPermission: PermissionRow = {
  module: "Contactos",
  submodule: null,
  can_access: true,
  data_scope: "all",
};

function setupManager(perms: PermissionRow[]) {
  stub.setUserRole(MANAGER_USER_ID, MANAGER_ROLE);
  stub.setRolesConfig(MANAGER_ROLE, MANAGER_CONFIG_ID);
  stub.setRolePermissions(MANAGER_CONFIG_ID, perms);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePermissions", () => {
  beforeEach(() => {
    stub.reset();
  });

  // -------------------------------------------------------------------------
  describe("permissions map building", () => {
    it("should build correct permissions map and return canAccess true for configured module", async () => {
      // Arrange: manager con roles_config id MANAGER_CONFIG_ID y un permiso de Contactos
      setupManager([managerContactosPermission]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.permissions).toHaveLength(1);
      expect(result.current.canAccess("Contactos")).toBe(true);
    });

    it("should return empty permissions and canAccess false for non-universal module when permissions array is empty", async () => {
      // Arrange: manager con roles_config pero sin permisos configurados
      setupManager([]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.permissions).toHaveLength(0);
      expect(result.current.canAccess("Contactos")).toBe(false);
      // UNIVERSAL_MODULES siguen accesibles aunque permissions este vacio
      expect(result.current.canAccess("Dashboard")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("loading state", () => {
    it("should expose isLoading true while queries are in progress", async () => {
      // Arrange
      setupManager([managerContactosPermission]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });

      // Assert: primer render → al menos roleLoading debe estar en true inicialmente
      expect(result.current.isLoading).toBe(true);

      // Confirm eventual resolution
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it("should expose isLoading false once all queries have completed", async () => {
      // Arrange: mocks configurados para resolver de inmediato
      setupManager([managerContactosPermission]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("admin skip path", () => {
    it("should skip role_permissions query for admin and return canAccess true for any module", async () => {
      // Arrange: usuario admin. El hook tiene enabled: !!role && !isAdmin
      // → la query de role_permissions NO se dispara para admins.
      stub.setUserRole(adminUser.id, "admin");
      const wrapper = makeWrapper(adminAuth);

      // Spy en stub.client.from para detectar si se llama a role_permissions
      const fromSpy = vi.spyOn(stub.client, "from");

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert: permissions queda en [] (valor por default, query no ejecutada)
      expect(result.current.permissions).toHaveLength(0);

      // Admin shortcircuit: canAccess devuelve true para cualquier modulo
      expect(result.current.canAccess("Contactos")).toBe(true);
      expect(result.current.canAccess("HR")).toBe(true);
      expect(result.current.canAccess("Finanzas")).toBe(true);
      expect(result.current.canAccess("ModuloInexistente")).toBe(true);

      // La query de role_permissions NO debe haberse ejecutado
      // (roles_config tampoco porque enabled: !!role && !isAdmin cubre ambas queries de perms)
      const rolePermissionsCalls = fromSpy.mock.calls.filter(
        ([table]) => table === "role_permissions"
      );
      expect(rolePermissionsCalls).toHaveLength(0);

      fromSpy.mockRestore();
    });
  });
});
