import { describe, it, expect, beforeEach } from "vitest";
import { loadNCPreference } from "@/lib/noise-suppression-processor";
import { estadoDeNC, ncFunciona } from "@/lib/estadoNC";

// LA CANCELACIÓN DE RUIDO ES OBLIGATORIA (Alvaro, 13/11/2026). Antes arrancaba
// activada pero respetaba a quien la apagaba (y quedaba apagada para siempre en
// ese navegador). Ahora: siempre se arma, un «false» guardado de antes no cuenta
// (y se borra), y lo que se mide es si DE VERDAD está corriendo.
const fuentes = import.meta.glob(
  ["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/pages/messenger/videocall/CallControls.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const liveKit = fuentes["/frontend/src/hooks/useLiveKit.ts"];
const controles = fuentes["/frontend/src/pages/messenger/videocall/CallControls.tsx"];

describe("cancelación de ruido obligatoria", () => {
  beforeEach(() => localStorage.clear());

  it("quien nunca eligió la tiene", () => {
    expect(loadNCPreference()).toBe(true);
  });

  it("⚠️ un «false» guardado de antes se ignora, y se borra para que no reaparezca", () => {
    localStorage.setItem("call-noise-cancellation-enabled", "false");
    expect(loadNCPreference()).toBe(true);
    expect(localStorage.getItem("call-noise-cancellation-enabled")).toBeNull();
  });

  it("los fuentes se cargaron", () => {
    expect(liveKit?.length).toBeGreaterThan(1000);
    expect(controles?.length).toBeGreaterThan(1000);
  });

  it("no queda ningún interruptor para apagarla: ni en el hook ni en la barra de la llamada", () => {
    expect(liveKit).not.toContain("toggleNoiseCancellation");
    expect(liveKit).not.toContain("saveNCPreference");
    expect(controles).not.toContain("onToggleNoiseCancellation");
    expect(controles).not.toMatch(/role="switch"[^>]*cancelacionRuido/);
  });

  it("cada muestra de la llamada dice si de verdad está corriendo (datos.nc)", () => {
    expect(liveKit).toMatch(/datos: \{ \.\.\.muestra, (\.\.\.memoria, )?ahorro: ahorro\.activo, nc,/);
  });
});

describe("qué se anota en datos.nc", () => {
  it("navegador sin AudioWorklet → no_soportada", () => {
    expect(estadoDeNC({ soportada: false, hayMicro: true, motor: null })).toBe("no_soportada");
  });
  it("todavía sin micrófono (en Cowork se entra silenciado) → sin_micro", () => {
    expect(estadoDeNC({ soportada: true, hayMicro: false, motor: null })).toBe("sin_micro");
  });
  it("RNNoise + puerta → activa; solo la puerta → solo_puerta", () => {
    expect(estadoDeNC({ soportada: true, hayMicro: true, motor: "rnnoise+puerta" })).toBe("activa");
    expect(estadoDeNC({ soportada: true, hayMicro: true, motor: "puerta" })).toBe("solo_puerta");
  });
  it("micrófono sin filtro funcionando → fallo (nunca se calla como si estuviera activa)", () => {
    expect(estadoDeNC({ soportada: true, hayMicro: true, motor: null })).toBe("fallo");
  });
  it("la nota de la llamada dice «no disponible» solo cuando de verdad no corre", () => {
    expect(ncFunciona("activa")).toBe(true);
    expect(ncFunciona("solo_puerta")).toBe(true);
    expect(ncFunciona("sin_micro")).toBe(true);
    expect(ncFunciona("fallo")).toBe(false);
    expect(ncFunciona("no_soportada")).toBe(false);
  });
});
