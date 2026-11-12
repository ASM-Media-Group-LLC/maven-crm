import { describe, it, expect } from "vitest";

// QUIÉN VE ARGOS (Alvaro, 12/11/2026): dueño, admins, RR. HH. y supervisores.
// La puerta la decide la base (ve_argos) y no el permiso del módulo HR: los
// supervisores (rol Chatter / Chatter Supervisor) no lo tienen, y si el botón o
// la ruta vuelven a pasar por canAccess("HR", "Monitor IA") o por soloDueno, a
// Grace (admin) y a Daniel/Breyner/Vanessa (supervisores) se les esconde el ojo.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/App.tsx", "/frontend/src/components/dashboard/DashboardSidebar.tsx"], { query: "?raw", import: "default", eager: true });

const app = fuentes["/frontend/src/App.tsx"];
const menu = fuentes["/frontend/src/components/dashboard/DashboardSidebar.tsx"];

describe("Argos: lo ven dueño, admins, RR. HH. y supervisores", () => {
  it("las rutas de Argos usan la puerta `argos` (ve_argos), no soloDueno", () => {
    for (const ruta of ["/hr/monitor-ia", "/hr/expediente/:userId", "/hr/argos-comparativo"]) {
      const linea = app.split("\n").find((l) => l.includes(`path="${ruta}"`)) ?? "";
      expect(linea, ruta).toContain(" argos>");
      expect(linea, ruta).not.toContain("soloDueno");
    }
  });
  it("los ajustes de Argos siguen solo para el dueño", () => {
    const linea = app.split("\n").find((l) => l.includes('path="/hr/argos-ajustes"')) ?? "";
    expect(linea).toContain("soloDueno");
  });
  it("el botón del ojo en el menú depende de useVeArgos, no del permiso del módulo", () => {
    expect(menu).toContain("useVeArgos()");
    expect(menu).not.toContain('canAccess("HR", "Monitor IA") && veArgos');
  });
});
