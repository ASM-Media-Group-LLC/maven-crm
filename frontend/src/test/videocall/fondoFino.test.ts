import { describe, it, expect } from "vitest";
import {
  equipoAguantaFondoHD, perfilDeCamaraConFondo, cadaCuantosCuadrosSegmentar,
  PERFIL_FONDO_HD, PERFIL_FONDO_LIVIANO, NUCLEOS_PARA_FONDO_HD,
} from "@/lib/fondoDeLlamada";
import {
  factorDeSuavizado, suavizarPixel, pesosGaussianos, sigmaEnTextura, muestrasPorLado,
  alfaDelBorde, uvParaCubrir, CURVA_BORDE_BLUR, SUAVIZADO_MIN, SUAVIZADO_MAX,
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
    expect(alfaDelBorde(0.5, CURVA_BORDE_BLUR)).toBeCloseTo(0.5);
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
