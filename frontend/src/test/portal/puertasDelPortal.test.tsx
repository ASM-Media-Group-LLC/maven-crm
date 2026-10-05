import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { esCuentaDeCreadora } from "@/lib/portal/cuenta";

// LAS PUERTAS: una creadora nunca entra al Maven del equipo (ProtectedRoute la
// manda a /portal) y alguien del equipo nunca ve el portal (PortalLayout lo
// manda a /dashboard). Lo que protege los datos es la base; esto evita que una
// creadora vea un CRM vacío con Messenger, Cowork y Correo.

const sesion = vi.hoisted(() => ({ user: null as null | { id: string; app_metadata: Record<string, unknown> } }));
// La campana (notificaciones en tiempo real) no es parte de las puertas.
vi.mock("@/components/notifications/NotificationBell", () => ({ default: () => null }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: sesion.user, loading: false, signOut: vi.fn() }),
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import ProtectedRoute from "@/components/ProtectedRoute";
import PortalLayout from "@/pages/portal/PortalLayout";

const CREADORA = { id: "u-sofi", app_metadata: { provider: "email", tipo: "creadora" } };
const EMPLEADO = { id: "u-jhon", app_metadata: { provider: "email", alta: "admin" } };

function montar(ruta: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path="/dashboard" element={<ProtectedRoute><p>crm del equipo</p></ProtectedRoute>} />
            <Route path="/login" element={<p>login del equipo</p>} />
            <Route path="/portal/entrar" element={<p>entrar al portal</p>} />
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<p>inicio del portal</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: [{ creator_id: "c1", tenant_id: "t1", agencia: "ASM Tech", nombre: "Sofía", nombre_artistico: "Sofi", foto: null }],
    error: null,
  });
});

describe("esCuentaDeCreadora", () => {
  it("solo la marca del servidor (app_metadata.tipo), nunca lo que escribe la persona", () => {
    expect(esCuentaDeCreadora(CREADORA)).toBe(true);
    expect(esCuentaDeCreadora(EMPLEADO)).toBe(false);
    expect(esCuentaDeCreadora({ app_metadata: { tipo: "Creadora" } })).toBe(false);
    expect(esCuentaDeCreadora({ app_metadata: null })).toBe(false);
    expect(esCuentaDeCreadora(null)).toBe(false);
    // user_metadata la puede escribir cualquiera desde el navegador: no cuenta.
    expect(esCuentaDeCreadora({ user_metadata: { tipo: "creadora" } } as never)).toBe(false);
  });
});

describe("las puertas", () => {
  it("una creadora que abre el CRM termina en su portal", async () => {
    sesion.user = CREADORA;
    montar("/dashboard");
    expect(await screen.findByText("inicio del portal")).toBeTruthy();
    expect(screen.queryByText("crm del equipo")).toBeNull();
  });

  it("alguien del equipo que abre el portal vuelve a su Maven", async () => {
    sesion.user = EMPLEADO;
    montar("/portal");
    expect(await screen.findByText("crm del equipo")).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sin sesión, el portal pide entrar por la puerta del portal", async () => {
    sesion.user = null;
    montar("/portal");
    expect(await screen.findByText("entrar al portal")).toBeTruthy();
  });

  it("una creadora sin ficha (le quitaron el acceso) ve que su acceso no está activo", async () => {
    sesion.user = CREADORA;
    rpc.mockResolvedValue({ data: [], error: null });
    montar("/portal");
    expect(await screen.findByText("Tu acceso no está activo")).toBeTruthy();
  });

  it("con su ficha, ve su espacio y avisa que entró", async () => {
    sesion.user = CREADORA;
    montar("/portal");
    expect(await screen.findByText("inicio del portal")).toBeTruthy();
    expect(screen.getAllByText("Sofi").length).toBeGreaterThan(0);
    expect(rpc).toHaveBeenCalledWith("portal_mis_agencias");
    expect(rpc).toHaveBeenCalledWith("portal_hola", { p_creator: "c1" });
  });
});
