import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";

// Guarda del cambio pedido el 2026-10-12: el tablero de ventas se llama
// «Dashboard de Ventas», con el «de», no «Dashboard Ventas».
//
// Son dos claves con el mismo rótulo: el título desplegable del admin en
// /dashboard (lo que se ve en pantalla) y el enlace de la raíz (/) de
// desarrollo. Si alguien revierte una a «Dashboard Ventas», este test lo frena.
describe("el tablero de ventas se llama «Dashboard de Ventas»", () => {
  it("las dos claves i18n llevan el «de»", () => {
    expect(translations["dashboard.board.sales.title"].es).toBe("Dashboard de Ventas");
    expect(translations["page.index.salesDashboard"].es).toBe("Dashboard de Ventas");
  });
});
