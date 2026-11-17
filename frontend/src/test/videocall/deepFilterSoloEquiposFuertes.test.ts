// EL LIMPIADOR DE RUIDO FUERTE SOLO EN COMPUTADORES FUERTES (Alvaro, 17/11/2026:
// «solo en equipos de 8 núcleos o más; en los demás trababa»).
//
// DeepFilterNet3 (lib/deepfilter.ts) pesa ~12 MB y gasta procesador. Con menos de
// 8 núcleos, o si el navegador no dice cuántos, la llamada se queda con RNNoise
// («activa» en llamada_salud.datos.nc) y nunca baja el modelo: el relevo ni se
// programa. En los fuertes sigue igual: arranca con RNNoise, DeepFilterNet toma
// el relevo, y si no da abasto vuelve solo a RNNoise y no se reintenta en 14 días.
import { describe, it, expect, afterEach, vi } from "vitest";
import { NUCLEOS_PARA_DEEPFILTER, deepFilterPermitido, marcarDeepFilterPesado } from "@/lib/deepfilter";
import { estadoDeNC, ncFunciona } from "@/lib/estadoNC";

const fuentes = import.meta.glob(
  ["/frontend/src/lib/noise-suppression-processor.ts", "/frontend/src/lib/deepfilter.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const cadena = fuentes["/frontend/src/lib/noise-suppression-processor.ts"];
const df = fuentes["/frontend/src/lib/deepfilter.ts"];

const nucleos = (n: number | undefined) =>
  vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(n as unknown as number);

afterEach(() => {
  vi.restoreAllMocks();
  try { localStorage.clear(); } catch { /* noop */ }
});

describe("¿a quién le toca DeepFilterNet?", () => {
  it("el umbral es 8 núcleos, con la decisión anotada", () => {
    expect(NUCLEOS_PARA_DEEPFILTER).toBe(8);
    expect(df).toMatch(/Alvaro, 17\/11: solo en equipos de 8 núcleos o más; en los demás trababa\./);
  });

  it("con 4 o 6 núcleos, no; con 8 o más, sí", () => {
    for (const n of [2, 4, 6, 7]) {
      nucleos(n);
      expect(deepFilterPermitido(), `${n} núcleos`).toBe(false);
      vi.restoreAllMocks();
    }
    for (const n of [8, 12, 16]) {
      nucleos(n);
      expect(deepFilterPermitido(), `${n} núcleos`).toBe(true);
      vi.restoreAllMocks();
    }
  });

  it("si el navegador no dice cuántos núcleos tiene, no (se queda con RNNoise)", () => {
    nucleos(0);
    expect(deepFilterPermitido()).toBe(false);
    nucleos(undefined);
    expect(deepFilterPermitido()).toBe(false);
  });

  it("la regla de los 14 días sigue: un equipo fuerte que no aguantó no lo vuelve a intentar", () => {
    nucleos(16);
    expect(deepFilterPermitido()).toBe(true);
    marcarDeepFilterPesado();
    expect(deepFilterPermitido()).toBe(false);
    expect(df).toContain("const DIAS_SIN_REINTENTAR = 14;");
  });
});

describe("⚠️ en los débiles nunca se bajan los 12 MB", () => {
  it("el relevo a DeepFilterNet solo se programa si está permitido, y el modelo solo se baja ahí", () => {
    expect(cadena).toMatch(/const relevoDF = deepFilterPermitido\(\)\s*\?\s*window\.setTimeout\(\(\) => \{ void subirADeepFilter\(\); \}/);
    // crearNodoDF (que baja el WASM) se llama en un solo lugar: dentro del relevo.
    expect(cadena.match(/crearNodoDF\(/g)?.length).toBe(1);
    const relevo = cadena.slice(cadena.indexOf("const subirADeepFilter"), cadena.indexOf("const relevoDF"));
    expect(relevo).toContain("crearNodoDF(");
    // Y el WASM solo se pide desde crearNodoDF.
    expect(df.match(/fetch\(dfWasmUrl/g)?.length).toBe(1);
    expect(df.slice(df.indexOf("function cargarModuloDF"), df.indexOf("export async function crearNodoDF"))).toContain("fetch(dfWasmUrl");
  });

  it("si no aguanta, vuelve sola a RNNoise (sin cambios)", () => {
    expect(cadena).toContain("marcarDeepFilterPesado()");
  });
});

describe("llamada_salud sigue diciendo la verdad", () => {
  it("en un equipo débil, con RNNoise, el estado es «activa» y cuenta como funcionando", () => {
    const e = estadoDeNC({ soportada: true, hayMicro: true, motor: "rnnoise+puerta" });
    expect(e).toBe("activa");
    expect(ncFunciona(e)).toBe(true);
    expect(estadoDeNC({ soportada: true, hayMicro: true, motor: "deepfilter+puerta" })).toBe("fuerte");
  });
});
