import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
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

// `explicitPermission` existe para distinguir tres estados que `canAccess` colapsa:
// concedido, denegado y "sin configurar". El tercero es el que deja que una acción
// caiga a su default (el nivel de acceso del rol) en vez de quedar habilitada para
// todos por ser Cowork un módulo universal.
describe("usePermissions.explicitPermission", () => {
  beforeEach(() => {
    stub.reset();
  });

  it("devuelve null cuando el rol NO tiene fila para esa acción", async () => {
    stub.setUserRole(viewerContactosUser.id, "employee");
    stub.setRolesConfig("employee", "rc-employee");
    stub.setRolePermissions("rc-employee", [
      { module: "Cowork", submodule: null, can_access: true, data_scope: "all" },
    ]);

    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork", "Crear sesión")).toBeNull();
  });

  it("devuelve true cuando la fila concede la acción", async () => {
    stub.setUserRole(viewerContactosUser.id, "employee");
    stub.setRolesConfig("employee", "rc-employee");
    stub.setRolePermissions("rc-employee", [
      { module: "Cowork", submodule: "Crear sesión", can_access: true, data_scope: "all" },
    ]);

    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork", "Crear sesión")).toBe(true);
  });

  it("devuelve false cuando la fila DENIEGA la acción — no cae al default", async () => {
    // Este es el caso que protege al admin que quitó el permiso a mano: aunque el
    // rol sea de nivel supervisor, la fila en false tiene que ganar.
    stub.setUserRole(viewerContactosUser.id, "supervisor");
    stub.setRolesConfig("supervisor", "rc-supervisor");
    stub.setRolePermissions("rc-supervisor", [
      { module: "Cowork", submodule: "Crear sesión", can_access: false, data_scope: "all" },
    ]);

    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork", "Crear sesión")).toBe(false);
  });

  it("el admin no depende de filas: siempre true", async () => {
    stub.setUserRole(adminUser.id, "admin");

    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper(adminAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork", "Crear sesión")).toBe(true);
  });

  it("no confunde una acción con otra del mismo módulo", async () => {
    stub.setUserRole(viewerContactosUser.id, "employee");
    stub.setRolesConfig("employee", "rc-employee");
    stub.setRolePermissions("rc-employee", [
      { module: "Cowork", submodule: "Crear sesión", can_access: true, data_scope: "all" },
    ]);

    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper(memberAuth) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.explicitPermission("Cowork", "Otra acción")).toBeNull();
  });

  it("la precedencia final coincide con la de la DB: fila ?? nivel de acceso", async () => {
    // Espeja `can_use_module_function`: sin fila manda el nivel; con fila manda ella.
    stub.setUserRole(viewerContactosUser.id, "employee");
    stub.setRolesConfig("employee", "rc-employee");
    stub.setRolePermissions("rc-employee", []);

    const { result } = renderHook(() => usePermissions(), { wrapper: makeWrapper(memberAuth) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const explicit = result.current.explicitPermission("Cowork", "Crear sesión");
    const isSupervisorOrAbove = false; // lo que daría useRoleTier para un nivel miembro
    expect(explicit ?? isSupervisorOrAbove).toBe(false);

    const asSupervisor = true; // el mismo cálculo para un rol de nivel supervisor
    expect(explicit ?? asSupervisor).toBe(true);
  });
});
