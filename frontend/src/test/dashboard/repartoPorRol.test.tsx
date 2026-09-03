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
vi.mock("@/pages/chatters/dashboard/EquipoDashboard", () => ({ default: () => <div>EQUIPO</div> }));
vi.mock("@/pages/manager/ManagerDashboard", () => ({ default: () => <div>MANAGER</div> }));
vi.mock("@/pages/Dashboard2", () => ({ default: () => <div>VENTAS</div> }));

import Dashboard from "@/pages/Dashboard";

const conVentas = (m: string, s?: string) => m === "Creator Sales" && s === "Dashboard";
const conChatters = (m: string, s?: string) => m === "Chatters" && s === "Rendimiento";
const conCreadores = (m: string) => m === "Creadores";

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

  it("un manager NO ve el de ventas: ese es el tablero del admin (decisión de Jhon)", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "manager", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("el manager de creadoras ve SU tablero", async () => {
    permisos = { canAccess: conCreadores, isLoading: false };
    tier = { tier: "manager", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("MANAGER")).toBeInTheDocument());
  });

  it("el admin gana sobre el tablero del manager", async () => {
    permisos = { canAccess: (m: string, s?: string) => conVentas(m, s) || conCreadores(m), isLoading: false };
    tier = { tier: "admin", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("⚠️ nivel supervisor NO ve el de ventas: la RPC de ingresos le responde 42501 y sería un tablero vacío", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("quien supervisa chatters ve el tablero de su equipo", async () => {
    permisos = { canAccess: conChatters, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("EQUIPO")).toBeInTheDocument());
  });

  it("un chatter raso (member) con el permiso NO ve el del equipo", async () => {
    permisos = { canAccess: conChatters, isLoading: false };
    tier = { tier: "member", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("EQUIPO")).not.toBeInTheDocument();
  });

  it("el admin, aunque supervise chatters, ve el de ventas", async () => {
    permisos = { canAccess: (m: string, s?: string) => conVentas(m, s) || conChatters(m, s), isLoading: false };
    tier = { tier: "admin", isLoading: false };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
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
