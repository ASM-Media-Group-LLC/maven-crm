import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";
import { empleados } from "@/lib/i18n/empleados";
import { NAV_CATALOG, filterNavCatalog } from "@/lib/navCatalog";

// La sección Empleados (perfil de desempeño + calendario de avisos) solo la ven
// supervisores y superiores. Tres cosas tienen que decir lo mismo o alguien ve
// de más / de menos y sin error visible:
//   1. El catálogo del ⌘K marca la entrada como supervisorOnly.
//   2. La ruta en App.tsx va envuelta en SupervisorRoute.
//   3. Las claves que usan las páginas existen en el diccionario.

const fuentes = import.meta.glob("../../App.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const app = Object.values(fuentes)[0] ?? "";

describe("sección Empleados", () => {
  it("el módulo i18n quedó registrado en el diccionario", () => {
    const sinRegistrar = Object.keys(empleados).filter((k) => !(k in translations));
    expect(
      sinRegistrar,
      `Faltó sumar empleados en lib/i18n.ts:\n${sinRegistrar.join("\n")}`,
    ).toEqual([]);
  });

  it("la entrada del ⌘K es solo para supervisores", () => {
    const entrada = NAV_CATALOG.find((e) => e.url === "/empleados");
    expect(entrada, "No está /empleados en el catálogo de navegación").toBeTruthy();
    expect(entrada?.supervisorOnly).toBe(true);
    expect(entrada?.i18nKey).toBe("empleados.nav.title");
  });

  it("un miembro sin nivel no ve Empleados en el ⌘K; un supervisor sí", () => {
    const todo = () => true;
    const miembro = filterNavCatalog(todo, false, false).some((e) => e.url === "/empleados");
    const supervisor = filterNavCatalog(todo, false, true).some((e) => e.url === "/empleados");
    const admin = filterNavCatalog(todo, true, false).some((e) => e.url === "/empleados");
    expect(miembro).toBe(false);
    expect(supervisor).toBe(true);
    expect(admin).toBe(true); // un admin pasa el gate de supervisor
  });

  it("la ruta /empleados está gateada por SupervisorRoute", () => {
    expect(app).toContain('path="/empleados"');
    expect(app).toContain("<SupervisorRoute><EmpleadosPage /></SupervisorRoute>");
    expect(app).toContain("<SupervisorRoute><EmpleadoProfilePage /></SupervisorRoute>");
  });
});
