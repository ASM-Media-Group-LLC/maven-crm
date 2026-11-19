// EL INTERRUPTOR DE LA CANCELACIÓN DE RUIDO (Alvaro, 19/11/2026: «prendida para
// todos, y que cada uno la pueda apagar»).
//
//   · Por defecto: prendida (DeepFilterNet en equipos fuertes, RNNoise en el resto).
//   · Apagada: ni DeepFilterNet ni RNNoise; el micrófono sale con el
//     noiseSuppression del navegador. Se aplica en vivo, sin salir de la llamada.
//   · Se guarda por navegador en localStorage "maven.ruido" ("si"/"no").
//   · Cada muestra de llamada_salud anota la elección (nc_info.ruido_usuario).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadNCPreference, saveNCPreference, CLAVE_RUIDO_USUARIO } from "@/lib/noise-suppression-processor";
import { estadoDeNC, ncFunciona } from "@/lib/estadoNC";

const fuentes = import.meta.glob(
  ["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/pages/cowork/CoworkHostDashboard.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const livekit = fuentes["/frontend/src/hooks/useLiveKit.ts"];
const cowork = fuentes["/frontend/src/pages/cowork/CoworkHostDashboard.tsx"];

beforeEach(() => { try { localStorage.clear(); } catch { /* noop */ } });
afterEach(() => { vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* noop */ } });

describe("prendida por defecto", () => {
  it("quien nunca tocó el interruptor la tiene", () => {
    expect(CLAVE_RUIDO_USUARIO).toBe("maven.ruido");
    expect(loadNCPreference()).toBe(true);
  });
  it("si el storage tira, prendida (y no revienta)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(loadNCPreference()).toBe(true);
  });
  it("un «false» de la clave vieja (antes del 13/11) no apaga a nadie", () => {
    localStorage.setItem("call-noise-cancellation-enabled", "false");
    expect(loadNCPreference()).toBe(true);
  });
});

describe("lo que elige la persona se respeta", () => {
  it("apagar guarda «no» y se lee apagada; prender guarda «si»", () => {
    saveNCPreference(false);
    expect(localStorage.getItem("maven.ruido")).toBe("no");
    expect(loadNCPreference()).toBe(false);
    saveNCPreference(true);
    expect(localStorage.getItem("maven.ruido")).toBe("si");
    expect(loadNCPreference()).toBe(true);
  });
  it("guardar nunca tira aunque no haya storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("lleno"); });
    expect(() => saveNCPreference(false)).not.toThrow();
  });
  it("al entrar a la llamada se lee la elección guardada", () => {
    expect(livekit).toMatch(/ncUsuarioRef\.current = loadNCPreference\(\);[\s\S]{0,200}const ncDeseado = ncUsuarioRef\.current && supportsNoiseSuppression\(\);/);
  });
  it("el micro que el supervisor de Cowork reparte también la respeta", () => {
    expect(cowork).toMatch(/if \(loadNCPreference\(\)\) \{/);
  });
});

describe("apagada = sin procesadores, en vivo", () => {
  const cuerpo = () => livekit.slice(livekit.indexOf("const toggleCancelacionRuido"), livekit.indexOf("// ── Camera toggle"));
  it("apagar para el procesador del micrófono vigente (sin DeepFilterNet ni RNNoise) y no lo vuelve a poner", () => {
    const c = cuerpo();
    expect(c).toContain("saveNCPreference(prender)");
    expect(c).toMatch(/ncEnabledRef\.current = prender && supportsNoiseSuppression\(\);/);
    expect(c).toMatch(/\} else \{[\s\S]*stopProcessor\?\.\(\)[\s\S]*ncProcessorRef\.current = null;/);
    // Con la intención en falso, reapplyNC (desmutear, cambiar de micro) no la vuelve a armar.
    expect(livekit).toMatch(/const reapplyNC = useCallback\(async \(\) => \{\s*const room = roomRef\.current;\s*if \(!room \|\| !ncEnabledRef\.current\) return;/);
  });
  it("prender la vuelve a enganchar al micrófono vigente, sin salir de la llamada", () => {
    expect(cuerpo()).toMatch(/if \(prender\) \{[\s\S]*await reapplyNC\(\);/);
  });
  it("el estado dice «apagada» y no cuenta como falla", () => {
    const e = estadoDeNC({ soportada: true, hayMicro: true, motor: null, deseada: false });
    expect(e).toBe("apagada");
    expect(ncFunciona(e)).toBe(true);
    // Sin decir nada, se asume que la quiere: un micro sin procesador es falla.
    expect(estadoDeNC({ soportada: true, hayMicro: true, motor: null })).toBe("fallo");
    expect(livekit).toContain("deseada: ncUsuarioRef.current");
  });
  it("la pantalla de la llamada pasa el interruptor a la barra", () => {
    expect(livekit).toMatch(/ncActivada,\s*toggleCancelacionRuido,/);
  });
});

describe("llamada_salud anota la elección", () => {
  it("nc_info.ruido_usuario va en cada muestra, haya o no procesador", () => {
    expect(livekit).toContain('nc_info: { ...(ncInfo ?? {}), ruido_usuario: ncUsuarioRef.current ? "si" as const : "no" as const }');
  });
});
