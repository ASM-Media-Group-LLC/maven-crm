import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import UsersTable from "@/pages/admin/UsersTable";
import EditUserModal from "@/pages/admin/EditUserModal";
import type { AdminUser } from "@/pages/admin/useAdminUsers";

const permisos = vi.hoisted(() => ({ agregar: false, editar: false, desactivar: false, reset: false, asignar: false, cargando: false }));
vi.mock("@/pages/admin/usePermisosUsuarios", () => ({ usePermisosUsuarios: () => permisos }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "caller" } }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/useFormato", () => ({ useFormato: () => ({ fechas: undefined }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/UserAvatar", () => ({ UserAvatar: () => null }));
vi.mock("@/pages/admin/DriveFullToggle", () => ({ DriveFullToggle: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "r", name: "employee" }], error: null }) }) }) }) } }));

const persona: AdminUser = { id: "target", full_name: "Ana Rivera", avatar_url: null, avatar_seed: null, email: "ana@example.test", created_at: "2026-11-22", role: "employee", nivel: "agente", linked_employee: null, ai_daily_quota_override: null, manageable: true };
const acciones = () => ({ onEditRole: vi.fn(), onEdit: vi.fn(), onResetPassword: vi.fn(), onMigrarCorreo: vi.fn(), onDelete: vi.fn(), onRemoveRole: vi.fn() });

describe("Las acciones visibles respetan la posición", () => {
  beforeEach(() => Object.assign(permisos, { agregar: false, editar: false, desactivar: false, reset: false, asignar: false }));
  it("no ejecuta editar, correo, contraseña, borrar ni asignación sin su casilla", () => {
    const handlers = acciones();
    render(<MemoryRouter><UsersTable users={[persona]} {...handlers} /></MemoryRouter>);
    for (const label of ["common.edit", "admin.users.changeEmail", "admin.users.resetPassword", "common.delete", "admin.users.assignRole"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.queryByRole("button", { name: "admin.users.removeRoleOf" })).toBeNull();
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });
  it("habilitar editar no habilita las acciones de contraseña o rol", () => {
    permisos.editar = true;
    const handlers = acciones();
    render(<MemoryRouter><UsersTable users={[persona]} {...handlers} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "common.edit" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(persona);
    expect(screen.getByRole("button", { name: "admin.users.resetPassword" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "admin.users.assignRole" })).toBeDisabled();
  });
  it.each([false, true])("editar perfil con permiso de asignar=%s envía solo lo autorizado", puedeAsignarRol => {
    const onConfirm = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><EditUserModal open onOpenChange={() => {}} user={persona} onConfirm={onConfirm} isLoading={false} puedeAsignarRol={puedeAsignarRol} /></QueryClientProvider>);
    expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(!puedeAsignarRol);
    fireEvent.change(screen.getByLabelText("admin.firstName"), { target: { value: "Andrea" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    expect(onConfirm).toHaveBeenCalledWith({ first_name: "Andrea", last_name: "Rivera", ai_daily_quota_override: null, ...(puedeAsignarRol ? { role: "employee" } : {}) });
  });
});
