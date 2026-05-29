import { describe, it, expect } from "vitest";
import {
  filterMetricsByPermissions,
  metricsAreFromFallback,
  METRICS_CATALOG,
} from "@/hooks/reportMetricsCatalog";
import { roleToModule, COMBINED_ROLE_SENTINEL } from "@/hooks/useReportSchedules";

// Regresión: el rol "Closer Supervisor" (creado desde Administración →
// Roles, NO built-in) tiraba lista vacía de métricas porque el filtro
// estricto exigía que el rol tuviera permisos exactos en módulos canónicos
// ("Closers", "Agency QA"). Si el admin no los configuraba, el modal
// quedaba sin nada para tildar.
//
// Fix esperado:
//   1. roleToModule("Closer Supervisor") → "closers" (mapping explícito)
//   2. roleToModule de un rol custom desconocido se infiere por substring
//   3. filterMetricsByPermissions devuelve TODAS las métricas del módulo
//      cuando el rol tiene 0 permisos exactos (fallback)
//   4. metricsAreFromFallback distingue entre fallback y match real
//   5. Match de módulos es case-insensitive ("closers" ≡ "Closers")
describe("reportMetricsCatalog — bug Closer Supervisor", () => {
  describe("roleToModule", () => {
    it("mapea built-in roles correctamente", () => {
      expect(roleToModule("closer")).toBe("closers");
      expect(roleToModule("Closer Supervisor")).toBe("closers");
      expect(roleToModule("Chatter Supervisor")).toBe("chatters");
      expect(roleToModule("LLG")).toBe("llg");
      expect(roleToModule("employee")).toBe("llg");
      expect(roleToModule(COMBINED_ROLE_SENTINEL)).toBe("combined");
    });

    it("infiere módulo por substring para roles custom no listados", () => {
      // Closers
      expect(roleToModule("Closer Supervisor Senior")).toBe("closers");
      expect(roleToModule("Senior Closing Lead")).toBe("closers");
      expect(roleToModule("Cerrador Argentina")).toBe("closers");
      // Chatters
      expect(roleToModule("Chatter Junior")).toBe("chatters");
      expect(roleToModule("Chateador Pro")).toBe("chatters");
      // LLG / LeadGen
      expect(roleToModule("Lead Gen Manager")).toBe("llg");
      expect(roleToModule("LeadGen Lead")).toBe("llg");
      expect(roleToModule("LLG Senior")).toBe("llg");
    });

    it("falla a 'llg' cuando no hay match (mismo comportamiento previo)", () => {
      expect(roleToModule("Random Custom Role")).toBe("llg");
      expect(roleToModule("Marketing Lead")).toBe("llg");
    });
  });

  describe("filterMetricsByPermissions — fallback robusto", () => {
    it("devuelve métricas del módulo cuando el rol tiene permisos exactos", () => {
      const result = filterMetricsByPermissions("closers", [
        { module: "Closers", submodule: null },
        { module: "Agency QA", submodule: null },
      ]);
      // Todas las métricas del módulo closers deberían aparecer
      const expected = METRICS_CATALOG.filter((m) => m.module === "closers");
      expect(result).toHaveLength(expected.length);
    });

    it("filtra correctamente cuando solo tiene Closers (sin Agency QA)", () => {
      const result = filterMetricsByPermissions("closers", [
        { module: "Closers", submodule: null },
      ]);
      // Solo deberían aparecer métricas que requieren Closers (no QA)
      expect(result.every((m) => m.requires.some((r) => r.module === "Closers"))).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThan(METRICS_CATALOG.filter((m) => m.module === "closers").length);
    });

    it("FALLBACK: devuelve todas las métricas del módulo cuando rol no tiene permisos", () => {
      const result = filterMetricsByPermissions("closers", []);
      const expected = METRICS_CATALOG.filter((m) => m.module === "closers");
      expect(result).toHaveLength(expected.length);
    });

    it("FALLBACK: devuelve todas las métricas cuando los permisos no matchean módulos del catálogo", () => {
      // Rol custom con permisos a módulos no canónicos
      const result = filterMetricsByPermissions("closers", [
        { module: "Custom Module XYZ", submodule: null },
        { module: "Another Random", submodule: null },
      ]);
      const expected = METRICS_CATALOG.filter((m) => m.module === "closers");
      expect(result).toHaveLength(expected.length);
    });

    it("match case-insensitive ('closers' ≡ 'Closers')", () => {
      const result = filterMetricsByPermissions("closers", [
        { module: "closers", submodule: null }, // lowercase
        { module: "agency qa", submodule: null }, // lowercase
      ]);
      const expected = METRICS_CATALOG.filter((m) => m.module === "closers");
      expect(result).toHaveLength(expected.length);
    });

    it("module='combined' devuelve métricas de los 3 módulos sin filtrar permisos", () => {
      const result = filterMetricsByPermissions("combined", []);
      const expected = METRICS_CATALOG.filter((m) =>
        ["llg", "closers", "chatters"].includes(m.module),
      );
      expect(result).toHaveLength(expected.length);
    });
  });

  describe("metricsAreFromFallback — UI hint", () => {
    it("retorna true cuando NO hay permisos del rol pero hay métricas visibles", () => {
      const visible = filterMetricsByPermissions("closers", []);
      const isFallback = metricsAreFromFallback("closers", [], visible);
      expect(isFallback).toBe(true);
    });

    it("retorna false cuando los permisos matchean estrictamente", () => {
      const perms = [
        { module: "Closers", submodule: null },
        { module: "Agency QA", submodule: null },
      ];
      const visible = filterMetricsByPermissions("closers", perms);
      const isFallback = metricsAreFromFallback("closers", perms, visible);
      expect(isFallback).toBe(false);
    });

    it("retorna false para módulo combined (siempre muestra todo)", () => {
      const visible = filterMetricsByPermissions("combined", []);
      const isFallback = metricsAreFromFallback("combined", [], visible);
      expect(isFallback).toBe(false);
    });

    it("retorna false cuando no hay métricas visibles", () => {
      const isFallback = metricsAreFromFallback("closers", [], []);
      expect(isFallback).toBe(false);
    });
  });
});
