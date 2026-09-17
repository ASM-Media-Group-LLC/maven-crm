import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NAV_SECTIONS, NAV_SECTION_KEYS, NAV_CATALOG } from "@/lib/navCatalog";
import { UNIVERSAL_MODULES } from "@/hooks/usePermissions";

// OFICINA DEJÓ DE SER UNA PÁGINA Y PASÓ A SER UNA SUITE (17/09/2026).
//
// El cambio toca CINCO lugares que tienen que decir lo mismo: el menú, las
// rutas, el catálogo del ⌘K, el catálogo de permisos y los módulos
// universales. Si dos se desalinean nadie ve un error: alguien simplemente
// deja de tener acceso, o una sección desaparece del buscador.
//
// Se lee con `fs` y no con `?raw`: un import que no resuelve deja el test sin
// cargar y el gate lo cuenta como verde.
const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const sidebar = leer("frontend/src/components/dashboard/DashboardSidebar.tsx");
const rutas = leer("frontend/src/App.tsx");
const roles = leer("frontend/src/pages/admin/useRoles.ts");

/** Los submódulos tal como los declara el catálogo de permisos. */
const subtabsDelCatalogo = (() => {
  const m = roles.match(/def\("Menú", "Oficina", \[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();

describe("Oficina como grupo del menú", () => {
  it("el catálogo de permisos declara las tres secciones", () => {
    expect(subtabsDelCatalogo).toEqual([
      "Documentos",
      "Hojas de cálculo",
      "Presentaciones",
    ]);
  });

  it("⚠️ el menú pide exactamente los mismos submódulos que declara el catálogo", () => {
    // Si el sidebar pide "Hojas" y el catálogo dice "Hojas de cálculo", el
    // ítem desaparece del menú para todo rol que no sea admin, y sin error.
    const bloque = sidebar.slice(sidebar.indexOf("const oficinaItemsAll"));
    const pedidos = [...bloque.slice(0, bloque.indexOf("];")).matchAll(/submodule: "([^"]+)"/g)]
      .map((m) => m[1]);
    expect(pedidos).toEqual(subtabsDelCatalogo);
  });

  it("Oficina la ve todo rol por default", () => {
    expect(UNIVERSAL_MODULES).toContain("Oficina");
  });
});

describe("las rutas de Oficina", () => {
  it("existen las tres secciones", () => {
    expect(rutas).toContain('path="/oficina"');
    expect(rutas).toContain('path="/oficina/hojas"');
    expect(rutas).toContain('path="/oficina/presentaciones"');
  });

  it("⚠️ las rutas fijas van ANTES de /oficina/:id", () => {
    // React Router 6 rankea lo estático por encima de lo dinámico, así que hoy
    // funcionaría en cualquier orden. Se fija igual porque el día que alguien
    // cambie de router o arme las rutas a mano, /oficina/hojas se leería como
    // un documento con id "hojas" y la sección entera dejaría de abrir.
    const doc = rutas.indexOf('path="/oficina/:id"');
    expect(doc).toBeGreaterThan(-1);
    expect(rutas.indexOf('path="/oficina/hojas"')).toBeLessThan(doc);
    expect(rutas.indexOf('path="/oficina/presentaciones"')).toBeLessThan(doc);
  });

  it("cada sección entra por su propio submódulo", () => {
    expect(rutas).toContain('module="Oficina" submodule="Documentos"');
    expect(rutas).toContain('module="Oficina" submodule="Hojas de cálculo"');
    expect(rutas).toContain('module="Oficina" submodule="Presentaciones"');
  });
});

describe("el catálogo del buscador (⌘K)", () => {
  it("⚠️ toda sección declarada está en NAV_SECTIONS", () => {
    // NAV_SECTIONS es un array, no un Record: si falta una sección tsc no dice
    // nada y el ⌘K deja de mostrar sus entradas, en silencio.
    for (const seccion of Object.keys(NAV_SECTION_KEYS)) {
      expect(NAV_SECTIONS).toContain(seccion);
    }
  });

  it("toda entrada del catálogo cae en una sección que se renderiza", () => {
    for (const entrada of NAV_CATALOG) {
      expect(NAV_SECTIONS).toContain(entrada.section);
    }
  });

  it("las tres secciones de Oficina son buscables", () => {
    const urls = NAV_CATALOG.filter((e) => e.module === "Oficina").map((e) => e.url);
    expect(urls).toEqual(["/oficina", "/oficina/hojas", "/oficina/presentaciones"]);
  });
});
