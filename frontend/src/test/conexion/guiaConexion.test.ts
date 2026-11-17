import { describe, it, expect } from "vitest";
import {
  RUTA_GUIA_CONEXION, SUBIDA_MALA_MBPS, semaforoBajada, semaforoRespuesta, semaforoSubida, veredictoDePrueba,
} from "@/lib/guiaConexion";
import { SUBIDA_PRUEBA_JUSTA_MBPS } from "@/lib/modoAhorro";
import { rutaLibreDeCowork } from "@/hooks/useCoworkObligatorio";
import { NAV_CATALOG } from "@/lib/navCatalog";
import type { PruebaDeRed } from "@/lib/pruebaDeRed";

// GUÍA DE CONEXIÓN (/conexion, 17/11/2026).
//
// Lo que se cuida:
//   · el semáforo dice lo mismo que la llamada: debajo de 1,5 Mbps de subida la
//     llamada ya recorta la cámara y prende el ahorro, así que eso es «malo»;
//   · una subida que no terminó a tiempo (tope) es mala aunque el número se vea alto;
//   · sin subida medida no se dice «bien» (es la que más pesa);
//   · la guía está en el menú, en el ⌘K y en las rutas, y la puede abrir quien
//     se cayó de Cowork (si no, Maven lo mandaba a Cowork antes de leerla).
//
// Las fuentes se leen con import.meta.glob (ruta literal), no con node:fs.
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const fuentes = {
  ...(import.meta as unknown as Glob).glob("/frontend/src/App.tsx", { query: "?raw", import: "default", eager: true }),
  ...(import.meta as unknown as Glob).glob("/frontend/src/components/dashboard/DashboardSidebar.tsx", { query: "?raw", import: "default", eager: true }),
  ...(import.meta as unknown as Glob).glob("/frontend/src/lib/prefetchRutas.ts", { query: "?raw", import: "default", eager: true }),
};

const prueba = (p: Partial<PruebaDeRed>): PruebaDeRed => ({
  subida_mbps: 12, bajada_mbps: 30, ms: 300, at: "2026-11-17T12:00:00.000Z", ...p,
});

describe("el semáforo de cada medida", () => {
  it("subida: malo debajo de lo que la llamada ya recorta, justo hasta 3, bien desde 3", () => {
    expect(SUBIDA_MALA_MBPS).toBe(SUBIDA_PRUEBA_JUSTA_MBPS);
    expect(semaforoSubida(1.2)).toBe("malo");
    expect(semaforoSubida(1.5)).toBe("justo");
    expect(semaforoSubida(2.9)).toBe("justo");
    expect(semaforoSubida(3)).toBe("bien");
    expect(semaforoSubida(13)).toBe("bien");
    expect(semaforoSubida(null)).toBeNull();
  });

  it("una subida que no alcanzó a terminar es mala aunque el número se vea bien", () => {
    expect(semaforoSubida(8, true)).toBe("malo");
  });

  it("bajada: malo debajo de 5, justo hasta 10, bien desde 10", () => {
    expect(semaforoBajada(4.9)).toBe("malo");
    expect(semaforoBajada(5)).toBe("justo");
    expect(semaforoBajada(10)).toBe("bien");
    expect(semaforoBajada(null)).toBeNull();
  });

  it("respuesta: bien debajo de 500 ms, justo hasta 800, malo desde 800", () => {
    expect(semaforoRespuesta(323)).toBe("bien");
    expect(semaforoRespuesta(500)).toBe("justo");
    expect(semaforoRespuesta(799)).toBe("justo");
    expect(semaforoRespuesta(800)).toBe("malo");
    expect(semaforoRespuesta(null)).toBeNull();
  });
});

describe("el veredicto de la prueba", () => {
  it("manda la peor de las tres", () => {
    expect(veredictoDePrueba(prueba({}))).toBe("bien");
    expect(veredictoDePrueba(prueba({ bajada_mbps: 7 }))).toBe("justo");
    expect(veredictoDePrueba(prueba({ ms: 1200 }))).toBe("malo");
    expect(veredictoDePrueba(prueba({ subida_mbps: 0.8 }))).toBe("malo");
    expect(veredictoDePrueba(prueba({ subida_mbps: 0.4, subida_tope: true }))).toBe("malo");
  });

  it("sin subida medida no dice «bien»: la prueba quedó incompleta", () => {
    expect(veredictoDePrueba(prueba({ subida_mbps: null }))).toBeNull();
    // …salvo que otra medida ya sea mala: eso se puede decir igual.
    expect(veredictoDePrueba(prueba({ subida_mbps: null, bajada_mbps: 2 }))).toBe("malo");
  });
});

describe("la guía se encuentra", () => {
  const app = fuentes["/frontend/src/App.tsx"] ?? "";
  const menu = fuentes["/frontend/src/components/dashboard/DashboardSidebar.tsx"] ?? "";
  const precarga = fuentes["/frontend/src/lib/prefetchRutas.ts"] ?? "";

  it("se leyeron las fuentes (un glob vacío pasaría todo en verde)", () => {
    expect(app.length).toBeGreaterThan(1000);
    expect(menu.length).toBeGreaterThan(1000);
    expect(precarga.length).toBeGreaterThan(100);
  });

  it("la ruta existe, sin permiso de módulo, dentro del cascarón", () => {
    expect(app).toContain(`<Route path="${RUTA_GUIA_CONEXION}" element={<GuiaConexionPage />} />`);
    expect(app).toContain('const GuiaConexionPage = lazy(() => import("./pages/conexion/GuiaConexionPage"));');
    // Dentro del AppShell (antes de las rutas a pantalla completa).
    expect(app.indexOf(`path="${RUTA_GUIA_CONEXION}"`)).toBeLessThan(app.indexOf('path="/call/:roomName"'));
  });

  it("está en el menú para todos y se precarga desde el mismo módulo", () => {
    expect(menu).toMatch(/\{ title: t\("nav\.connectionGuide"\), url: RUTA_GUIA_CONEXION, icon: Wifi \}/);
    expect(menu).toContain("!item.module || canAccess(item.module, item.submodule)");
    expect(precarga).toContain(`"${RUTA_GUIA_CONEXION}": () => import("@/pages/conexion/GuiaConexionPage")`);
  });

  it("el ⌘K la ofrece a todos (sin módulo)", () => {
    const entrada = NAV_CATALOG.find((e) => e.url === RUTA_GUIA_CONEXION);
    expect(entrada?.i18nKey).toBe("nav.connectionGuide");
    expect(entrada?.module).toBeUndefined();
    expect(entrada?.adminOnly).toBeFalsy();
  });

  it("quien se cayó de Cowork la puede abrir (no lo manda a Cowork)", () => {
    expect(rutaLibreDeCowork(RUTA_GUIA_CONEXION)).toBe(true);
    expect(rutaLibreDeCowork("/conexiones-raras")).toBe(false);
    expect(rutaLibreDeCowork("/dashboard")).toBe(false);
  });
});
