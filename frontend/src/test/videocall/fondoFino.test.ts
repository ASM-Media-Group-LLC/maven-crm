import { describe, it, expect } from "vitest";
import {
  equipoAguantaFondoHD, perfilDeCamaraConFondo, cadaCuantosCuadrosSegmentar,
  PERFIL_FONDO_HD, PERFIL_FONDO_LIVIANO, NUCLEOS_PARA_FONDO_HD,
} from "@/lib/fondoDeLlamada";
import {
  factorDeSuavizado, suavizarPixel, pesosGaussianos, sigmaEnTextura, muestrasPorLado,
  alfaDelBorde, uvParaCubrir, CURVA_BORDE_BLUR, SUAVIZADO_MIN, SUAVIZADO_MAX,
  alfaDelBordeEnPantalla, ANCHO_MIN_DEL_BORDE, SUAVIZADO_BAJADA_MAX,
  ritmoDelDetector, promedioMovil, PRESUPUESTO_MS, CADA_CUANTOS_MAX,
} from "@/lib/fondoFino/parametros";

// El fondo fino de las llamadas (Alvaro, 17/11/2026): caras en HD con el blur
// en equipos fuertes, dos niveles como Meet y un borde que no parpadea.

const PC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const CEL = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";

describe("cámara con fondo: HD solo donde aguanta", () => {
  it("8 núcleos o más → 720p a 30 cuadros", () => {
    expect(NUCLEOS_PARA_FONDO_HD).toBe(8);
    expect(perfilDeCamaraConFondo({ hardwareConcurrency: 8, userAgent: PC })).toBe(PERFIL_FONDO_HD);
    expect(PERFIL_FONDO_HD.height.ideal).toBe(720);
    expect(PERFIL_FONDO_HD.frameRate.ideal).toBe(30);
  });

  it("menos núcleos, sin dato o celular → el liviano de siempre (540p a 15)", () => {
    expect(perfilDeCamaraConFondo({ hardwareConcurrency: 4, userAgent: PC })).toBe(PERFIL_FONDO_LIVIANO);
    expect(perfilDeCamaraConFondo({ userAgent: PC })).toBe(PERFIL_FONDO_LIVIANO);
    expect(perfilDeCamaraConFondo({ hardwareConcurrency: 8, userAgent: CEL })).toBe(PERFIL_FONDO_LIVIANO);
    expect(PERFIL_FONDO_LIVIANO.height.ideal).toBe(540);
    expect(PERFIL_FONDO_LIVIANO.frameRate.ideal).toBe(15);
  });

  it("el detector corre en todos los cuadros en los fuertes y uno sí, uno no en los flojos", () => {
    expect(equipoAguantaFondoHD({ hardwareConcurrency: 12, userAgent: PC })).toBe(true);
    expect(cadaCuantosCuadrosSegmentar({ hardwareConcurrency: 12, userAgent: PC })).toBe(1);
    expect(cadaCuantosCuadrosSegmentar({ hardwareConcurrency: 4, userAgent: PC })).toBe(2);
  });
});

describe("suavizado de la máscara en el tiempo", () => {
  it("un temblor chico del detector casi no pasa (no parpadea)", () => {
    // El borde oscila 0,50 ↔ 0,56 cuadro a cuadro: la máscara suavizada se
    // mueve bastante menos que la detectada.
    let m = 0.5;
    const salidas: number[] = [];
    for (let i = 0; i < 30; i++) {
      m = suavizarPixel(m, i % 2 ? 0.56 : 0.5);
      salidas.push(m);
    }
    const oscilacion = Math.max(...salidas.slice(10)) - Math.min(...salidas.slice(10));
    expect(oscilacion).toBeLessThan(0.06 * 0.6);
  });

  it("un cambio grande (te moviste) pasa casi entero en un cuadro: la silueta no se arrastra", () => {
    expect(factorDeSuavizado(1)).toBeCloseTo(SUAVIZADO_MAX);
    expect(suavizarPixel(0, 1)).toBeGreaterThan(0.9);
    expect(factorDeSuavizado(0)).toBeCloseTo(SUAVIZADO_MIN);
  });

  it("un cuadro malo suelto del detector NO borra la cara (18/11)", () => {
    // Persona segura (1), el detector la pierde UN cuadro (0) y vuelve (1).
    const malo = suavizarPixel(1, 0);
    expect(SUAVIZADO_BAJADA_MAX).toBeLessThanOrEqual(0.5);
    expect(malo).toBeGreaterThanOrEqual(0.5);
    // Sigue siendo persona para la curva del borde (casi entera).
    expect(alfaDelBorde(malo, CURVA_BORDE_BLUR)).toBeGreaterThan(0.6);
    // Y al cuadro siguiente vuelve casi entera.
    expect(suavizarPixel(malo, 1)).toBeGreaterThan(0.95);
  });

  it("si de verdad te fuiste, el rastro dura poco (≤ 3 cuadros)", () => {
    let m = 1;
    for (let i = 0; i < 3; i++) m = suavizarPixel(m, 0);
    expect(alfaDelBorde(m, CURVA_BORDE_BLUR)).toBe(0);
  });

  it("segmentando cada 2 cuadros, cada máscara pesa más (alcanza igual de rápido)", () => {
    expect(factorDeSuavizado(0, 2)).toBeGreaterThan(factorDeSuavizado(0, 1));
    // Dos pasos de 1 cuadro = un paso de 2 cuadros con el mismo cambio chico.
    const dosPasos = suavizarPixel(suavizarPixel(0, 0.05), 0.05);
    expect(suavizarPixel(0, 0.05, 2)).toBeCloseTo(dosPasos, 2);
  });
});

describe("desenfoque y borde", () => {
  it("la sigma se escala con el alto de la cámara (se ve igual a 540p y a 720p)", () => {
    expect(sigmaEnTextura(24, 720)).toBeCloseTo(6);
    expect(sigmaEnTextura(24, 540)).toBeCloseTo(4.5);
  });

  it("los pesos del gaussiano suman 1 y bajan del centro hacia afuera", () => {
    const p = pesosGaussianos(6);
    expect(p.length).toBe(muestrasPorLado(6) + 1);
    expect(p[0] + 2 * p.slice(1).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeLessThan(p[i - 1]);
  });

  it("la curva del borde deja fondo puro, persona pura y una transición suave", () => {
    expect(alfaDelBorde(0.1, CURVA_BORDE_BLUR)).toBe(0);
    expect(alfaDelBorde(0.9, CURVA_BORDE_BLUR)).toBe(1);
    const centro = (CURVA_BORDE_BLUR.desde + CURVA_BORDE_BLUR.hasta) / 2;
    expect(alfaDelBorde(centro, CURVA_BORDE_BLUR)).toBeCloseTo(0.5);
  });

  it("con el desenfoque, ante la duda es persona (centro de la curva bajo 0,5, como Meet)", () => {
    expect((CURVA_BORDE_BLUR.desde + CURVA_BORDE_BLUR.hasta) / 2).toBeLessThan(0.5);
    expect(alfaDelBorde(0.5, CURVA_BORDE_BLUR)).toBeGreaterThan(0.6);
  });

  it("donde el detector duda (máscara plana) el borde no es un corte a tijera que titila", () => {
    // fwidth ≈ 0: un temblor de ±0,02 alrededor del centro.
    const c = (CURVA_BORDE_BLUR.desde + CURVA_BORDE_BLUR.hasta) / 2;
    const salto = alfaDelBordeEnPantalla(c + 0.02, CURVA_BORDE_BLUR, 0) - alfaDelBordeEnPantalla(c - 0.02, CURVA_BORDE_BLUR, 0);
    expect(ANCHO_MIN_DEL_BORDE).toBeGreaterThanOrEqual(0.06);
    expect(salto).toBeLessThan(0.4);
    // Con un borde marcado (fwidth grande) sigue siendo nítido: la curva entera.
    expect(alfaDelBordeEnPantalla(CURVA_BORDE_BLUR.hasta, CURVA_BORDE_BLUR, 0.5)).toBe(1);
  });

  it("la imagen de fondo cubre el cuadro sin estirarse", () => {
    // Imagen 4:3 en cámara 16:9: se recorta arriba y abajo, centrada.
    const c = uvParaCubrir(1600, 1200, 1280, 720);
    expect(c.escalaX).toBe(1);
    expect(c.escalaY).toBeCloseTo((1600 / 1200) / (1280 / 720));
    expect(c.corrY).toBeCloseTo((1 - c.escalaY) / 2);
    // Imagen panorámica: se recortan los costados.
    const d = uvParaCubrir(3000, 1000, 1280, 720);
    expect(d.escalaY).toBe(1);
    expect(d.corrX).toBeGreaterThan(0);
  });
});

describe("ritmo del detector según el equipo (cámara que no se traba)", () => {
  it("equipo fuerte: detector en todos los cuadros y borde por color", () => {
    expect(ritmoDelDetector({ detectorMs: 4, dibujoMs: 2, base: 1 })).toEqual({ cadaCuantos: 1, mate: true });
  });

  it("equipo justo: el detector pasa a uno de cada 2 o 3 para entrar en el presupuesto", () => {
    const r = ritmoDelDetector({ detectorMs: 14, dibujoMs: 4, base: 1 });
    expect(r.cadaCuantos).toBe(2);
    expect(4 + 14 / r.cadaCuantos).toBeLessThanOrEqual(PRESUPUESTO_MS);
    expect(ritmoDelDetector({ detectorMs: 20, dibujoMs: 4, base: 1 }).cadaCuantos).toBe(3);
  });

  it("equipo flojo: nunca menos de uno de cada 3, y se apaga el borde por color", () => {
    const r = ritmoDelDetector({ detectorMs: 40, dibujoMs: 10, base: 1 });
    expect(r.cadaCuantos).toBe(CADA_CUANTOS_MAX);
    expect(CADA_CUANTOS_MAX).toBeLessThanOrEqual(3);
    expect(r.mate).toBe(false);
  });

  it("respeta el piso que da la regla de los núcleos", () => {
    expect(ritmoDelDetector({ detectorMs: 1, dibujoMs: 1, base: 2 }).cadaCuantos).toBe(2);
  });

  it("el promedio no salta con un pico suelto", () => {
    expect(promedioMovil(0, 8)).toBe(8);
    expect(promedioMovil(5, 50)).toBeLessThan(10);
  });
});

const fuenteProcesador = import.meta.glob("../../lib/fondoFino/procesador.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fuentePipeline = import.meta.glob("../../lib/fondoFino/pipelineGL.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const procesador = Object.values(fuenteProcesador)[0];
const pipeline = Object.values(fuentePipeline)[0];

describe("guarda: el procesador no borra la cara ni traba la cámara (18/11)", () => {
  it("sin máscara se segmenta siempre (nunca se dibuja todo como fondo)", () => {
    expect(procesador).toContain("!this.pipeline.tieneMascara()");
  });

  it("el ritmo se mide y se ajusta solo", () => {
    expect(procesador).toContain("this.medirRitmo(");
    expect(procesador).toContain("ritmoDelDetector(");
  });

  it("el shader usa el suavizado asimétrico, el piso del borde y la protección de la persona", () => {
    expect(pipeline).toContain("bajadaMax");
    expect(pipeline).toContain("ANCHO_MIN_DEL_BORDE");
    expect(pipeline).toContain("PERSONA_SEGURA");
    expect(pipeline).toContain("BAJADA_MAX_DEL_COLOR");
  });
});

// Guarda: la llamada y el lobby usan NUESTRO procesador y la regla de HD.
const fuenteLivekit = import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const fuenteLobby = import.meta.glob("../../pages/messenger/videocall/PreJoinLobby.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const livekit = Object.values(fuenteLivekit)[0];
const lobby = Object.values(fuenteLobby)[0];

describe("guarda: la llamada usa el fondo fino", () => {
  it("useLiveKit y el lobby crean ProcesadorDeFondo, no el BackgroundProcessor del paquete", () => {
    for (const f of [livekit, lobby]) {
      expect(f).toContain('from "@/lib/fondoFino/procesador"');
      expect(f).toContain('ProcesadorDeFondo({ mode: "disabled" })');
      expect(f).not.toMatch(/from "@livekit\/track-processors"/);
    }
  });

  it("la cámara con fondo sale de perfilDeCamaraConFondo (HD en equipos fuertes)", () => {
    expect(livekit).toContain("perfilDeCamaraConFondo()");
    expect(livekit).not.toContain("BACKGROUND_SAFE_VIDEO_CONSTRAINTS");
  });
});
