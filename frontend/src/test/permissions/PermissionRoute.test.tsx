import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { getOrCreateStub } from "./supabase-stub";
import { adminUser, viewerContactosUser, fakeSession } from "./fixtures";
import { renderWithProviders } from "./renderWithProviders";
import type { AuthMockValue } from "./auth-mock";
import PermissionRoute from "@/components/PermissionRoute";

// ---------------------------------------------------------------------------
// Configuracion del stub de Supabase
// vi.mock se eleva sobre los imports — el factory usa getOrCreateStub()
// (singleton). El test body usa el mismo singleton.
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", async () => {
  const { getOrCreateStub } = await import("./supabase-stub");
  return { supabase: getOrCreateStub().client };
});

const stub = getOrCreateStub();

// ---------------------------------------------------------------------------
// Auth values helpers
// ---------------------------------------------------------------------------

function makeAuth(user: typeof adminUser, loadingState = false): AuthMockValue {
  return {
    user,
    session: fakeSession(user),
    loading: loadingState,
    signOut: async () => {},
  };
}

const loadingAuth: AuthMockValue = {
  user: viewerContactosUser,
  session: fakeSession(viewerContactosUser),
  loading: true,
  signOut: async () => {},
};

const anonymousAuth: AuthMockValue = {
  user: null,
  session: null,
  loading: false,
  signOut: async () => {},
};

// ---------------------------------------------------------------------------
// Helpers de stub
// ---------------------------------------------------------------------------

const VIEWER_ROLE = "viewer-contactos";
const VIEWER_CONFIG_ID = "rc-viewer-contactos";

function setupViewerWithPermission(module: string) {
  stub.setUserRole(viewerContactosUser.id, VIEWER_ROLE);
  stub.setRolesConfig(VIEWER_ROLE, VIEWER_CONFIG_ID);
  stub.setRolePermissions(VIEWER_CONFIG_ID, [
    { module, submodule: null, can_access: true, data_scope: "all" },
  ]);
}

function setupViewerWithoutPermission(module: string) {
  stub.setUserRole(viewerContactosUser.id, VIEWER_ROLE);
  stub.setRolesConfig(VIEWER_ROLE, VIEWER_CONFIG_ID);
  stub.setRolePermissions(VIEWER_CONFIG_ID, [
    { module, submodule: null, can_access: false, data_scope: "all" },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PermissionRoute", () => {
  beforeEach(() => {
    stub.reset();
  });

  // -------------------------------------------------------------------------
  describe("usuario con permiso", () => {
    it("should render children when user has access to the module", async () => {
      // Arrange
      setupViewerWithPermission("Contactos");

      // Act
      renderWithProviders(
        <PermissionRoute module="Contactos">
          <div data-testid="protected-content">contenido protegido</div>
        </PermissionRoute>,
        {
          initialEntries: ["/contactos"],
          routePath: "/contactos",
          auth: makeAuth(viewerContactosUser),
        }
      );

      // Assert
      expect(await screen.findByTestId("protected-content")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("usuario sin permiso", () => {
    it("should redirect to /dashboard when user lacks module permission", async () => {
      // Arrange
      setupViewerWithoutPermission("HR");

      // Act
      renderWithProviders(
        <PermissionRoute module="HR">
          <div data-testid="protected-content">contenido protegido</div>
        </PermissionRoute>,
        {
          initialEntries: ["/hr"],
          routePath: "/hr",
          auth: makeAuth(viewerContactosUser),
        }
      );

      // Assert — spy route /dashboard esta montada via routePath
      expect(await screen.findByTestId("dashboard-redirect")).toBeInTheDocument();
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("estado de carga", () => {
    it("should show Loader2 spinner and not redirect while loading", () => {
      // Arrange — authLoading: true, sin configurar stub (no importa en loading)

      // Act
      renderWithProviders(
        <PermissionRoute module="Contactos">
          <div data-testid="protected-content">contenido protegido</div>
        </PermissionRoute>,
        {
          initialEntries: ["/contactos"],
          routePath: "/contactos",
          auth: loadingAuth,
        }
      );

      // Assert — spinner presente; children y redirects ausentes
      // Loader2 de lucide-react renderiza un svg con la clase animate-spin
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).not.toBeNull();
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-redirect")).not.toBeInTheDocument();
      expect(screen.queryByTestId("login-redirect")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("usuario no autenticado", () => {
    it("should redirect to /login when user is null and authLoading is false", async () => {
      // Arrange — usuario anonimo, carga terminada

      // Act
      renderWithProviders(
        <PermissionRoute module="Contactos">
          <div data-testid="protected-content">contenido protegido</div>
        </PermissionRoute>,
        {
          initialEntries: ["/contactos"],
          routePath: "/contactos",
          auth: anonymousAuth,
        }
      );

      // Assert
      expect(await screen.findByTestId("login-redirect")).toBeInTheDocument();
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("admin bypass", () => {
    it("should render children for admin even with a nonexistent module", async () => {
      // Arrange — admin role; canAccess shortcircuit devuelve true para cualquier modulo
      stub.setUserRole(adminUser.id, "admin");

      // Act
      renderWithProviders(
        <PermissionRoute module="ModuloInexistente">
          <div data-testid="protected-content">contenido de admin</div>
        </PermissionRoute>,
        {
          initialEntries: ["/admin-only"],
          routePath: "/admin-only",
          auth: makeAuth(adminUser),
        }
      );

      // Assert
      expect(await screen.findByTestId("protected-content")).toBeInTheDocument();
    });
  });
});
