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
// Helpers de configuracion del stub para el rol viewer
// ---------------------------------------------------------------------------

const VIEWER_ROLE = "viewer-contactos";
const VIEWER_CONFIG_ID = "rc-viewer-contactos";

function setupViewer(perms: PermissionRow[]) {
  stub.setUserRole(viewerContactosUser.id, VIEWER_ROLE);
  stub.setRolesConfig(VIEWER_ROLE, VIEWER_CONFIG_ID);
  stub.setRolePermissions(VIEWER_CONFIG_ID, perms);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("canAccess", () => {
  beforeEach(() => {
    stub.reset();
  });

  // -------------------------------------------------------------------------
  describe("admin bypass", () => {
    it("should return true for any module when isAdmin is true", async () => {
      // Arrange
      stub.setUserRole(adminUser.id, "admin");
      const wrapper = makeWrapper(adminAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Contactos")).toBe(true);
      expect(result.current.canAccess("HR")).toBe(true);
      expect(result.current.canAccess("Finanzas")).toBe(true);
      expect(result.current.canAccess("Administración")).toBe(true);
    });

    it("should return true for any submodule when isAdmin is true", async () => {
      // Arrange
      stub.setUserRole(adminUser.id, "admin");
      const wrapper = makeWrapper(adminAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("HR", "Candidatos")).toBe(true);
      expect(result.current.canAccess("ModuloInexistente", "SubmodInexistente")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("permiso explicito de modulo", () => {
    it("should return true when module has explicit can_access: true", async () => {
      // Arrange
      setupViewer([{ module: "Contactos", submodule: null, can_access: true, data_scope: "all" }]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Contactos")).toBe(true);
    });

    it("should return false when module has explicit can_access: false", async () => {
      // Arrange
      setupViewer([{ module: "Contactos", submodule: null, can_access: false, data_scope: "all" }]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Contactos")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("UNIVERSAL_MODULES", () => {
    it("should return true for Dashboard when permissions are empty", async () => {
      // Arrange
      setupViewer([]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Dashboard")).toBe(true);
    });

    it("should return true for Messenger when permissions are empty", async () => {
      // Arrange
      setupViewer([]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Messenger")).toBe(true);
    });

    it("should return false for non-universal modules when permissions are empty", async () => {
      // Arrange
      setupViewer([]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Contactos")).toBe(false);
      expect(result.current.canAccess("HR")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("submodule resolution", () => {
    it("should return true when specific submodule row overrides a false module row", async () => {
      // Arrange: HR modulo-level false, pero Candidatos submodule true
      setupViewer([
        { module: "HR", submodule: "Candidatos", can_access: true, data_scope: "all" },
        { module: "HR", submodule: null, can_access: false, data_scope: "all" },
      ]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert: el row del submodulo tiene precedencia
      expect(result.current.canAccess("HR", "Candidatos")).toBe(true);
    });

    it("should inherit module-level permission when no specific submodule row exists", async () => {
      // Arrange: HR modulo-level true, sin row para Candidatos
      setupViewer([
        { module: "HR", submodule: null, can_access: true, data_scope: "all" },
      ]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert: hereda el permiso del modulo
      expect(result.current.canAccess("HR", "Candidatos")).toBe(true);
    });

    it("should return false for module when only submodule is denied", async () => {
      // Arrange: HR solo tiene un submodule con can_access: false
      setupViewer([
        { module: "HR", submodule: "Candidatos", can_access: false, data_scope: "all" },
      ]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert: ningun submodule concede acceso al modulo
      expect(result.current.canAccess("HR")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("recorte reversible (modulosOcultos)", () => {
    it("esconde Creadores y Creator Sales al equipo, aunque el rol los tenga concedidos", async () => {
      // Arrange: el rol SÍ tiene acceso explícito a los tres.
      setupViewer([
        { module: "Creadores", submodule: null, can_access: true, data_scope: "all" },
        { module: "Creator Sales", submodule: "Dashboard", can_access: true, data_scope: "all" },
        { module: "Contactos", submodule: null, can_access: true, data_scope: "all" },
      ]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert: el interruptor gana sobre el permiso del rol...
      expect(result.current.canAccess("Creadores")).toBe(false);
      expect(result.current.canAccess("Creator Sales", "Dashboard")).toBe(false);
      // ...pero solo sobre los módulos apagados: el resto sigue igual.
      expect(result.current.canAccess("Contactos")).toBe(true);
    });

    it("al admin NO le esconde nada (el interruptor va después del bypass)", async () => {
      // Arrange
      stub.setUserRole(adminUser.id, "admin");
      const wrapper = makeWrapper(adminAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.canAccess("Creadores")).toBe(true);
      expect(result.current.canAccess("Creator Sales", "Dashboard")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("empty permissions edge cases", () => {
    it("should not throw when permissions are empty and multiple canAccess calls are made", async () => {
      // Arrange
      setupViewer([]);
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => usePermissions(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert: sin crash; universales true, resto false
      expect(() => result.current.canAccess("Dashboard")).not.toThrow();
      expect(() => result.current.canAccess("Messenger")).not.toThrow();
      expect(() => result.current.canAccess("Contactos")).not.toThrow();
      expect(() => result.current.canAccess("HR", "Candidatos")).not.toThrow();
      expect(result.current.canAccess("Dashboard")).toBe(true);
      expect(result.current.canAccess("Messenger")).toBe(true);
      expect(result.current.canAccess("Contactos")).toBe(false);
    });
  });
});
