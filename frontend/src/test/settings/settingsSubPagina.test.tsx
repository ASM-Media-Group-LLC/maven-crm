// Refrescar estando en una sub-página de Settings tiene que dejarte AHÍ.
//
// Bug real (04/09): entrabas a Administración → Usuarios (/settings?sub=usuarios),
// refrescabas, y aterrizabas en Mi cuenta. Dos causas sumadas:
//   1. el tab del rail nacía siempre en "account", sin mirar la URL;
//   2. el effect que limpia el ?sub= al cambiar de tab corría TAMBIÉN en el
//      montaje — un useEffect siempre corre después del primer render — así que
//      borraba el parámetro antes de que nadie lo leyera.
//
// La (2) es la que se "arregla" sola si alguien saca el ref por parecer de más,
// y no la agarra ni el typecheck ni el build. Por eso este test.
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../permissions/renderWithProviders";
import type { AuthMockValue } from "../permissions/auth-mock";
import { adminUser, fakeSession } from "../permissions/fixtures";

vi.mock("@/integrations/supabase/client", async () => {
  const { getOrCreateStub } = await import("../permissions/supabase-stub");
  return { supabase: getOrCreateStub().client };
});

// Los permisos son lo único que decide si el tab de Administración existe.
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
  UNIVERSAL_MODULES: [],
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, role: "admin", isLoading: false }),
}));

// El provider de idioma no aporta nada acá: `t` devuelve la clave y listo.
// `useLanguageSiHay` también: lo usan las primitivas de components/ui/ (el
// encabezado de la página) y useFormato.
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { t: (k: string) => k, language: "es", setLanguage: () => {} };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

// Las sub-páginas reales arrastran media app (edge functions, storage, tablas).
// Acá sólo importa CUÁL se monta, así que van stubbeadas.
vi.mock("@/pages/admin/AdminUsuarios", () => ({ default: () => <div>SUBPAGINA_USUARIOS</div> }));
vi.mock("@/pages/admin/AuditoriaRoles", () => ({ default: () => <div>SUBPAGINA_AUDITORIA</div> }));
vi.mock("@/pages/admin/AdminReportes", () => ({ default: () => <div>SUBPAGINA_REPORTES</div> }));
vi.mock("@/pages/admin/AdminApiKeys", () => ({ default: () => <div>SUBPAGINA_APIKEYS</div> }));
vi.mock("@/pages/admin/ConexionEquipo", () => ({ default: () => <div>SUBPAGINA_CONEXION_EQUIPO</div> }));

import Settings from "@/pages/Settings";

const auth: AuthMockValue = {
  user: adminUser,
  session: fakeSession(adminUser),
  loading: false,
  signOut: async () => {},
};

const montar = (url: string) =>
  renderWithProviders(<Settings />, { initialEntries: [url], routePath: "/settings", auth });

describe("Settings — entrar/refrescar sobre una sub-página", () => {
  it("con ?sub=usuarios monta Usuarios, no Mi cuenta", async () => {
    montar("/settings?sub=usuarios");
    expect(await screen.findByText("SUBPAGINA_USUARIOS")).toBeTruthy();
  });

  it("cada ?sub= monta la suya", async () => {
    montar("/settings?sub=api-keys");
    expect(await screen.findByText("SUBPAGINA_APIKEYS")).toBeTruthy();
  });

  it("?sub=conexion-equipo monta Conectar tu plataforma", async () => {
    montar("/settings?sub=conexion-equipo");
    expect(await screen.findByText("SUBPAGINA_CONEXION_EQUIPO")).toBeTruthy();
  });

  it("sin ?sub= no monta ninguna sub-página", () => {
    montar("/settings");
    expect(screen.queryByText("SUBPAGINA_USUARIOS")).toBeNull();
    expect(screen.queryByText("SUBPAGINA_APIKEYS")).toBeNull();
  });

  it("un ?sub= inventado se ignora sin romper", () => {
    montar("/settings?sub=noexiste");
    expect(screen.queryByText("SUBPAGINA_USUARIOS")).toBeNull();
  });
});
