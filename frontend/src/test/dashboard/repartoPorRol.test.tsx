import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// El /dashboard reparte por rol. Este test fija las cuatro salidas, porque
// equivocarse acá manda a alguien a un tablero que no le sirve (o en blanco).
let rol = { isChatter: false, role: "employee", isLoading: false };
let permisos = { canAccess: (_m: string, _s?: string) => false, isLoading: false };
let tier = { tier: "member" as "member" | "supervisor" | "manager" | "admin", isLoading: false };

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => rol }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permisos }));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => tier }));
vi.mock("@/components/dashboard/DashboardContent", () => ({ default: () => <div>GENERICO</div> }));
vi.mock("@/pages/chatters/dashboard/ChatterDashboard", () => ({ default: () => <div>CHATTER</div> }));
vi.mock("@/pages/chatters/dashboard/EquipoDashboard", () => ({ default: () => <div>EQUIPO</div> }));
vi.mock("@/pages/manager/ManagerDashboard", () => ({ default: () => <div>MANAGER</div> }));
vi.mock("@/pages/closers/dashboard/CloserDashboard", () => ({ default: () => <div>CLOSER</div> }));
vi.mock("@/pages/Dashboard2", () => ({ default: () => <div>VENTAS</div> }));

import Dashboard from "@/pages/Dashboard";

// El repartidor lee `?ver=` de la URL, así que necesita router.
const pintar = (url = "/dashboard") =>
  render(<MemoryRouter initialEntries={[url]}><Dashboard /></MemoryRouter>);

const conVentas = (m: string, s?: string) => m === "Creator Sales" && s === "Dashboard";
const conChatters = (m: string, s?: string) => m === "Chatters" && s === "Rendimiento";
const conCreadores = (m: string) => m === "Creadores";
const conClosers = (m: string) => m === "Closers";

beforeEach(() => {
  rol = { isChatter: false, role: "employee", isLoading: false };
  permisos = { canAccess: () => false, isLoading: false };
  tier = { tier: "member", isLoading: false };
});

describe("/dashboard · reparto por rol", () => {
  it("el admin ve el Dashboard Ventas", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("un manager NO ve el de ventas: ese es el tablero del admin (decisión de Jhon)", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "manager", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("el manager de creadoras ve SU tablero", async () => {
    permisos = { canAccess: conCreadores, isLoading: false };
    tier = { tier: "manager", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("MANAGER")).toBeInTheDocument());
  });

  it("el admin gana sobre el tablero del manager", async () => {
    permisos = { canAccess: (m: string, s?: string) => conVentas(m, s) || conCreadores(m), isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("⚠️ nivel supervisor NO ve el de ventas: la RPC de ingresos le responde 42501 y sería un tablero vacío", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("quien supervisa chatters ve el tablero de su equipo", async () => {
    permisos = { canAccess: conChatters, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("EQUIPO")).toBeInTheDocument());
  });

  it("un chatter raso (member) con el permiso NO ve el del equipo", async () => {
    permisos = { canAccess: conChatters, isLoading: false };
    tier = { tier: "member", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
    expect(screen.queryByText("EQUIPO")).not.toBeInTheDocument();
  });

  it("el admin, aunque supervise chatters, ve el de ventas", async () => {
    permisos = { canAccess: (m: string, s?: string) => conVentas(m, s) || conChatters(m, s), isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("admin SIN el permiso de ventas se queda con el genérico", async () => {
    tier = { tier: "admin", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("GENERICO")).toBeInTheDocument());
  });

  it("Operations Sales ve el tablero del admin, aunque no sea admin", async () => {
    rol = { isChatter: false, role: "Operations Sales", isLoading: false };
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "manager", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("el closer ve su pipeline", async () => {
    permisos = { canAccess: conClosers, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("CLOSER")).toBeInTheDocument());
  });

  it("un admin con acceso a Closers sigue viendo el de ventas", async () => {
    permisos = { canAccess: (m: string, s?: string) => conVentas(m, s) || conClosers(m), isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
    expect(screen.queryByText("CLOSER")).not.toBeInTheDocument();
  });

  it("el supervisor de chatters gana sobre el de closers si tiene los dos permisos", async () => {
    permisos = { canAccess: (m: string, s?: string) => conChatters(m, s) || conClosers(m), isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("EQUIPO")).toBeInTheDocument());
  });

  it("el chatter ve el suyo, gane quien gane el resto de las condiciones", async () => {
    rol = { isChatter: true, role: "Chatter", isLoading: false };
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar();
    await waitFor(() => expect(screen.getByText("CHATTER")).toBeInTheDocument());
  });

  it("mientras cargan rol/permisos/tier no dibuja NINGÚN tablero (nada de parpadeo al genérico)", () => {
    permisos = { canAccess: conVentas, isLoading: true };
    tier = { tier: "admin", isLoading: false };
    const { container } = pintar();
    expect(screen.queryByText("GENERICO")).not.toBeInTheDocument();
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  // ── El desplegable del título (solo admin) ──
  it("el admin puede elegir el tablero de otro departamento con ?ver=", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar("/dashboard?ver=pipeline");
    await waitFor(() => expect(screen.getByText("CLOSER")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("?ver=ventas (o sin parámetro) es el tablero que le toca al admin", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar("/dashboard?ver=ventas");
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("un ?ver= inventado no rompe nada: cae en el tablero de su rol", async () => {
    permisos = { canAccess: conVentas, isLoading: false };
    tier = { tier: "admin", isLoading: false };
    pintar("/dashboard?ver=cualquiercosa");
    await waitFor(() => expect(screen.getByText("VENTAS")).toBeInTheDocument());
  });

  it("quien NO es admin no puede colarse en otro tablero con ?ver=", async () => {
    permisos = { canAccess: conChatters, isLoading: false };
    tier = { tier: "supervisor", isLoading: false };
    pintar("/dashboard?ver=ventas");
    await waitFor(() => expect(screen.getByText("EQUIPO")).toBeInTheDocument());
    expect(screen.queryByText("VENTAS")).not.toBeInTheDocument();
  });

  it("y un chatter con ?ver= sigue viendo el suyo", async () => {
    rol = { isChatter: true, role: "chatter", isLoading: false };
    tier = { tier: "member", isLoading: false };
    pintar("/dashboard?ver=roster");
    await waitFor(() => expect(screen.getByText("CHATTER")).toBeInTheDocument());
    expect(screen.queryByText("MANAGER")).not.toBeInTheDocument();
  });
});
