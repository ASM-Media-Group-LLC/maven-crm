import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, ReactNode } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { getOrCreateStub } from "./supabase-stub";
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

const anonymousAuth: AuthMockValue = {
  user: null,
  session: null,
  loading: false,
  signOut: async () => {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useUserRole", () => {
  beforeEach(() => {
    stub.reset();
  });

  // -------------------------------------------------------------------------
  describe("role resolution", () => {
    it("should return role admin and isAdmin true when Supabase returns admin role", async () => {
      // Arrange
      stub.setUserRole(adminUser.id, "admin");
      const wrapper = makeWrapper(adminAuth);

      // Act
      const { result } = renderHook(() => useUserRole(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.role).toBe("admin");
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isManager).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it("should return correct role and isAdmin false when Supabase returns non-admin role", async () => {
      // Arrange
      stub.setUserRole(viewerContactosUser.id, "manager");
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => useUserRole(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.role).toBe("manager");
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isManager).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("loading state", () => {
    it("should expose isLoading true initially before the query resolves", async () => {
      // Arrange: stub responde normalmente pero capturamos el estado inicial
      stub.setUserRole(viewerContactosUser.id, "manager");
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => useUserRole(), { wrapper });

      // Assert: el primer render tiene isLoading true (query pendiente)
      expect(result.current.isLoading).toBe(true);

      // Confirm it eventually resolves
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  // -------------------------------------------------------------------------
  describe("error handling", () => {
    it("should not crash and should set isLoading false when Supabase returns an error", async () => {
      // Arrange
      stub.setError("user_roles", { message: "DB error" });
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => useUserRole(), { wrapper });

      // Assert: el hook no lanza; la query falla y isLoading se pone en false
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  // -------------------------------------------------------------------------
  describe("null role", () => {
    it("should return null role and all flags false when user has no assigned role", async () => {
      // Arrange: no se configura ningun row en user_roles → maybeSingle devuelve null
      const wrapper = makeWrapper(viewerAuth);

      // Act
      const { result } = renderHook(() => useUserRole(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Assert
      expect(result.current.role).toBeNull();
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isManager).toBe(false);
      expect(result.current.isEmployee).toBe(false);
      expect(result.current.isAgent).toBe(false);
      expect(result.current.isSupervisor).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it("should return null role and isLoading false when no user is authenticated", async () => {
      // Arrange: usuario anonimo (user === null) — la query queda disabled
      const wrapper = makeWrapper(anonymousAuth);

      // Act
      const { result } = renderHook(() => useUserRole(), { wrapper });

      // Assert: query disabled → no se ejecuta; isLoading es false de inmediato
      expect(result.current.isLoading).toBe(false);
      expect(result.current.role).toBeNull();
      expect(result.current.isAdmin).toBe(false);
    });
  });
});
