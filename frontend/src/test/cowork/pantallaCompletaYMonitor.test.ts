import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { esPantallaCompleta } from "@/lib/compartirPantalla";
import { anotarPantallazo, reiniciarMonitorLocal, tomarLosDeAfuera, ultimoPantallazo } from "@/lib/monitorLocal";

// GUARDA del monitoreo de Cowork (Alvaro, 10/11/2026: «se obliga la pantalla
// completa, como Hubstaff pero con navegador» y «me dicen que cuando se van
// para otro lado ya no les toma pantallazos»).
//   · En la sala de Cowork se rechaza una pestaña o una ventana: solo la
//     pantalla completa muestra adónde se fue la persona.
//   · El monitor no se apaga al irse a otra app: la llamada lo dice («monitoreo
//     activo · hace X») y al volver se cuentan los pantallazos de afuera.

const fuentes = (import.meta as unknown as {
  glob: (patrones: string[], opciones: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/hooks/useLiveKit.ts",
  "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
  "/frontend/src/hooks/useMonitorCamara.ts",
], { query: "?raw", import: "default", eager: true });
const liveKit = fuentes["/frontend/src/hooks/useLiveKit.ts"];
const llamada = fuentes["/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx"];
const monitor = fuentes["/frontend/src/hooks/useMonitorCamara.ts"];

describe("pantalla completa obligatoria en Cowork", () => {
  it("solo la pantalla completa pasa; si el navegador no lo dice, se acepta", () => {
    expect(esPantallaCompleta("monitor")).toBe(true);
    expect(esPantallaCompleta("browser")).toBe(false);
    expect(esPantallaCompleta("window")).toBe(false);
    expect(esPantallaCompleta(undefined)).toBe(true);
    expect(esPantallaCompleta(null)).toBe(true);
  });

  it("el diálogo abre en pantalla completa, sin esta pestaña ni cambio de pestaña, y se revisa lo elegido", () => {
    expect(liveKit).toContain('video: { displaySurface: "monitor" }, selfBrowserSurface: "exclude", surfaceSwitching: "exclude"');
    expect(liveKit).toContain("if (!esPantallaCompleta(superficie))");
    expect(liveKit).toContain("setExigirPantallaCompleta,");
  });

  it("solo la sala de Cowork la exige (supervisorEncuadre), no una llamada común", () => {
    expect(llamada).toContain("lk.setExigirPantallaCompleta(!!supervisorEncuadre)");
  });
});

describe("el monitor se nota también fuera de Maven", () => {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  let estado: DocumentVisibilityState = "visible";
  beforeEach(() => {
    reiniciarMonitorLocal();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado });
  });
  afterEach(() => {
    estado = "visible";
    delete (document as unknown as Record<string, unknown>).visibilityState;
    if (original) Object.defineProperty(Document.prototype, "visibilityState", original);
  });

  it("cuenta los pantallazos tomados con Maven en segundo plano y los entrega una vez", () => {
    anotarPantallazo(1000);
    estado = "hidden";
    anotarPantallazo(2000);
    anotarPantallazo(3000);
    expect(ultimoPantallazo()).toBe(3000);
    expect(tomarLosDeAfuera()).toBe(2);
    expect(tomarLosDeAfuera()).toBe(0);
  });

  it("una llamada de Maven que no es Cowork late también en el servidor (no cuenta como salirse)", () => {
    expect(llamada).toContain("latirLlamadaEnServidor(supabase, roomName)");
    // Con la sala: solo borra el latido de ESTA llamada (20261117200000).
    expect(llamada).toContain("salirLlamadaEnServidor(supabase, roomName)");
  });

  it("cada pantallazo guardado se anota y al volver a Maven se avisa", () => {
    expect(monitor).toContain("if (guardoAlgo) anotarPantallazo();");
    expect(monitor).toContain('document.addEventListener("visibilitychange", alVolver)');
    expect(llamada).toContain("messenger.callView.monitoreoActivo");
  });
});
