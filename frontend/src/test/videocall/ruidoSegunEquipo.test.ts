// CANCELACIÓN DE RUIDO SEGÚN EL EQUIPO (Alvaro, 19/11/2026, opción B).
//
// Desde el 19/11/2026 para todos (primero fue prueba voluntaria unas horas), y
// cada persona puede apagarla con el interruptor (interruptorRuido.test.ts).
//
//   · Computador fuerte (8+ núcleos Y 8+ GB, no celular) → DeepFilterNet, tras
//     una prueba de carga que nadie oye.
//   · Los demás → RNNoise (liviano, no robótico).
//   · Si algo falla → la puerta sola o el micrófono crudo con el noiseSuppression
//     del navegador.
//   · Y la voz robotizada no vuelve: atenuación moderada, contexto «balanced» y
//     sin limpiar dos veces.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fuentes = import.meta.glob(
  [
    "/frontend/src/lib/noise-suppression-processor.ts",
    "/frontend/src/lib/deepfilter.ts",
    "/frontend/src/hooks/useLiveKit.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const cadena = fuentes["/frontend/src/lib/noise-suppression-processor.ts"];
const df = fuentes["/frontend/src/lib/deepfilter.ts"];
const livekit = fuentes["/frontend/src/hooks/useLiveKit.ts"];

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

type ModDF = typeof import("@/lib/deepfilter");
let m: ModDF;

const equipo = (nucleos: number | undefined, memoria: number | undefined, agente = MAC) => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agente);
  vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(nucleos as unknown as number);
  if (memoria === undefined) delete (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  else Object.defineProperty(navigator, "deviceMemory", { value: memoria, configurable: true });
};

beforeEach(async () => {
  try { localStorage.clear(); } catch { /* noop */ }
  if (typeof WebAssembly === "undefined") vi.stubGlobal("WebAssembly", {});
  // Copia nueva del módulo: guarda «descartado en esta pestaña» en una variable suya.
  vi.resetModules();
  m = await import("@/lib/deepfilter");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  try { localStorage.clear(); } catch { /* noop */ }
});

describe("para todos desde el 19/11/2026: ya no hace falta pedir la prueba", () => {
  it("usuario normal con equipo fuerte → DeepFilterNet, sin tocar nada", () => {
    equipo(16, 8);
    expect(m.motivoSinDeepFilter()).toBeNull();
    expect(m.deepFilterPermitido()).toBe(true);
  });
  it("la compuerta de la prueba voluntaria ya no existe", () => {
    expect(df).not.toContain("sin_prueba");
    expect(df).not.toContain("pruebaDeepFilterPedida");
  });
  it("la cadena solo cambia la latencia si DeepFilterNet arma", () => {
    expect(cadena).toMatch(/const conDF = motivoSinDF === null;/);
    expect(cadena).toMatch(/new AudioContext\(conDF \? \{[^}]*\} : \{ sampleRate: 48000 \}\)/);
  });
});

describe("equipo fuerte → DeepFilterNet", () => {
  it("8 núcleos y 8 GB en un computador: puede usar DeepFilterNet", () => {
    equipo(8, 8);
    expect(m.motivoSinDeepFilter()).toBeNull();
    expect(m.deepFilterPermitido()).toBe(true);
    equipo(16, 8);
    expect(m.deepFilterPermitido()).toBe(true);
  });

  it("la regla pura, sin navegador", () => {
    expect(m.equipoFuerte({ nucleos: 8, memoriaGb: 8, agente: MAC })).toBe(true);
    expect(m.equipoFuerte({ nucleos: 12, memoriaGb: 16, agente: MAC })).toBe(true);
  });

  it("la cadena de un equipo fuerte se crea con latencia «balanced» (el cuadro de 10 ms cabe)", () => {
    expect(m.LATENCIA_CONTEXTO_DF).toBe("balanced");
    expect(cadena).toMatch(/new AudioContext\(conDF \? \{ sampleRate: 48000, latencyHint: LATENCIA_CONTEXTO_DF \}/);
  });

  it("antes de salir al aire pasa la prueba de carga (en paralelo, a un destino mudo)", () => {
    const relevo = cadena.slice(cadena.indexOf("const subirADeepFilter"), cadena.indexOf("const relevoDF"));
    expect(relevo.indexOf("esperarCargaDF(nodo)")).toBeGreaterThan(-1);
    expect(relevo.indexOf("pruebaDeCargaDF(prueba)")).toBeLessThan(relevo.indexOf("nodo.connect(puerta)"));
    expect(relevo).toContain("nodo.connect(banco)");
    expect(m.pruebaDeCargaDF({ gastoMs: 500, ventanaMs: 2000, lentos: 0 })).toBe(true);
  });
});

describe("equipo débil → RNNoise", () => {
  it("menos de 8 núcleos, aunque sobre memoria", () => {
    for (const n of [2, 4, 6, 7]) { equipo(n, 8); expect(m.motivoSinDeepFilter(), `${n} núcleos`).toBe("equipo"); }
  });
  it("menos de 8 GB, aunque sobren núcleos", () => {
    for (const g of [2, 4]) { equipo(16, g); expect(m.motivoSinDeepFilter(), `${g} GB`).toBe("equipo"); }
  });
  it("si el navegador no dice la memoria (Safari, Firefox), no", () => {
    equipo(10, undefined);
    expect(m.deepFilterPermitido()).toBe(false);
  });
  it("en el celular, nunca", () => {
    equipo(8, 8, ANDROID);
    expect(m.deepFilterPermitido()).toBe(false);
  });
  it("la cadena arranca SIEMPRE con RNNoise y el relevo solo se programa si el equipo es fuerte", () => {
    expect(cadena).toContain("new lib.RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasm })");
    expect(cadena).toMatch(/const relevoDF = conDF\s*\?/);
  });
  it("un equipo fuerte que no pasa la prueba (o no aguanta andando) baja a RNNoise y queda marcado", () => {
    expect(m.pruebaDeCargaDF({ gastoMs: 900, ventanaMs: 2000, lentos: 0 })).toBe(false); // 45 % del hilo
    expect(m.pruebaDeCargaDF({ gastoMs: 300, ventanaMs: 2000, lentos: 2 })).toBe(false); // cortó el audio
    expect(m.pruebaDeCargaDF({ gastoMs: 0, ventanaMs: 0, lentos: 0 })).toBe(false);
    equipo(16, 8);
    m.marcarDeepFilterPesado();
    expect(m.motivoSinDeepFilter()).toBe("pesado");
  });
});

describe("si algo falla → el filtro del navegador", () => {
  it("el micrófono se captura con el noiseSuppression del navegador (lo que sale si la cadena no arma)", () => {
    expect(livekit).toMatch(/audioCaptureDefaults: \{[^}]*noiseSuppression: true/);
  });

  it("si la cadena no arma, el procesador no tira y deja salir la pista cruda (con el filtro del navegador)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("sin audio"); } });
    const { NoiseSuppresionTrackProcessor } = await import("@/lib/noise-suppression-processor");
    const alFallar = vi.fn();
    const p = new NoiseSuppresionTrackProcessor(alFallar);
    await expect(p.init({ track: {} as MediaStreamTrack })).resolves.toBeUndefined();
    expect(p.processedTrack).toBeUndefined();
    expect(p.motor).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(alFallar).toHaveBeenCalledOnce();
  });

  it("si DeepFilterNet no carga, sigue RNNoise (y no se reintenta en la pestaña)", () => {
    const relevo = cadena.slice(cadena.indexOf("const subirADeepFilter"), cadena.indexOf("const relevoDF"));
    expect(relevo).toMatch(/catch \(e\) \{[\s\S]*descartarDeepFilterEnPestana\(\);[\s\S]*sinDF = "no_cargo";/);
    equipo(16, 8);
    m.descartarDeepFilterEnPestana();
    expect(m.motivoSinDeepFilter()).toBe("no_cargo");
  });

  it("al bajar de DeepFilterNet (o al destruir) se le devuelve el filtro al navegador", () => {
    const bajar = cadena.slice(cadena.indexOf("const bajarDeDeepFilter"), cadena.indexOf("const subirADeepFilter"));
    expect(bajar).toContain("devolverRuidoDelNavegador()");
    const destruir = cadena.slice(cadena.indexOf("async destruir()"));
    expect(destruir).toContain("devolverRuidoDelNavegador()");
  });

  it("ruidoDelNavegador conserva lo demás de la captura y nunca tira", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const t = {
      readyState: "live",
      getConstraints: () => ({ echoCancellation: true, autoGainControl: true, deviceId: { exact: "mic" } }),
      applyConstraints,
      getSettings: () => ({ noiseSuppression: false }),
    } as unknown as MediaStreamTrack;
    await expect(m.ruidoDelNavegador(t, false)).resolves.toBe(false);
    expect(applyConstraints).toHaveBeenCalledWith({ echoCancellation: true, autoGainControl: true, deviceId: { exact: "mic" }, noiseSuppression: false });
    const malo = { readyState: "live", getConstraints: () => ({}), applyConstraints: vi.fn().mockRejectedValue(new Error("no")) } as unknown as MediaStreamTrack;
    await expect(m.ruidoDelNavegador(malo, false)).resolves.toBeNull();
    await expect(m.ruidoDelNavegador({ readyState: "ended" } as MediaStreamTrack, true)).resolves.toBeNull();
  });
});

describe("la voz robotizada no vuelve", () => {
  it("atenuación moderada (18–24 dB), nunca el máximo; sin posfiltro", () => {
    expect(m.ATENUACION_DF_DB).toBeGreaterThanOrEqual(18);
    expect(m.ATENUACION_DF_DB).toBeLessThanOrEqual(24);
    expect(m.ATENUACION_DF_DB).not.toBe(100);
    expect(m.POSFILTRO_DF).toBe(0);
    expect(df).toContain("attenuationLimit: ATENUACION_DF_DB");
  });

  it("un bloque es «lento» según lo que dura de verdad el bloque del equipo, no a partir de 8 ms", () => {
    expect(m.umbralLentoMs(undefined)).toBeCloseTo(2.13, 1); // 128 muestras a 48 kHz = 2,67 ms → 80 %
    expect(m.umbralLentoMs(0.01)).toBeCloseTo(8, 1); // bloques de 10 ms → 8 ms
    expect(m.umbralLentoMs(0.5)).toBe(8); // tope
    expect(df).toContain("umbralLentoMs: umbral");
    expect(m.workletDeepFilter("this.#ready = true; this.#ready = false; registerProcessor(PROCESSOR_NAME, DeepFilterProcessor);"))
      .toContain("if (d > this.umbral) this.lentos++;");
  });
});

describe("llamada_salud anota qué filtro corre y por qué", () => {
  it("cada muestra lleva nc (el motor) y nc_info (por qué no DeepFilterNet, carga, filtro del navegador)", () => {
    expect(livekit).toContain("const ncInfo = leerInfoNC(room);");
    expect(livekit).toContain("nc_info: { ...(ncInfo ?? {}), ruido_usuario:");
    expect(cadena).toMatch(/get info\(\): InfoNC \{ return \{ sin_df:/);
  });
});
