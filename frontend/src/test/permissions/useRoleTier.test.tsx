import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, ReactNode } from "react";
import { useRoleTier } from "@/hooks/useRoleTier";
import { getOrCreateStub } from "./supabase-stub";
import { AuthMockProvider, AuthMockValue } from "./auth-mock";
import { adminUser, viewerContactosUser, fakeSession } from "./fixtures";

vi.mock("@/integrations/supabase/client", async () => {
  const { getOrCreateStub } = await import("./supabase-stub");
  return { supabase: getOrCreateStub().client };
});

const stub = getOrCreateStub();

function makeWrapper(authValue: AuthMockValue) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthMockProvider, { value: authValue }, children)
    );
}

const memberAuth: AuthMockValue = {
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

const anonymousAuth: AuthMockValue = {
  user: null,
  session: null,
  loading: false,
  signOut: async () => {},
};

describe("useRoleTier", () => {
  beforeEach(() => {
    stub.reset();
  });

  it("deriva 'member' de los flags de role_groups (nivel más bajo)", async () => {
    stub.setUserRole(viewerContactosUser.id, "employee");
    stub.setRoleGroup("employee", { is_member: true });

    const { result } = renderHook(() => useRoleTier(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("member");
    expect(result.current.isSupervisorOrAbove).toBe(false);
  });

  it("deriva 'supervisor' y habilita isSupervisorOrAbove", async () => {
    stub.setUserRole(viewerContactosUser.id, "supervisor");
    stub.setRoleGroup("supervisor", { is_supervisor_or_above: true });

    const { result } = renderHook(() => useRoleTier(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("supervisor");
    expect(result.current.isSupervisorOrAbove).toBe(true);
  });

  it("prioriza is_admin sobre los demás flags", async () => {
    stub.setUserRole(adminUser.id, "admin");
    stub.setRoleGroup("admin", {
      is_admin: true,
      is_manager_or_above: true,
      is_supervisor_or_above: true,
    });

    const { result } = renderHook(() => useRoleTier(), { wrapper: makeWrapper(adminAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("admin");
    expect(result.current.isSupervisorOrAbove).toBe(true);
  });

  it("un rol CUSTOM de nivel supervisor no depende de la lista hardcodeada de useUserRole", async () => {
    // Rol creado desde Administración → Roles con nivel "Supervisor". `useUserRole`
    // lo trataría como empleado raso (no está en SUPERVISOR_ROLES); role_groups no.
    stub.setUserRole(viewerContactosUser.id, "Coordinador Cowork" as never);
    stub.setRoleGroup("Coordinador Cowork", { is_supervisor_or_above: true });

    const { result } = renderHook(() => useRoleTier(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("supervisor");
    expect(result.current.isSupervisorOrAbove).toBe(true);
  });

  it("un rol SIN fila en role_groups cae a 'member' (default-deny)", async () => {
    stub.setUserRole(viewerContactosUser.id, "employee");
    // sin setRoleGroup → is_in_role_group() le daría false a todo en la DB

    const { result } = renderHook(() => useRoleTier(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("member");
    expect(result.current.isSupervisorOrAbove).toBe(false);
  });

  it("sin usuario autenticado no consulta y queda en 'member'", async () => {
    const { result } = renderHook(() => useRoleTier(), { wrapper: makeWrapper(anonymousAuth) });

    expect(result.current.tier).toBe("member");
    expect(result.current.isSupervisorOrAbove).toBe(false);
  });
});
