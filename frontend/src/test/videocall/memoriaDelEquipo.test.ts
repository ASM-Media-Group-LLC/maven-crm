import { describe, it, expect, afterEach } from "vitest";
import { leerMemoria } from "@/lib/saludDeLlamada";

// Alvaro, 17/11/2026: el equipo usa Windows de 8 GB o menos. La salud de cada
// llamada ahora dice cuánta memoria usa Maven y cuánta tiene el equipo.

const salud = import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const escritorio = import.meta.glob("../../../../desktop/package.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const preload = import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

type ConEscritorio = Window & { mavenEscritorio?: unknown };

describe("memoria del equipo en la salud de la llamada", () => {
  afterEach(() => { delete (window as ConEscritorio).mavenEscritorio; });

  it("en la app de computador trae la memoria de la app y del equipo", async () => {
    (window as ConEscritorio).mavenEscritorio = { memoria: async () => ({ app_mb: 545, equipo_gb: 8, libre_gb: 1.2 }) };
    const m = await leerMemoria();
    expect(m.ram_app_mb).toBe(545);
    expect(m.ram_equipo_gb).toBe(8);
    expect(m.ram_libre_gb).toBe(1.2);
  });

  it("en el navegador no inventa nada de la app", async () => {
    const m = await leerMemoria();
    expect(m.ram_app_mb).toBeUndefined();
    expect(m.ram_equipo_gb).toBeUndefined();
  });

  it("si la app falla al responder, no rompe", async () => {
    (window as ConEscritorio).mavenEscritorio = { memoria: async () => { throw new Error("x"); } };
    await expect(leerMemoria()).resolves.toBeTypeOf("object");
  });

  it("la fila de salud lleva la memoria", () => {
    expect(Object.values(salud)[0]).toMatch(/datos: \{ \.\.\.muestra, \.\.\.memoria,/);
  });

  it("la app expone la memoria y solo trae los idiomas de Maven", () => {
    expect(Object.values(preload)[0]).toMatch(/memoria: \(\) => ipcRenderer\.invoke\("maven:memoria"\)/);
    const pkg = JSON.parse(Object.values(escritorio)[0]) as { build: { electronLanguages?: string[] } };
    expect(pkg.build.electronLanguages).toEqual(expect.arrayContaining(["es", "en-US", "pt-BR"]));
    expect(pkg.build.electronLanguages!.length).toBeLessThan(10);
  });
});
