import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// GUÍA PARA INSTALAR LA APP (/app, Alvaro 18/11/2026). Desde el viernes 20/11
// Cowork en el computador va solo en la app de Maven.
//
// Lo que se cuida:
//   · la ruta existe para todos (sin módulo), en el menú, en el ⌘K y precargada;
//   · se puede abrir aunque Cowork sea obligatorio (si no, quien no tiene la app
//     rebotaba entre el bloqueo de Cowork y la guía) y no ofrece «abrir en la app»;
//   · el aviso y el bloqueo de Cowork enlazan aquí;
//   · abre en la pestaña del sistema de quien mira, con el instalador correcto,
//     el aviso azul de Windows, el arreglo «−»/«+» de Mac y «Olvidé mi contraseña»;
//   · dentro de la app dice «ya estás en la app»; en el celular, que no hace falta.

const soloApp = vi.hoisted(() => ({ desde: null as Date | null }));
vi.mock("@/components/CoworkSoloApp", () => ({ useCoworkSoloApp: () => ({ estado: "nada", desde: soloApp.desde }) }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    setLanguage: () => {},
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});
vi.mock("@/components/ui/page-header", () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => <header><h1>{title}</h1><p>{subtitle}</p></header>,
}));

import GuiaAppPage, { VistaGuiaApp } from "@/pages/guiaApp/GuiaAppPage";
import {
  RUTA_GUIA_APP, archivoDeDescarga, esCelularOTableta, sistemaDeLaGuia, urlDeDescarga,
} from "@/lib/guiaApp";
import { debeOfrecerApp } from "@/lib/abrirEnApp";
import { rutaLibreDeCowork } from "@/hooks/useCoworkObligatorio";
import { NAV_CATALOG } from "@/lib/navCatalog";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const CEL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/App.tsx",
  "/frontend/src/components/dashboard/DashboardSidebar.tsx",
  "/frontend/src/lib/prefetchRutas.ts",
  "/frontend/src/components/CoworkSoloApp.tsx",
], { query: "?raw", import: "default", eager: true });

describe("la guía: lo que decide", () => {
  it("abre en Mac solo en un Mac de verdad; lo demás, en Windows", () => {
    expect(sistemaDeLaGuia(MAC, false)).toBe("mac");
    expect(sistemaDeLaGuia(WIN, false)).toBe("windows");
    expect(sistemaDeLaGuia(MAC, true)).toBe("windows"); // iPad
    expect(sistemaDeLaGuia(CEL, true)).toBe("windows");
  });

  it("sabe si mira desde un celular o tableta", () => {
    expect(esCelularOTableta(CEL, true)).toBe(true);
    expect(esCelularOTableta(MAC, true)).toBe(true);
    expect(esCelularOTableta(MAC, false)).toBe(false);
    expect(esCelularOTableta(WIN, false)).toBe(false);
  });

  it("cada sistema baja su instalador del bucket público", () => {
    expect(archivoDeDescarga("mac")).toBe("Maven-Mac.dmg");
    expect(archivoDeDescarga("windows")).toBe("Maven-Windows.exe");
    expect(urlDeDescarga("windows", "https://x.supabase.co")).toBe("https://x.supabase.co/storage/v1/object/public/descargas/Maven-Windows.exe");
  });
});

describe("la ruta /app", () => {
  const app = fuentes["/frontend/src/App.tsx"] ?? "";
  const menu = fuentes["/frontend/src/components/dashboard/DashboardSidebar.tsx"] ?? "";
  const precarga = fuentes["/frontend/src/lib/prefetchRutas.ts"] ?? "";
  const soloApp = fuentes["/frontend/src/components/CoworkSoloApp.tsx"] ?? "";

  it("se leyeron las fuentes (un glob vacío pasaría todo en verde)", () => {
    for (const f of [app, menu, precarga, soloApp]) expect(f.length).toBeGreaterThan(100);
  });

  it("existe, sin permiso de módulo, dentro del cascarón", () => {
    expect(RUTA_GUIA_APP).toBe("/app");
    expect(app).toContain('<Route path="/app" element={<GuiaAppPage />} />');
    expect(app).toContain('const GuiaAppPage = lazy(() => import("./pages/guiaApp/GuiaAppPage"));');
    expect(app.indexOf('path="/app"')).toBeLessThan(app.indexOf('path="/call/:roomName"'));
  });

  it("está en el menú para todos, en el ⌘K y se precarga", () => {
    expect(menu).toMatch(/\{ title: t\("nav\.appGuide"\), url: RUTA_GUIA_APP, icon: MonitorDown \}/);
    expect(precarga).toContain('"/app": () => import("@/pages/guiaApp/GuiaAppPage")');
    const entrada = NAV_CATALOG.find((e) => e.url === RUTA_GUIA_APP);
    expect(entrada?.i18nKey).toBe("nav.appGuide");
    expect(entrada?.module).toBeUndefined();
    expect(entrada?.adminOnly).toBeFalsy();
  });

  it("⚠️ se abre aunque Cowork sea obligatorio (si no, rebota entre el bloqueo y la guía)", () => {
    expect(rutaLibreDeCowork(RUTA_GUIA_APP)).toBe(true);
    expect(rutaLibreDeCowork("/app/")).toBe(true);
    expect(rutaLibreDeCowork("/apps-raras")).toBe(false);
    expect(rutaLibreDeCowork("/dashboard")).toBe(false);
    // Lo que ya era libre lo sigue siendo.
    expect(rutaLibreDeCowork("/conexion")).toBe(true);
    expect(rutaLibreDeCowork("/conexiones-raras")).toBe(false);
  });

  it("en la guía no se ofrece «abrir en la app» (quien la abre todavía no la tiene)", () => {
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/app" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/apps-raras" })).toBe(true);
  });

  it("el aviso y el bloqueo de Cowork enlazan a la guía", () => {
    expect(soloApp.match(/to=\{RUTA_GUIA_APP\}/g)?.length).toBe(2);
    expect(soloApp.match(/cowork\.soloApp\.comoSeInstala/g)?.length).toBe(2);
  });
});

describe("la guía: la página", () => {
  const pintar = (p: Partial<Parameters<typeof VistaGuiaApp>[0]> = {}) =>
    render(<MemoryRouter><VistaGuiaApp sistemaInicial="windows" enApp={false} enCelular={false} desde={null} {...p} /></MemoryRouter>);

  it("Windows: su pestaña primero, su instalador, el aviso azul y «Ya la tengo»", () => {
    pintar();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("guiaApp.titulo");
    const pestanas = screen.getAllByRole("tab");
    expect(pestanas.map((p) => p.textContent)).toEqual(["WindowsguiaApp.esteEquipo", "Mac"]);
    expect(pestanas[0].getAttribute("aria-selected")).toBe("true");
    const descargas = screen.getAllByRole("link", { name: /guiaApp\.descargarPara/ });
    expect(descargas.length).toBeGreaterThan(0);
    for (const d of descargas) expect(d.getAttribute("href")).toMatch(/\/storage\/v1\/object\/public\/descargas\/Maven-Windows\.exe$/);
    expect(screen.getByRole("link", { name: /guiaApp\.yaLaTengo$/ }).getAttribute("href")).toBe("maven://abrir?ruta=%2Fcowork");
    expect(screen.getByText("guiaApp.paso.instalar.windowsAviso")).toBeTruthy();
    expect(screen.getByText("guiaApp.dibujo.smartscreen")).toBeTruthy();
    expect(screen.getByText("guiaApp.dibujo.ejecutar")).toBeTruthy();
    expect(screen.getByRole("link", { name: "guiaApp.paso.entrar.restablecer" }).getAttribute("href")).toBe("/forgot-password");
    // Los cinco pasos.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "guiaApp.paso.descargar.titulo", "guiaApp.paso.instalar.titulo", "guiaApp.paso.entrar.titulo",
      "guiaApp.paso.permisos.titulo", "guiaApp.paso.listo.titulo",
    ]);
    expect(screen.getByText("guiaApp.paso.listo.cerrarWindows")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("cambiar a Mac: el .dmg, arrastrar a Aplicaciones y el arreglo «−» / «+»", () => {
    pintar();
    fireEvent.click(screen.getByRole("tab", { name: "Mac" }));
    expect(screen.getByRole("tab", { name: "Mac" }).getAttribute("aria-selected")).toBe("true");
    for (const d of screen.getAllByRole("link", { name: /guiaApp\.descargarPara/ })) {
      expect(d.getAttribute("href")).toMatch(/Maven-Mac\.dmg$/);
    }
    expect(screen.getByText(/guiaApp\.paso\.instalar\.mac /)).toBeTruthy();
    expect(screen.getByText("guiaApp.paso.permisos.macPantalla")).toBeTruthy();
    expect(screen.getByText("guiaApp.paso.permisos.macArreglo")).toBeTruthy();
    expect(screen.getByText("guiaApp.dibujo.grabacionPantalla")).toBeTruthy();
    expect(screen.getByText("guiaApp.paso.listo.cerrarMac")).toBeTruthy();
    expect(screen.queryByText("guiaApp.paso.instalar.windowsAviso")).toBeNull();
  });

  it("con la fecha de la base, el subtítulo la dice", () => {
    pintar({ desde: new Date(2026, 10, 20, 0, 0) });
    expect(screen.getByText(/guiaApp\.subtituloFecha/)).toBeTruthy();
  });

  it("dentro de la app: «ya estás en la app» e «Ir a Cowork», sin descargar", () => {
    pintar({ enApp: true, sistemaInicial: "mac" });
    expect(within(screen.getByRole("status")).getByText("guiaApp.yaEnApp.titulo")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /guiaApp\.descargarPara/ })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: /guiaApp\.irACowork/ })[0].getAttribute("href")).toBe("/cowork");
    expect(screen.queryByRole("link", { name: /guiaApp\.yaLaTengo$/ })).toBeNull();
  });

  it("en el celular: que no hace falta, sin botones de descarga", () => {
    pintar({ enCelular: true });
    expect(within(screen.getByRole("status")).getByText("guiaApp.celular.titulo")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /guiaApp\.descargarPara/ })).toHaveLength(0);
    expect(screen.queryByText("guiaApp.esteEquipo")).toBeNull();
  });
});

describe("la guía lee el equipo de quien mira", () => {
  const original = navigator.userAgent;
  const ponerUA = (ua: string) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  beforeEach(() => { soloApp.desde = null; });
  afterEach(() => {
    ponerUA(original);
    delete (window as unknown as { mavenEscritorio?: unknown }).mavenEscritorio;
  });

  it("en un Mac abre en la pestaña Mac", () => {
    ponerUA(MAC);
    render(<MemoryRouter><GuiaAppPage /></MemoryRouter>);
    expect(screen.getAllByRole("tab")[0].textContent).toContain("Mac");
    expect(screen.getByRole("tab", { name: /Mac/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("dentro de la app de Windows: su pestaña y «ya estás en la app»", () => {
    ponerUA(MAC);
    (window as unknown as { mavenEscritorio: unknown }).mavenEscritorio = { esApp: true, plataforma: "windows" };
    render(<MemoryRouter><GuiaAppPage /></MemoryRouter>);
    expect(screen.getAllByRole("tab")[0].textContent).toContain("Windows");
    expect(screen.getByText("guiaApp.yaEnApp.titulo")).toBeTruthy();
  });
});
