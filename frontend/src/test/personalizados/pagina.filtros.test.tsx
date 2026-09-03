import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Lo que jsdom no trae y Radix Select usa.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

// Supabase falso: toda consulta devuelve vacío y anota los filtros aplicados.
// Si algo entra en bucle de consultas, se corta con error en vez de colgar vitest.
const llamadas: string[] = [];
let consultas = 0;
vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {};
    for (const m of ["select", "order", "limit", "eq", "gte", "lt", "or", "insert", "update", "delete", "single"]) {
      b[m] = (...args: unknown[]) => { llamadas.push(`${m}:${JSON.stringify(args)}`); return b; };
    }
    b.then = (res: (v: unknown) => void) => {
      if (++consultas > 50) throw new Error("bucle de consultas");
      res({ data: [], error: null });
    };
    return b;
  };
  return { supabase: { from: () => builder(), storage: { from: () => ({}) } } };
});
vi.mock("react-router-dom", () => ({
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: "/personalizados", search: "" }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ explicitPermission: () => null, isLoading: false, canAccess: () => true }) }));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => ({ isSupervisorOrAbove: true, isAdmin: true, tier: "admin" }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, role: "admin" }) }));

import PersonalizadosPage from "@/pages/personalizados/PersonalizadosPage";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PersonalizadosPage /></QueryClientProvider>);
}

// Repro del crash reportado el 02/09/2026: con la tabla vacía, elegir un estado
// en el dropdown congelaba la pestaña. La causa era un bucle de efectos en
// PedidoDrawer (default `= []` inline como dependencia de un useEffect que
// seteaba estado). Este test se colgaba antes del arreglo.
describe("PersonalizadosPage · filtros", () => {
  it("elegir un estado en el dropdown con la tabla vacía no explota ni entra en bucle", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Todavía no hay pedidos")).toBeInTheDocument());

    // El disparador dice el nombre corto del filtro ("Estado") mientras no hay
    // nada elegido, y el valor elegido después.
    const trigger = screen.getAllByRole("combobox").find((c) => c.textContent?.trim() === "Estado")!;
    expect(trigger).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = document.querySelector('[role="listbox"]')!;
    expect(listbox).toBeTruthy();
    const opcion = [...listbox.querySelectorAll('[role="option"]')].find((o) => o.textContent === "Solicitado")!;
    fireEvent.keyDown(opcion, { key: "Enter" });

    await waitFor(() => expect(llamadas.some((l) => l.startsWith('eq:["status","solicitado"]'))).toBe(true));
    // Con filtro y sin resultados se dibuja el tablero (columnas vacías), no el estado vacío.
    await waitFor(() => expect(screen.queryByText("Todavía no hay pedidos")).not.toBeInTheDocument());
    expect(screen.getAllByText("Nada acá").length).toBeGreaterThan(0);
    // y el filtro queda a la vista en el disparador
    await waitFor(() => expect(trigger.textContent?.trim()).toBe("Solicitado"));
    // Un par de consultas por catálogo + la filtrada: nada de bucles.
    expect(consultas).toBeLessThan(10);
  });
});
