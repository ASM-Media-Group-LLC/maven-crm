import { describe, it, expect } from "vitest";
import crudo from "@lofcz/deepfilternet-web/worklet?raw";
import { workletDeepFilter, veredictoCarga, PROCESADOR_DF, ATENUACION_DF_DB, POSFILTRO_DF } from "@/lib/deepfilter";
import { estadoDeNC, ncFunciona } from "@/lib/estadoNC";

// CANCELACIÓN DE RUIDO FUERTE (Alvaro, 16/11/2026: «sí, más fuerte»).
// DeepFilterNet3 toma el relevo de RNNoise; si el equipo no da abasto, vuelve.
const fuentes = import.meta.glob(
  ["/frontend/src/lib/noise-suppression-processor.ts", "/nginx.conf", "/package.json"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const cadena = fuentes["/frontend/src/lib/noise-suppression-processor.ts"];
const nginx = fuentes["/nginx.conf"];
const paquete = fuentes["/package.json"];

describe("worklet de DeepFilterNet", () => {
  it("⚠️ el worklet del paquete sigue calzando con los retoques (si cambia la versión, esto avisa)", () => {
    const w = workletDeepFilter(crudo);
    expect(w).toContain(`tipo: "listo"`);
    expect(w).toContain(`tipo: "fallo"`);
    expect(w).toContain(`registerProcessor("${PROCESADOR_DF}", MedidorDF)`);
    expect(w).not.toContain("registerProcessor(PROCESSOR_NAME, DeepFilterProcessor)");
  });

  it("si el paquete cambió y no calza, tira (y la cadena se queda con RNNoise)", () => {
    expect(() => workletDeepFilter("registerProcessor('x', class {})")).toThrow(/cambió/);
  });

  it("la versión del paquete está fija (el worklet y el WASM van atados)", () => {
    expect(paquete).toMatch(/"@lofcz\/deepfilternet-web": "\d+\.\d+\.\d+"/);
  });

  it("lo más fuerte que da el modelo, con el posfiltro prendido", () => {
    expect(ATENUACION_DF_DB).toBe(100);
    // Medido el 16/11 con voz real + ruido real: con posfiltro las pausas bajan
    // de -52 a -57 dBFS y la voz pierde 2 dB en vez de 3,6 (RNNoise pierde 7).
    expect(POSFILTRO_DF).toBeGreaterThan(0);
    expect(workletDeepFilter(crudo)).toContain("df_set_post_filter_beta(this.#handle, opts.postFilterBeta)");
  });
  it("⚠️ el hilo de audio no trae TextDecoder ni crypto: el worklet los rellena antes de cargar", () => {
    const w = workletDeepFilter(crudo);
    expect(w.indexOf("globalThis.TextDecoder = class")).toBeLessThan(w.indexOf("new TextDecoder("));
    expect(w).toContain("globalThis.crypto = { getRandomValues");
  });
});

describe("si el equipo no da abasto, vuelve a RNNoise", () => {
  const ventana = 2000;
  it("una ventana mala sola no basta", () => {
    expect(veredictoCarga({ gastoMs: 1500, ventanaMs: ventana, lentos: 0 }, 0)).toEqual({ seguidas: 1, pesado: false });
  });
  it("dos ventanas seguidas con el hilo de audio ocupado > 50 % → pesado", () => {
    expect(veredictoCarga({ gastoMs: 1200, ventanaMs: ventana, lentos: 0 }, 1).pesado).toBe(true);
  });
  it("bloques lentos (el audio se corta) también cuentan", () => {
    expect(veredictoCarga({ gastoMs: 200, ventanaMs: ventana, lentos: 3 }, 1).pesado).toBe(true);
  });
  it("una ventana buena reinicia la cuenta", () => {
    expect(veredictoCarga({ gastoMs: 300, ventanaMs: ventana, lentos: 0 }, 1)).toEqual({ seguidas: 0, pesado: false });
  });
});

describe("la cadena", () => {
  it("arranca con RNNoise y DeepFilterNet entra después, en caliente", () => {
    expect(cadena).toContain("deepFilterPermitido()");
    expect(cadena).toMatch(/setTimeout\(\(\) => \{ void subirADeepFilter\(\); \}, ESPERA_ANTES_DE_DF_MS\)/);
  });
  it("si no aguanta, se marca el equipo y se vuelve al motor anterior", () => {
    expect(cadena).toMatch(/marcarDeepFilterPesado\(\);\s*bajarDeDeepFilter\(/);
  });
  it("el motor se lee en vivo (no se congela el del momento de armar)", () => {
    expect(cadena).toContain("get motor() { return motor; }");
  });
  it("el WASM se sirve con caché larga", () => {
    expect(nginx).toMatch(/location ~\* \\\.\([^)]*\|wasm\)\$/);
  });
});

describe("qué se anota en datos.nc", () => {
  it("DeepFilterNet + puerta → fuerte, y cuenta como funcionando", () => {
    expect(estadoDeNC({ soportada: true, hayMicro: true, motor: "deepfilter+puerta" })).toBe("fuerte");
    expect(ncFunciona("fuerte")).toBe(true);
  });
});
