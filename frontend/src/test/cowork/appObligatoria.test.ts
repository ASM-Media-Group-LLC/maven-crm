import { describe, expect, it } from "vitest";
import { decidirAppObligatoria } from "@/lib/appObligatoria";
import { proximoIntentoDePantalla } from "@/lib/pantallaSolaEnLaApp";

// Cowork solo con la app de computador (Alvaro, 17/11/2026): todos, admins
// incluidos; primero 3 probadores, después todos desde una fecha.
const coworkPage = Object.values(import.meta.glob("../../pages/cowork/CoworkPage.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const callView = Object.values(import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const mainApp = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const preload = Object.values(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }))[0] as string;

const JUEVES = "2026-11-20T05:00:00Z";
const config = { desde: JUEVES, probadores: ["grace"] };
const base = { enApp: false, puedeCompartir: true, config, userId: "otro", ahora: Date.parse("2026-11-18T15:00:00Z") };

describe("¿Cowork exige la app?", () => {
  it("al probador ya se le exige", () => {
    expect(decidirAppObligatoria({ ...base, userId: "grace" })).toEqual({ tipo: "obligatoria" });
  });
  it("al resto, antes de la fecha, solo se le avisa con la fecha", () => {
    expect(decidirAppObligatoria(base)).toEqual({ tipo: "aviso", desde: JUEVES });
  });
  it("desde la fecha, a todos (admins incluidos: no hay excepción por rol)", () => {
    expect(decidirAppObligatoria({ ...base, ahora: Date.parse(JUEVES) })).toEqual({ tipo: "obligatoria" });
  });
  it("dentro de la app nunca se bloquea", () => {
    expect(decidirAppObligatoria({ ...base, enApp: true, userId: "grace" })).toEqual({ tipo: "libre" });
  });
  it("en un celular (no comparte pantalla) no se bloquea", () => {
    expect(decidirAppObligatoria({ ...base, puedeCompartir: false, userId: "grace" })).toEqual({ tipo: "libre" });
  });
  it("si la configuración no se pudo leer, no se deja a nadie afuera", () => {
    expect(decidirAppObligatoria({ ...base, config: null, userId: "grace" })).toEqual({ tipo: "libre" });
  });
  it("sin fecha ni probadores, libre", () => {
    expect(decidirAppObligatoria({ ...base, config: { desde: null, probadores: [] } })).toEqual({ tipo: "libre" });
  });
});

describe("volver a compartir solo, sin insistir a lo loco", () => {
  it("el primer intento es ya; después 10 s, 20 s, 40 s… con tope de 5 min", () => {
    expect(proximoIntentoDePantalla(1000, 0)).toBe(1000);
    expect(proximoIntentoDePantalla(1000, 1)).toBe(11_000);
    expect(proximoIntentoDePantalla(1000, 2)).toBe(21_000);
    expect(proximoIntentoDePantalla(1000, 3)).toBe(41_000);
    expect(proximoIntentoDePantalla(0, 20)).toBe(5 * 60_000);
  });
});

describe("cableado", () => {
  it("la página de Cowork decide la app ANTES de montar la sala", () => {
    const envoltorio = coworkPage.slice(coworkPage.indexOf("export default function CoworkPage()"), coworkPage.indexOf("function CoworkPageInterna()"));
    expect(envoltorio).toContain("useAppObligatoria()");
    expect(envoltorio).toContain('app.tipo === "obligatoria"');
    expect(envoltorio).toContain("<CoworkSoloEnLaApp />");
  });
  it("la llamada comparte sola solo en la app, solo en Cowork y nunca en pausa", () => {
    expect(callView).toMatch(/const pantallaSola = !!supervisorEncuadre && !hideScreenShare && typeof appDeComputador\?\.pantallaAutomatica === "function"/);
    expect(callView).toContain("if (estaEnPausa() || antesDePausaRef.current) return;");
    expect(callView).toContain("proximoIntentoDePantalla(st.ultimo, st.fallos)");
  });
  it("la app elige sola la pantalla principal cuando Cowork lo pide", () => {
    expect(preload).toContain('pantallaAutomatica: (si) => ipcRenderer.send("maven:pantalla-auto", Boolean(si))');
    expect(mainApp).toContain('ipcMain.on("maven:pantalla-auto"');
    const manejador = mainApp.slice(mainApp.indexOf("setDisplayMediaRequestHandler"));
    // El permiso de pantalla del Mac se revisa antes que nada (PR #148).
    expect(manejador.indexOf("pantallaPermitida()")).toBeLessThan(manejador.indexOf("if (pantallaAutomatica"));
    expect(manejador).toContain("getPrimaryDisplay().id");
  });
});
