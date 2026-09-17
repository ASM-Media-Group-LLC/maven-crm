import { describe, it, expect } from "vitest";
import { MODULE_PERMISSION_MAP } from "@/lib/notificationHelpers";

// UNA NOTIFICACIÓN SOLO SE VE (Y SOLO SE EMPUJA) SI TIENES SU MÓDULO.
//
// La regla se aplica comparando required_permission_module contra role_permissions
// por STRING EXACTO. Auditoría 15/09: el evaluador escribía "ChatterEvaluator",
// un módulo que no existe (el real es Chatters → Evaluator), y canAccess lo
// escondía a todo el que no fuera admin — 2 examinadores llevaban semanas sin ver
// sus notificaciones. Esta guarda fija los nombres canónicos: los de
// role_permissions en prod el 15/09. Si nace un módulo, se agrega acá a propósito.
const MODULOS_CANONICOS = new Set([
  "Administración", "Agency QA", "Chatters", "Closers", "Contactos", "Correo", "Cowork",
  "Creadores", "Creator Sales", "Dashboard", "Finanzas", "Grabaciones", "HR", "LeadGen",
  "Meet", "Messenger", "Panel de control", "Parrilla", "Personalizados", "Promolog",
  "Scouter Assist", "Telefonos", "Telegram", "Tickets", "WhatsApp",
]);

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

describe("módulos de permiso en notificaciones", () => {
  it("todo productor del frontend usa un módulo que existe", () => {
    const malos: string[] = [];
    for (const [ruta, c] of Object.entries(fuentes)) {
      if (ruta.includes("/test/")) continue;
      for (const m of c.matchAll(/required_permission_module:\s*"([^"]+)"/g)) {
        if (!MODULOS_CANONICOS.has(m[1])) malos.push(`${ruta} → "${m[1]}"`);
      }
    }
    expect(malos, `Módulos que no existen en role_permissions:\n${malos.join("\n")}`).toEqual([]);
  });

  it("el mapa módulo→permiso de la campana también", () => {
    for (const [origen, modulo] of Object.entries(MODULE_PERMISSION_MAP)) {
      if (modulo === null) continue;
      expect(MODULOS_CANONICOS.has(modulo), `${origen} → "${modulo}"`).toBe(true);
    }
  });

  it("el evaluador va bajo Chatters, con submódulo Evaluator", () => {
    const c = Object.entries(fuentes).find(([r]) => r.endsWith("/hooks/useChatterEvaluator.ts"))?.[1] ?? "";
    expect(c).toMatch(/required_permission_module:\s*"Chatters",\s*required_permission_submodule:\s*"Evaluator"/);
    // El patrón, no la palabra: el comentario del productor cuenta la historia y la nombra.
    expect(c).not.toMatch(/required_permission_module:\s*"ChatterEvaluator"/);
    expect(MODULE_PERMISSION_MAP["chatter-evaluator"]).toBe("Chatters");
  });
});
