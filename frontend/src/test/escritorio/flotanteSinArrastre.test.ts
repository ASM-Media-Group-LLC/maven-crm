import { describe, it, expect } from "vitest";

// 26/11/2026 (video de Daniel Ospina): en la app de escritorio la barra de arriba
// mueve la ventana (-webkit-app-region: drag). La ventanita del Hub que cae encima
// heredaba esa zona: sus botones no respondían y arrastrarla movía toda la app.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");
const proveedor = Object.values(import.meta.glob("../../components/PersistentCallProvider.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>)[0];

describe("la ventanita flotante no es barra para arrastrar", () => {
  it("la regla existe en la app de escritorio", () => {
    expect(css).toContain("html.en-escritorio .sin-arrastre,");
    expect(css).toContain("html.en-escritorio .sin-arrastre * { -webkit-app-region: no-drag; }");
  });
  it("la ventanita de la llamada y su botón de silencio la usan", () => {
    expect(proveedor).toContain('className="sin-arrastre fixed z-[150]');
    expect(proveedor).toContain("sin-arrastre fixed top-2 left-2 z-[200]");
  });
});
