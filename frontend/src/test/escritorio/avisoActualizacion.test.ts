import { describe, it, expect } from "vitest";
import { estadoDelAviso, tocaActualizarAlColgar } from "@/lib/avisoActualizacionApp";

// Alvaro, 18/11/2026: «que cada vez que hagamos un update la plataforma te lo
// ponga enfrente con un botón». Solo la app; fijo hasta actualizar; en llamada
// decide la persona y, si no toca nada, se actualiza al colgar.

const actualizar = Object.values(import.meta.glob("../../../../desktop/src/actualizar.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const preload = Object.values(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const aviso = Object.values(import.meta.glob("../../components/AvisoActualizacionApp.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const app = Object.values(import.meta.glob("../../App.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("aviso de versión nueva de la app", () => {
  it("sin versión nueva no muestra nada; con versión, ofrece (y en llamada lo dice)", () => {
    expect(estadoDelAviso(null, false)).toBe("nada");
    expect(estadoDelAviso("2.1.1", false)).toBe("ofrecer");
    expect(estadoDelAviso("2.1.1", true)).toBe("ofrecerEnLlamada");
  });

  it("se actualiza sola solo al colgar", () => {
    expect(tocaActualizarAlColgar("2.1.1", true, false)).toBe(true);
    expect(tocaActualizarAlColgar("2.1.1", false, false)).toBe(false);
    expect(tocaActualizarAlColgar("2.1.1", true, true)).toBe(false);
    expect(tocaActualizarAlColgar(null, true, false)).toBe(false);
  });

  it("la app avisa a la página e instala callada y vuelve a abrir", () => {
    expect(actualizar).toMatch(/webContents\.send\("maven:actualizacion-lista", info\.version\)/);
    expect(actualizar).toMatch(/ipcMain\.handle\("maven:actualizacion-pendiente"/);
    expect(actualizar).toMatch(/quitAndInstall\(true, true\)/);
    expect(preload).toMatch(/actualizarAhora: \(\) => ipcRenderer\.invoke\("maven:actualizar-ahora"\)/);
  });

  it("la franja no se puede cerrar y está montada en toda la app", () => {
    expect(aviso).not.toMatch(/aria-label=\{t\("[^"]*cerrar/i);
    expect(app).toMatch(/<AvisoActualizacionApp \/>/);
  });
});
