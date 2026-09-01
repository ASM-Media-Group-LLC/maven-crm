import { describe, it, expect } from "vitest";
import {
  actualizarPiso, coeficienteSubida, PISO_MINIMO, RATIO_PUERTA, type EstadoPiso,
} from "@/lib/pisoDeRuido";

// EL BUG (01/09/2026): el piso de ruido de la puerta del NC solo se adaptaba
// hacia ABAJO. Si el ambiente empeoraba (ventilador, calle), el umbral quedaba
// viejo, la puerta se quedaba abierta para siempre y el gate no hacía nada.
//
// ⚠️ Este archivo fija la regla; el worklet lleva un PORT FIEL de la misma
// (los AudioWorklet no importan módulos). Si estos tests cambian, el worklet
// tiene que cambiar igual.

// Frames de 128 muestras a 48 kHz, como en el worklet.
const SR = 48_000;
const N = 128;
const COEF = coeficienteSubida(N, SR);
const FRAMES_POR_SEG = SR / N; // 375

function correr(estado: EstadoPiso, rms: number, frames: number): EstadoPiso {
  let e = estado;
  for (let i = 0; i < frames; i++) e = actualizarPiso(e, rms, COEF);
  return e;
}

const INICIAL: EstadoPiso = { piso: 0.004, minimo: 0.004 };

describe("el piso SUBE con ruido sostenido (el bug)", () => {
  it("un ventilador constante por encima del umbral termina levantando el piso", () => {
    // 0.05 está muy por encima del umbral inicial (0.004*2=0.008): con la regla
    // vieja el piso jamás se movía y la puerta quedaba abierta para siempre.
    const ruido = 0.05;
    const despues = correr(INICIAL, ruido, Math.round(FRAMES_POR_SEG * 60)); // 1 minuto
    // Tras un minuto el piso siguió al ruido: el umbral ya lo tapa.
    expect(despues.piso).toBeGreaterThan(ruido * 0.9);
  });

  it("pero sube LENTO: en un par de segundos casi no se mueve", () => {
    // Si subiera rápido, cualquier frase larga inflaría el piso y taparía la voz.
    const despues = correr(INICIAL, 0.05, Math.round(FRAMES_POR_SEG * 2));
    expect(despues.piso).toBeLessThan(0.012);
  });
});

describe("la voz NO infla el piso", () => {
  it("habla a ráfagas (frases con pausas) deja el piso donde estaba", () => {
    // 3 s hablando fuerte, 0.7 s de pausa al nivel del ambiente, repetido.
    let e = INICIAL;
    for (let ciclo = 0; ciclo < 20; ciclo++) {
      e = correr(e, 0.12, Math.round(FRAMES_POR_SEG * 3));   // frase
      e = correr(e, 0.003, Math.round(FRAMES_POR_SEG * 0.7)); // pausa
    }
    // ~74 s de conversación: el piso encuentra un equilibrio (sube un poco en
    // cada frase, las pausas lo bajan a la mitad) que queda MUY por debajo de
    // la voz: el umbral resultante sigue abriendo la puerta al hablar.
    expect(e.piso).toBeLessThan(0.02);
    expect(e.piso * RATIO_PUERTA).toBeLessThan(0.12 / 2); // umbral « voz
  });
});

describe("lo que ya funcionaba sigue igual", () => {
  it("hacia abajo adapta rápido: al volver el silencio, el piso baja", () => {
    // Piso alto (quedó de un ruido que ya se fue) y ambiente de vuelta quieto.
    const alto: EstadoPiso = { piso: 0.05, minimo: 0.001 };
    const despues = correr(alto, 0.001, Math.round(FRAMES_POR_SEG * 5));
    expect(despues.piso).toBeLessThan(0.005);
  });

  it("nunca baja del mínimo absoluto", () => {
    const e = correr(INICIAL, 0, Math.round(FRAMES_POR_SEG * 30));
    expect(e.piso).toBeGreaterThanOrEqual(PISO_MINIMO);
  });

  it("el umbral de la puerta sigue siendo piso × ratio", () => {
    expect(RATIO_PUERTA).toBe(2.0);
  });
});
