import { describe, expect, it } from "vitest";

// Guarda (17/11/2026): en el Mac, el aviso «Maven quiere grabar la pantalla»
// saltaba cada rato. La app de computador solo puede tocar la pantalla cuando
// macOS ya dio el permiso; si falta, pregunta una vez por arranque y no insiste.
const apps = Object.values(import.meta.glob("../../../../desktop/src/apps.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const main = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const permiso = Object.values(import.meta.glob("../../../../desktop/src/permisoPantalla.js", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("permiso de pantalla en el Mac (app de computador)", () => {
  it("la consulta del permiso solo pregunta, nunca pide", () => {
    expect(permiso).toContain('getMediaAccessStatus("screen") === "granted"');
    expect(permiso).not.toMatch(/askForMediaAccess\(\s*["']screen/);
  });

  it("el vigía de apps solo pide títulos si macOS ya dio el permiso, sin reintentos", () => {
    expect(apps).toContain("pantallaPermitida()");
    expect(apps).not.toMatch(/screenRecordingPermission:\s*true/);
    expect(apps).not.toMatch(/conTitulos\s*=\s*true/); // el reintento cada 10 min hacía volver el aviso
  });

  it("compartir pantalla revisa el permiso antes de buscar pantallas", () => {
    const manejador = main.slice(main.indexOf("setDisplayMediaRequestHandler"));
    const revisa = manejador.indexOf("pantallaPermitida()");
    const busca = manejador.indexOf("desktopCapturer.getSources");
    expect(revisa).toBeGreaterThan(-1);
    expect(busca).toBeGreaterThan(revisa);
    expect(manejador).toContain("primeraVezSinPermiso()");
    expect(manejador).toContain("guiaPermisoPantalla(");
  });

  it("la guía se muestra una sola vez y ofrece reiniciar", () => {
    expect(permiso).toMatch(/if \(guiaMostrada\) return;/);
    expect(permiso).toContain("app.relaunch()");
    expect(permiso).toContain("Privacy_ScreenCapture");
  });
});
