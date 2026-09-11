import { describe, it, expect, afterEach } from "vitest";
import { armarCadenaNC, filtroTrabado, rmsDe, REVISIONES_MUDAS_PARA_FALLAR } from "@/lib/noise-suppression-processor";

// Andrea (10/09): compartió pantalla y la otra persona dejó de oírla, con el
// micrófono "activo". El micrófono pasa por el AudioContext de la cancelación
// de ruido: si ese contexto no corre, lo que sale es silencio y LiveKit lo
// publica igual. Estas guardas fijan que el filtro NO se instala en ese estado
// y que la mudez con voz a la entrada se detecta.

const instancias: ContextoQueNoArranca[] = [];
class ContextoQueNoArranca {
  state = "suspended";
  cerrado = false;
  constructor() { instancias.push(this); }
  async resume() { throw new Error("sin gesto del usuario"); }
  async close() { this.cerrado = true; this.state = "closed"; }
}

describe("la cancelación de ruido no publica silencio", () => {
  const original = globalThis.AudioContext;
  afterEach(() => { (globalThis as { AudioContext?: unknown }).AudioContext = original; instancias.length = 0; });

  it("si el AudioContext no arranca, armar la cadena falla y el contexto se cierra", async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = ContextoQueNoArranca;
    await expect(armarCadenaNC({} as MediaStreamTrack)).rejects.toThrow(/no arrancó/);
    expect(instancias).toHaveLength(1);
    expect(instancias[0].cerrado).toBe(true);
  });

  it("voz a la entrada y nada a la salida, ocho veces seguidas, es filtro trabado", () => {
    let seguidas = 0;
    for (let i = 0; i < REVISIONES_MUDAS_PARA_FALLAR - 1; i++) {
      const v = filtroTrabado(0.1, 0, seguidas);
      seguidas = v.seguidas;
      expect(v.trabado).toBe(false);
    }
    expect(filtroTrabado(0.1, 0, seguidas).trabado).toBe(true);
  });

  it("silencio a la entrada, o salida con algo, reinicia la cuenta", () => {
    expect(filtroTrabado(0.001, 0, 5)).toEqual({ seguidas: 0, trabado: false });
    expect(filtroTrabado(0.1, 0.01, 5)).toEqual({ seguidas: 0, trabado: false });
  });

  it("rmsDe: cero para silencio, la amplitud para una constante", () => {
    expect(rmsDe(new Float32Array(8))).toBe(0);
    expect(rmsDe(new Float32Array(8).fill(0.5))).toBeCloseTo(0.5);
  });
});
