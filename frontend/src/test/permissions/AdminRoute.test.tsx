/**
 * SNAPSHOT — locks in the canAccess('Administración') guard.
 *
 * AdminRoute currently checks `canAccess("Administración")` instead of
 * `isAdmin`. This is a known bug, intentionally NOT fixed in this change.
 *
 * These tests document the CURRENT behavior so future modifications cannot
 * silently change it. When the bug is fixed (planned: SDD change
 * `fix-admin-route-guard`), every test in this file MUST be updated or
 * replaced — they will FAIL after the fix, which is the signal to update.
 *
 * DO NOT delete these tests when the fix lands. Replace them with the
 * post-fix scenarios.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { getOrCreateStub } from "./supabase-stub";
import { adminUser, viewerContactosUser, fakeSession } from "./fixtures";
import { renderWithProviders } from "./renderWithProviders";
import type { AuthMockValue } from "./auth-mock";
import AdminRoute from "@/components/AdminRoute";

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

const viewerAuth: AuthMockValue = {
  user: viewerContactosUser,
  session: fakeSession(viewerContactosUser),
  loading: false,
  signOut: async () => {},
};

const adminAuth: AuthMockValue = {
  user: adminUser,
  session: fakeSession(adminUser),
  loading: false,
  signOut: async () => {},
};

const loadingAuth: AuthMockValue = {
  user: viewerContactosUser,
  session: fakeSession(viewerContactosUser),
  loading: true,
  signOut: async () => {},
};

// ---------------------------------------------------------------------------
// Helpers de stub
// ---------------------------------------------------------------------------

const VIEWER_ROLE = "viewer-contactos";
const VIEWER_CONFIG_ID = "rc-viewer-contactos";

// No-admin user CON permiso de Administracion configurado — documenta el bug
function setupViewerWithAdminPermission() {
  stub.setUserRole(viewerContactosUser.id, VIEWER_ROLE);
  stub.setRolesConfig(VIEWER_ROLE, VIEWER_CONFIG_ID);
  stub.setRolePermissions(VIEWER_CONFIG_ID, [
    { module: "Administración", submodule: null, can_access: true, data_scope: "all" },
  ]);
}

// No-admin user SIN permiso de Administracion
function setupViewerWithoutAdminPermission() {
  stub.setUserRole(viewerContactosUser.id, VIEWER_ROLE);
  stub.setRolesConfig(VIEWER_ROLE, VIEWER_CONFIG_ID);
  stub.setRolePermissions(VIEWER_CONFIG_ID, []);
}

// Admin user sin permiso explicito de Administracion en la tabla
function setupAdminWithoutExplicitPermission() {
  stub.setUserRole(adminUser.id, "admin");
  // No configuramos role_permissions para admin — canAccess hace shortcircuit
  // antes de llegar a la tabla, por eso el admin igual pasa el guard.
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminRoute", () => {
  beforeEach(() => {
    stub.reset();
  });

  // -------------------------------------------------------------------------
  describe("no-admin con permiso Administracion (SNAPSHOT del bug)", () => {
    // SNAPSHOT OF CURRENT BUG
    it("currently allows non-admin with canAccess('Administración') permission to pass", async () => {
      // SNAPSHOT — locks in canAccess("Administración") guard.
      // Replace when AdminRoute is fixed to use isAdmin (next SDD cycle).

      // Arrange — viewer no-admin pero con permiso "Administración" configurado
      setupViewerWithAdminPermission();

      // Act
      renderWithProviders(
        <AdminRoute>
          <div data-testid="admin-content">contenido de admin</div>
        </AdminRoute>,
        {
          initialEntries: ["/admin"],
          routePath: "/admin",
          auth: viewerAuth,
        }
      );

      // Assert — el no-admin pasa el guard porque canAccess("Administración") es true (BUG)
      expect(await screen.findByTestId("admin-content")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-redirect")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("admin sin permiso Administracion explicito (SNAPSHOT — admin shortcircuit salva)", () => {
    // SNAPSHOT OF CURRENT BUG
    it("currently passes admin through because canAccess shortcircuits for isAdmin", async () => {
      // SNAPSHOT — locks in canAccess("Administración") guard.
      // The admin shortcircuit inside canAccess() returns true for ANY module
      // when isAdmin is true, so the guard passes — but the check still goes
      // through canAccess instead of isAdmin directly.
      // Replace when AdminRoute is fixed to use isAdmin (next SDD cycle).

      // Arrange — admin user, sin row de Administracion en la tabla
      setupAdminWithoutExplicitPermission();

      // Act
      renderWithProviders(
        <AdminRoute>
          <div data-testid="admin-content">contenido de admin</div>
        </AdminRoute>,
        {
          initialEntries: ["/admin"],
          routePath: "/admin",
          auth: adminAuth,
        }
      );

      // Assert — admin pasa porque canAccess shortcircuit isAdmin devuelve true
      expect(await screen.findByTestId("admin-content")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-redirect")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("no-admin sin permiso Administracion", () => {
    it("should redirect to /dashboard when non-admin lacks Administración permission", async () => {
      // Arrange — viewer no-admin sin permiso de Administracion
      setupViewerWithoutAdminPermission();

      // Act
      renderWithProviders(
        <AdminRoute>
          <div data-testid="admin-content">contenido de admin</div>
        </AdminRoute>,
        {
          initialEntries: ["/admin"],
          routePath: "/admin",
          auth: viewerAuth,
        }
      );

      // Assert — redirect a /dashboard; children ausentes
      expect(await screen.findByTestId("dashboard-redirect")).toBeInTheDocument();
      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  describe("estado de carga", () => {
    it("should show Loader2 spinner and not redirect while loading", () => {
      // Arrange — authLoading: true; no importa el estado del stub

      // Act
      renderWithProviders(
        <AdminRoute>
          <div data-testid="admin-content">contenido de admin</div>
        </AdminRoute>,
        {
          initialEntries: ["/admin"],
          routePath: "/admin",
          auth: loadingAuth,
        }
      );

      // Assert — spinner presente; children y redirects ausentes
      const spinner = document.querySelector(".animate-spin");
      expect(spinner).not.toBeNull();
      expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-redirect")).not.toBeInTheDocument();
      expect(screen.queryByTestId("login-redirect")).not.toBeInTheDocument();
    });
  });
});
