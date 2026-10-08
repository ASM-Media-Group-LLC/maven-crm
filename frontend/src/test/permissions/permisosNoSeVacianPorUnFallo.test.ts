import { describe, it, expect } from "vitest";

// UN FALLO AL CARGAR PERMISOS NO ES "SIN PERMISOS".
//
// John Idrobo (07/10): "se cerró el roleplay solo desde la plataforma… y
// tampoco me da opción de volver a abrir". Su captura: menú con solo los
// módulos universales. En la base su rol estaba intacto. La consulta a
// roles_config ignoraba el error: un 500/401 puntual devolvía [] y
// PermissionRoute lo mandó al dashboard en pleno roleplay. Misma familia que
// el rol (#1593, memoria permisos_fallo_vs_vacio), pero en la segunda consulta.
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const permisos = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/usePermissions.ts", { query: "?raw", import: "default", eager: true }));
const rol = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useUserRole.ts", { query: "?raw", import: "default", eager: true }));

describe("permisos: fallo ≠ vacío", () => {
  it("las fuentes se cargaron", () => {
    expect(permisos.length).toBeGreaterThan(500);
    expect(rol.length).toBeGreaterThan(500);
  });
  it("la consulta a roles_config lanza si falla, antes de concluir 'sin configurar'", () => {
    const i = permisos.indexOf("if (rcError) throw rcError;");
    const j = permisos.indexOf("if (!roleConfig) return [];");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });
  it("hayError solo cuando no hay nada que usar: con datos previos, se siguen usando", () => {
    expect(permisos).toMatch(/hayError: \(roleError && !roleConocido\) \|\| \(permsError && permissionsData === undefined\)/);
    expect(rol).toMatch(/roleConocido: roleData !== undefined/);
  });
  it("el grupo del rol tampoco se traga el error", () => {
    expect(rol).toMatch(/if \(rgError\) throw rgError;/);
  });
});
