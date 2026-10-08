import { describe, it, expect } from "vitest";

// EL PORTAL SE VE COMO MAVEN (Jhon, 06/10: «hazlo más apegado a lo que es
// Maven y su diseño… modo oscuro, light, inglés y español como en Maven,
// campana de notificaciones»). Con las MISMAS piezas, no con copias: si Maven
// cambia, el portal cambia con él.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/pages/portal/PortalLayout.tsx",
  "/frontend/src/pages/portal/PortalAjustes.tsx",
  "/frontend/src/pages/Settings.tsx",
  "/frontend/src/components/dashboard/DashboardSidebar.tsx",
  "/frontend/src/components/dashboard/DashboardTopbar.tsx",
], { query: "?raw", import: "default", eager: true });
const fuente = (n: string) => Object.entries(fuentes).find(([k]) => k.endsWith(n))?.[1] ?? "";

describe("el portal usa las piezas de Maven", () => {
  it("las fuentes cargaron", () => {
    for (const n of ["PortalLayout.tsx", "PortalAjustes.tsx", "Settings.tsx", "DashboardSidebar.tsx", "DashboardTopbar.tsx"]) {
      expect(fuente(n).length, n).toBeGreaterThan(500);
    }
  });

  it("menú lateral: el Sidebar y el iluminado de ítem de Maven, la marca con «Mi espacio»; abajo su foto", () => {
    const marco = fuente("PortalLayout.tsx");
    expect(marco).toMatch(/<Sidebar collapsible="icon">/);
    // La marca chica con «Mi espacio» (Jhon, 06/10), no el logo grande.
    expect(marco).toMatch(/<MarcaM /);
    expect(marco).toMatch(/t\("portal\.shell\.espacio"\)/);
    // El iluminado de Maven en el ítem activo, con el tamaño de antes.
    expect(marco).toMatch(/className=\{cn\(LINK_CLASS, "min-h-11[^"]*"\)\} activeClassName=\{ACTIVE_CLASS\}/);
    expect(marco).toMatch(/<UserAvatar name=\{nombre\} src=\{activa\.foto\}/);
    // Los mismos estilos de ítem que el menú del equipo.
    expect(fuente("DashboardSidebar.tsx")).toMatch(/from "@\/components\/dashboard\/estilosDelMenu"/);
  });

  it("Ajustes NO va en el menú del computador (está el engranaje de la tarjeta); en la barra del celular SÍ (Jhon, 08/10)", () => {
    const marco = fuente("PortalLayout.tsx");
    expect(marco).toMatch(/const SECCIONES_DEL_MENU = SECCIONES\.filter\(\(s\) => s\.a !== RUTA_AJUSTES\)/);
    expect(marco).toMatch(/const RUTA_AJUSTES = "\/portal\/ajustes"/);
    // El menú lateral (computador) usa la lista sin Ajustes…
    const menu = marco.slice(marco.indexOf("<SidebarMenu"), marco.indexOf("</SidebarMenu>"));
    expect(menu).toMatch(/SECCIONES_DEL_MENU\.map/);
    // …y la barra de abajo (celular, md:hidden), la completa.
    const barra = marco.slice(marco.indexOf("bottom-0 z-30 flex border-t"), marco.indexOf("</nav>", marco.indexOf("bottom-0 z-30 flex border-t")));
    expect(barra).toMatch(/\{SECCIONES\.map/);
    // Y el engranaje sigue llevando a Ajustes.
    expect(marco).toMatch(/navigate\(RUTA_AJUSTES\)/);
  });

  it("barra de arriba: el idioma y la campana de Maven (sin «Ver todas», que es del equipo); claro/oscuro", () => {
    const marco = fuente("PortalLayout.tsx");
    expect(marco).toMatch(/<SelectorDeIdioma \/>/);
    expect(marco).toMatch(/<NotificationBell verTodas=\{null\} \/>/);
    expect(marco).toMatch(/setTheme\(oscuro \? "light" : "dark"\)/);
    expect(fuente("DashboardTopbar.tsx")).toMatch(/<SelectorDeIdioma \/>/);
  });

  it("Ajustes: la MISMA tarjeta de Apariencia del equipo", () => {
    expect(fuente("PortalAjustes.tsx")).toMatch(/<TarjetaDeApariencia conDensidad=\{false\} \/>/);
    expect(fuente("Settings.tsx")).toMatch(/<TarjetaDeApariencia \/>/);
    expect(fuente("Settings.tsx")).not.toMatch(/const AppearanceCard/);
  });
});

describe("Ajustes del portal", () => {
  // 08/10 (Jhon: «esta parte se ve bien fea»): el mismo esquema que Ajustes de
  // Maven, con riel de secciones y la sección ocupando el ancho. «Cerrar sesión»
  // sigue siendo siempre lo último (06/10): la última opción del riel.
  it("riel como en Maven: secciones y, al final, «Cerrar sesión»", () => {
    const ajustes = fuente("PortalAjustes.tsx");
    const maven = fuente("Settings.tsx");
    for (const clase of ["sub-rail", "sidebar-glass-hover", "sidebar-glass-active"]) {
      expect(maven, `Maven usa ${clase}`).toContain(clase);
      expect(ajustes, `el portal usa ${clase}`).toContain(clase);
    }
    const riel = ajustes.slice(ajustes.indexOf("<aside"), ajustes.indexOf("</aside>"));
    expect(riel.indexOf("<nav")).toBeGreaterThan(0);
    // En el computador, la última opción del riel…
    expect(riel.indexOf("<BotonSalir"), "cerrar sesión va en el riel, después de las secciones").toBeGreaterThan(riel.indexOf("</nav>"));
    expect(riel).toMatch(/hidden border-t[^"]*md:block">\s*<BotonSalir/);
    // …y en el celular (el riel queda arriba), lo último de la página.
    const seccion = ajustes.slice(ajustes.indexOf("<section"), ajustes.indexOf("</section>"));
    expect(seccion.trimEnd()).toMatch(/md:hidden">\s*<BotonSalir onClick=\{salir\} \/>\s*<\/div>$/);
    expect(ajustes.match(/t\("portal\.shell\.salir"\)/g)?.length, "un solo botón, usado en los dos lugares").toBe(1);
  });

  it("«Mi cuenta» lleva perfil, contraseña y la MISMA Apariencia de Maven", () => {
    const ajustes = fuente("PortalAjustes.tsx");
    const cuenta = ajustes.slice(ajustes.indexOf("function MiCuenta"), ajustes.indexOf("function Agencias"));
    expect(cuenta).toMatch(/<UserAvatar name=\{nombre\} src=\{activa\.foto\}/);
    expect(cuenta).toMatch(/<FormContrasena/);
    expect(cuenta).toMatch(/<TarjetaDeApariencia conDensidad=\{false\} \/>/);
  });
});
