// Los dos enlaces que salen de Conectar tu plataforma y abren algo ya preparado:
//   · «Crear la llave» → API keys con el alta abierta y equipo:write marcado;
//   · «Marcar qué ve»  → Roles con los permisos de ese rol abiertos.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { SCOPE_CATALOG, SCOPE_GROUPS } from "../../../../supabase/functions/manage-api-keys/api-scopes";

vi.mock("@/lib/adminInvoke", async () => {
  const real = await vi.importActual<typeof import("@/lib/adminInvoke")>("@/lib/adminInvoke");
  const { SCOPE_CATALOG: catalogo, SCOPE_GROUPS: grupos } = await import("../../../../supabase/functions/manage-api-keys/api-scopes");
  return {
    ...real,
    adminInvoke: () => Promise.resolve({
      keys: [], scope_catalog: catalogo, scope_groups: [...grupos], max_active_keys: 5,
      you: { id: "yo", name: "Alvaro" }, webhooks_unknown: false,
    }),
  };
});
vi.mock("@/pages/admin/carasDePersonas", () => ({ useCaras: () => new Map() }));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const ROLES = [
  { id: "r1", name: "Chatter", is_active: true },
  { id: "r2", name: "Closer Senior", is_active: true },
];
vi.mock("@/pages/admin/useRoles", () => ({
  useRoles: () => ({
    roles: ROLES, isLoading: false,
    createRole: () => {}, updateRole: () => {}, deleteRole: () => {}, toggleActive: () => {},
    assignUserToRole: () => {}, removeUserFromRole: () => {},
    isCreating: false, isUpdating: false, isDeleting: false, isAssigning: false, isRemoving: false,
  }),
}));
vi.mock("@/pages/admin/SetPermissionsModal", () => ({
  default: ({ open, roleName }: { open: boolean; roleName: string }) => (open ? <div>PERMISOS_DE {roleName}</div> : null),
}));
vi.mock("@/pages/admin/RolesTable", () => ({ default: () => null }));
vi.mock("@/pages/admin/RolesGrid", () => ({ default: () => null }));
vi.mock("@/pages/admin/CreateRoleModal", () => ({ default: () => null }));
vi.mock("@/pages/admin/EditRoleModal", () => ({ default: () => null }));
vi.mock("@/pages/admin/DeleteRoleDialog", () => ({ default: () => null }));
vi.mock("@/pages/admin/ManageRoleUsersModal", () => ({ default: () => null }));

import AdminApiKeys from "@/pages/admin/AdminApiKeys";
import RolesContent from "@/pages/admin/RolesContent";

const conProveedores = (hijo: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LanguageProvider>{hijo}</LanguageProvider>
  </QueryClientProvider>
);

describe("API keys con ?crear=equipo:write", () => {
  it("abre el alta con el permiso del equipo ya marcado (y nada más)", async () => {
    expect(SCOPE_CATALOG.some((s) => s.key === "equipo:write")).toBe(true);
    expect(SCOPE_GROUPS.length).toBeGreaterThan(0);
    render(conProveedores(<AdminApiKeys crearCon="equipo:write" />));
    const dialogo = await screen.findByRole("dialog");
    const marcados = within(dialogo).getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked);
    expect(marcados).toHaveLength(1);
    expect(marcados[0].closest("label")?.textContent).toContain("equipo:write");
  });

  it("sin el parámetro no abre nada", async () => {
    render(conProveedores(<AdminApiKeys />));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Roles con ?permisos=<rol>", () => {
  it("abre los permisos de ese rol", () => {
    render(<RolesContent view="list" createOpen={false} onCreateOpenChange={() => {}} abrirPermisosDe="Closer Senior" />);
    expect(screen.getByText("PERMISOS_DE Closer Senior")).toBeTruthy();
  });

  it("encuentra el rol aunque cambien las mayúsculas, y sin pedido no abre nada", () => {
    const { unmount } = render(<RolesContent view="list" createOpen={false} onCreateOpenChange={() => {}} abrirPermisosDe="closer senior" />);
    expect(screen.getByText("PERMISOS_DE Closer Senior")).toBeTruthy();
    unmount();
    render(<RolesContent view="list" createOpen={false} onCreateOpenChange={() => {}} />);
    expect(screen.queryByText(/PERMISOS_DE/)).toBeNull();
  });
});
