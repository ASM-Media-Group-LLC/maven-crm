import { describe, expect, it } from "vitest";

// Guarda (18/11/2026): Windows no le pregunta nada a una app de computador por
// la cámara o el micrófono. Si su interruptor está apagado, Cowork se queda sin
// imagen o sin voz y nadie avisa. La app de Maven lo revisa cuando Maven los
// pide y explica cómo prenderlo, una vez por arranque, sin cambiar nada sola.
const main = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const permiso = Object.values(import.meta.glob("../../../../desktop/src/permisoCamaraWindows.js", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("cámara y micrófono en Windows (app de computador)", () => {
  it("se leyeron las fuentes (un glob vacío pasaría todo en verde)", () => {
    expect(main?.length).toBeGreaterThan(1000);
    expect(permiso?.length).toBeGreaterThan(500);
  });

  it("cuando Maven pide cámara o micrófono, la app revisa Windows", () => {
    const manejador = main.slice(main.indexOf("setPermissionRequestHandler"), main.indexOf("setPermissionCheckHandler"));
    expect(manejador).toMatch(/permiso === "media"\)\s*revisarCamaraYMicrofono\(/);
    // Primero se responde (no se frena la cámara esperando al registro).
    expect(manejador.indexOf("responder(")).toBeLessThan(manejador.indexOf("revisarCamaraYMicrofono("));
  });

  it("mira lo que contesta Windows y sus interruptores, y solo lee", () => {
    expect(permiso).toContain("getMediaAccessStatus(tipo)");
    expect(permiso).toMatch(/"denied" \|\| estado === "restricted"/);
    expect(permiso).toContain("CapabilityAccessManager\\\\ConsentStore");
    expect(permiso).toContain("NonPackaged"); // «Permitir que las aplicaciones de escritorio accedan»
    expect(permiso).toMatch(/\["query",/);
    expect(permiso).not.toMatch(/"reg",\s*\["(add|delete)"/);
  });

  it("explica con un botón al ajuste exacto, una vez por arranque y solo en Windows", () => {
    expect(permiso).toContain("ms-settings:privacy-webcam");
    expect(permiso).toContain("ms-settings:privacy-microphone");
    expect(permiso).toMatch(/const esWindows = process\.platform === "win32"/);
    expect(permiso).toMatch(/avisados\.has\(tipo\)/);
    expect(permiso).toMatch(/avisados\.add\(tipo\)/);
  });
});
