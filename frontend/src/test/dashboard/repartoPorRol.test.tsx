import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// El /dashboard reparte por rol. Este test fija las cuatro salidas, porque
// equivocarse acá manda a alguien a un tablero que no le sirve (o en blanco).
let rol = { isChatter: false, isLoading: false };
let permisos = { canAccess: (_m: string, _s?: string) => false, isLoading: false };
let tier = { tier: "member" as "member" | "supervisor" | "manager" | "admin", isLoading: false };

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => rol }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permisos }));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => tier }));
vi.mock("@/components/dashboard/DashboardContent", () => ({ default: () => <div>GENERICO</div> }));
vi.mock("@/pages/chatters/dashboard/ChatterDashboard", () => ({ default: () => <div>CHATTER</div> }));
vi.mock("@/pages/Dashboard2", () => ({ default: () => <div>VENTAS</div> }));

import Dashboard from "@/pages/Dashboard";

const conVentas = (m: string, s?: string) => m === "Creator Sales" && s === "Dashboard";

beforeEach(() => {
  rol = { isChatter: false, isLoading: false };
  permisos = { canAccess: () => false, isLoading: false };
  tier = { tier: "member", isLoading: false };
});

describe("/dashboard · reparto por rol", () => {
  it("el admin ve el Dashboard Ventas", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("un manager NO: el Dashboard Ventas es el tablero del admin (decisión de Jhon)", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "manager", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("⚠️ nivel supervisor tampoco: la RPC de ingresos le responde 42501 y vería un tablero vacío", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("admin SIN el permiso de ventas se queda con el genérico", async () => {
    tier = { tier: "admin", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
  });

  it("el chatter ve el suyo, gane quien gane el resto de las condiciones", async () => {
    rol = { isChatter: true, isLoading: false };
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("CHATTER")).toBeInTheDocument());
  });

  it("mientras cargan rol/permisos/tier no dibuja NINGÚN tablero (nada de parpadeo al genérico)", () => {
    permisos = { canAccess: conVentas, isLoading: true };
    tier = { tier: "admin", isLoading: false };
    const { container } = render(<Dashboard />);
    expect(screen.queryByText("GENERICO")).not.toBeInTheDocument();
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });
});
