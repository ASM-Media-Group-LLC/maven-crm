// El aviso de "esto se va a borrar solo" tiene que llegar ANTES de que se borre.
// Si el umbral se corre por accidente, alguien pierde una cuenta sin haber visto
// una sola señal en rojo.

import { describe, it, expect } from "vitest";
import { tonoDelPlazo } from "@/pages/admin/PapeleraTabla";

describe("tonoDelPlazo", () => {
  it("los últimos 3 días van en rojo", () => {
    expect(tonoDelPlazo(0)).toBe("destructive");
    expect(tonoDelPlazo(1)).toBe("destructive");
    expect(tonoDelPlazo(3)).toBe("destructive");
  });

  it("la última semana avisa, sin alarmar", () => {
    expect(tonoDelPlazo(4)).toBe("outline");
    expect(tonoDelPlazo(7)).toBe("outline");
  });

  it("el resto del plazo va tranquilo", () => {
    expect(tonoDelPlazo(8)).toBe("secondary");
    expect(tonoDelPlazo(30)).toBe("secondary");
  });
});


// LA PAPELERA SE PUEDE LISTAR, Y UN FALLO NO SE DISFRAZA DE VACÍO.
//
// Jhon (24/09): "Eliminadas no me muestra las cuentas eliminadas recientemente".
// Había ocho en la base. El edge exigía user_id para toda acción que no fuera
// create_user, list_deleted_users no lleva ninguno → 400, y el hook lo pintaba
// como "No hay cuentas eliminadas".
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const edge = uno((import.meta as unknown as Glob).glob("/supabase/functions/admin-user-actions/index.ts", { query: "?raw", import: "default", eager: true }));
const hookPapelera = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/admin/usePapelera.ts", { query: "?raw", import: "default", eager: true }));
const tabla = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/admin/PapeleraTabla.tsx", { query: "?raw", import: "default", eager: true }));

describe("listar la papelera", () => {
  it("las fuentes se cargaron", () => {
    for (const s of [edge, hookPapelera, tabla]) expect(s.length).toBeGreaterThan(500);
  });
  it("el edge no exige user_id para listar", () => {
    expect(edge).toMatch(/SIN_USER_ID = new Set\(\[[^\]]*"list_deleted_users"[^\]]*\]\)/);
    expect(edge).toMatch(/if \(!SIN_USER_ID\.has\(action\) && !user_id\)/);
  });
  it("el hook expone el error y la tabla lo muestra antes de decir que está vacía", () => {
    expect(hookPapelera).toMatch(/error: error \? \(error as Error\)\.message : null/);
    const iError = tabla.indexOf("if (error) {");
    const iVacio = tabla.indexOf("if (cuentas.length === 0) {");
    expect(iError).toBeGreaterThan(-1);
    expect(iError).toBeLessThan(iVacio);
    expect(tabla).toMatch(/t\("common\.retry"\)/);
  });
});
